import { prisma } from '../../server';
import { whatsappClient, WhatsAppClient } from '../../lib/whatsapp';
import { emitToTenant } from '../../lib/socket';

export class NpsService {
    /** Envia a lista de NPS (notas de 10 a 1) com a mensagem configurada. */
    private static async sendNpsList(
        ticket: { id: string; contact: { phone: string } },
        npsMessage: string
    ) {
        const rows: Array<{ id: string; title: string }> = [];
        for (let n = 10; n >= 1; n--) rows.push({ id: `nps_${n}`, title: String(n) });
        const client = await WhatsAppClient.getClientForTicket(ticket.id);
        await client.sendListMessage(
            ticket.contact.phone,
            npsMessage,
            'Avaliar',
            [{ title: 'Notas', rows }]
        );
    }

    /**
     * Initiate NPS: change ticket to PENDING_NPS and send rating message.
     */
    static async initiateNps(ticketId: string) {
        const ticket = await prisma.ticket.findUnique({
            where: { id: ticketId },
            include: { contact: true, user: true },
        });

        if (!ticket) throw new Error('Ticket não encontrado');

        const settings = await prisma.accountSettings.findFirst({ where: { tenantId: ticket.tenantId } });
        if (!settings?.npsEnabled) {
            // NPS disabled — close directly
            return this.closeTicketDirectly(ticketId);
        }

        // Update ticket to PENDING_NPS
        const updated = await prisma.ticket.update({
            where: { id: ticketId },
            data: { status: 'PENDING_NPS' },
            include: { contact: true, department: true, user: true },
        });

        emitToTenant(updated.tenantId, 'ticket:updated', updated);

        // Send NPS list via WhatsApp
        const npsMessage = settings.npsMessage || 'Por favor, avalie nosso atendimento de 1 a 10:';
        try {
            await this.sendNpsList(updated, npsMessage);
        } catch (e) {
            console.error('[NPS] Failed to send NPS list:', e);
        }

        // Save system message
        await prisma.message.create({
            data: {
                ticketId,
                body: `📊 ${npsMessage}`,
                origin: 'SYSTEM',
            },
        });

        return updated;
    }

    /**
     * Handle an NPS response from the customer (1-10 numeric).
     * Returns true if the message was an NPS response.
     */
    static async handleNpsResponse(ticketId: string, messageBody: string, buttonId?: string): Promise<boolean> {
        const ticket = await prisma.ticket.findUnique({
            where: { id: ticketId },
            include: { contact: true },
        });

        if (!ticket || ticket.status !== 'PENDING_NPS') return false;

        const trimmed = messageBody.trim();
        // Nota vem do rowId da lista (nps_N) ou, como fallback, de um número digitado.
        const score = buttonId && buttonId.startsWith('nps_')
            ? parseInt(buttonId.slice(4), 10)
            : parseInt(trimmed, 10);

        if (isNaN(score) || score < 1 || score > 10) {
            // Resposta inválida — reenvia a lista
            try {
                const settings = await prisma.accountSettings.findFirst({ where: { tenantId: ticket.tenantId } });
                const npsMessage = settings?.npsMessage || 'Por favor, avalie nosso atendimento de 1 a 10:';
                await this.sendNpsList(ticket, npsMessage);
            } catch { }
            return true; // Still consumed the message
        }

        // Comentário só quando digitado (lista não traz texto extra)
        const parts = trimmed.split(/\s+/);
        const comment = !buttonId && parts.length > 1 ? parts.slice(1).join(' ') : null;

        // Save NPS rating
        await prisma.npsRating.create({
            data: {
                ticketId,
                contactId: ticket.contactId,
                agentId: ticket.userId,
                score,
                comment,
                tenantId: ticket.tenantId,
            },
        });

        // Thank the customer
        try {
            const client = await WhatsAppClient.getClientForTicket(ticketId);
            await client.sendTextMessage(
                ticket.contact.phone,
                `Obrigado pela avaliação! Sua nota ${score} foi registrada. 😊`
            );
        } catch { }

        // Close the ticket
        await this.closeTicketDirectly(ticketId);

        // Save system message
        await prisma.message.create({
            data: {
                ticketId,
                body: `⭐ NPS: ${score}/10${comment ? ` — "${comment}"` : ''}`,
                origin: 'SYSTEM',
            },
        });

        return true;
    }

    /**
     * Close a ticket directly (bypassing NPS).
     */
    static async closeTicketDirectly(ticketId: string) {
        const ticket = await prisma.ticket.update({
            where: { id: ticketId },
            data: { status: 'CLOSED', closedAt: new Date() },
            include: { contact: true, department: true, user: true },
        });

        emitToTenant(ticket.tenantId, 'ticket:updated', ticket);

        // Process queue
        if (ticket.departmentId) {
            try {
                const { RoutingService } = await import('../routing/routing.service');
                setTimeout(() => RoutingService.processQueue(ticket.departmentId!).catch(() => { }), 500);
            } catch { }
        }

        return ticket;
    }
}
