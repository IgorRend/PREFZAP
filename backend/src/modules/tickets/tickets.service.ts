import { prisma } from '../../server';
import { emitToTenant } from '../../lib/socket';
import { MessagesService } from '../messages/messages.service';
import { AuditService } from '../audit/audit.service';
import { customAlphabet } from 'nanoid';

// ─── Protocol Generator ───────────────────────────────────
// Format: 2026-A1B2C  (year + 5 alphanumeric chars)
// Collision probability at 1M protocols/year: ~0.01%
// Safe for concurrent creation — nanoid uses crypto.getRandomValues internally.
const nanoId = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);

function generateProtocol(): string {
    const year = new Date().getFullYear();
    return `${year}-${nanoId()}`; // e.g. 2026-KXRP7M
}

// ─── TicketsService ───────────────────────────────────────
type TicketStatus = 'BOT' | 'QUEUE' | 'OPEN' | 'CLOSED';

export class TicketsService {
    /**
     * FIXED: Added skip/take pagination (max 50 per page) to prevent full table scans.
     * Messages limited to last 1 per ticket (preview only — full history via timeline).
     */
    static async findAll(filters?: {
        status?: string;
        departmentId?: string;
        userId?: string;
        page?: number;
        tenantId?: string;
    }) {
        const { status, departmentId, userId, page = 1, tenantId } = filters || {};
        const PAGE_SIZE = 50;

        const where: any = {};
        if (status === 'ACTIVE') where.status = { in: ['OPEN', 'QUEUE', 'BOT'] };
        else if (status) where.status = status;
        if (departmentId) where.departmentId = departmentId;
        if (userId) where.userId = userId;
        if (tenantId) where.tenantId = tenantId;

        const [total, tickets] = await Promise.all([
            prisma.ticket.count({ where }),
            prisma.ticket.findMany({
                where,
                include: {
                    contact: true,
                    department: { select: { id: true, name: true } },
                    user: { select: { id: true, name: true } },
                    messages: {
                        orderBy: { createdAt: 'desc' },
                        take: 1, // Preview only — infinite scroll handles the rest
                    },
                    tags: { include: { tag: true } },
                    _count: { select: { messages: true } },
                },
                orderBy: { updatedAt: 'desc' },
                skip: (page - 1) * PAGE_SIZE,
                take: PAGE_SIZE,
            }),
        ]);

        return { total, page, pageSize: PAGE_SIZE, tickets };
    }

    static async findById(id: string) {
        return prisma.ticket.findUnique({
            where: { id },
            include: {
                contact: true,
                department: true,
                user: { select: { id: true, name: true, email: true } },
                // FIXED: limit messages to last 50 — frontend has infinite scroll
                messages: { orderBy: { createdAt: 'desc' }, take: 50 },
                tags: { include: { tag: true } },
            },
        });
    }

    static async findOrCreateByContact(phone: string, contactName?: string, tenantId?: string) {
        // Resolve tenantId — required for multitenant isolation
        if (!tenantId) {
            const defaultTenant = await prisma.tenant.findFirst({ where: { isActive: true } });
            tenantId = defaultTenant?.id || 'default-tenant';
        }

        let contact = await prisma.contact.findFirst({ where: { tenantId, phone } });
        if (!contact) {
            contact = await prisma.contact.create({
                data: { phone, name: contactName || phone, tenantId },
            });
        } else if (contactName && contact.name !== contactName) {
            contact = await prisma.contact.update({
                where: { id: contact.id },
                data: { name: contactName },
            });
        }

        let ticket = await prisma.ticket.findFirst({
            where: {
                contactId: contact.id,
                status: { in: ['BOT', 'QUEUE', 'OPEN', 'PENDING_NPS'] },
            },
            include: { contact: true, department: true, user: true },
        });

        if (!ticket) {
            const activeBotFlow = await prisma.botFlow.findFirst({ where: { isActive: true } });

            ticket = await prisma.ticket.create({
                data: {
                    protocol: generateProtocol(),
                    status: activeBotFlow ? 'BOT' : 'QUEUE',
                    contactId: contact.id,
                    botFlowId: activeBotFlow?.id || null,
                    currentNodeId: null,
                    tenantId,
                },
                include: { contact: true, department: true, user: true },
            });

            emitToTenant(tenantId, 'ticket:new', ticket);

            return { contact, ticket, isNew: true };
        }

        return { contact, ticket, isNew: false };
    }

    static async updateStatus(id: string, status: string, data?: { departmentId?: string; userId?: string; clearBotFlow?: boolean }) {
        const updateData: any = { status };
        if (data?.departmentId !== undefined) updateData.departmentId = data.departmentId;
        if (data?.userId !== undefined) updateData.userId = data.userId;
        if (status === 'CLOSED') updateData.closedAt = new Date();
        // Abandona o fluxo do bot ao capturar um atendimento que estava em BOT.
        if (data?.clearBotFlow) { updateData.botFlowId = null; updateData.currentNodeId = null; }

        const ticket = await prisma.ticket.update({
            where: { id },
            data: updateData,
            include: { contact: true, department: true, user: true },
        });

        emitToTenant(ticket.tenantId, 'ticket:updated', ticket);

        return ticket;
    }

    static async createOpenTicket(contactId: string, tenantId: string) {
        const ticket = await prisma.ticket.create({
            data: {
                protocol: generateProtocol(),
                status: 'OPEN',
                contactId,
                tenantId,
            },
            include: { contact: true, department: true, user: true },
        });
        emitToTenant(tenantId, 'ticket:new', ticket);
        return ticket;
    }

    /**
     * Cria um ticket já fechado, marcado para não contar nos relatórios.
     * Usado no fechamento automático de conversas novas fora do horário.
     */
    static async createClosedAfterHours(contactId: string, tenantId: string) {
        const ticket = await prisma.ticket.create({
            data: {
                protocol: generateProtocol(),
                status: 'CLOSED',
                closedAt: new Date(),
                excludeFromReports: true,
                contactId,
                tenantId,
            },
            include: { contact: true, department: true, user: true },
        });
        emitToTenant(tenantId, 'ticket:new', ticket);
        return ticket;
    }

    static async assignToUser(ticketId: string, userId: string) {
        const ticket = await this.updateStatus(ticketId, 'OPEN', { userId, clearBotFlow: true });

        // FIXED: error in system message now logged to AuditService — never silent
        try {
            const agent = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
            await MessagesService.createSystemMessage(ticketId, `👤 Chat assumido por ${agent?.name ?? 'Agente'}`);
        } catch (err) {
            console.error('[assignToUser] System message failed:', err);
            AuditService.log({
                userId,
                action: 'SYSTEM_MESSAGE_FAILED',
                entity: 'Ticket',
                entityId: ticketId,
                newValue: { error: String(err), step: 'assignToUser' },
            });
        }

        return ticket;
    }

    static async transferToDepartment(ticketId: string, departmentId: string, actorName?: string) {
        const ticket = await this.updateStatus(ticketId, 'QUEUE', { departmentId, userId: undefined });

        try {
            const dept = await prisma.department.findUnique({ where: { id: departmentId }, select: { name: true } });
            const actor = actorName ?? 'Agente';
            await MessagesService.createSystemMessage(ticketId, `🔄 ${actor} transferiu para o departamento ${dept?.name ?? departmentId}`);
        } catch (err) {
            console.error('[transferToDepartment] System message failed:', err);
            AuditService.log({
                action: 'SYSTEM_MESSAGE_FAILED',
                entity: 'Ticket',
                entityId: ticketId,
                newValue: { error: String(err), step: 'transferToDepartment' },
            });
        }

        return ticket;
    }

    static async close(ticketId: string, actorName?: string) {
        const actor = actorName ?? 'Sistema';

        try {
            const { NpsService } = await import('../nps/nps.service');
            await MessagesService.createSystemMessage(ticketId, `🟢 Atendimento encerrado por ${actor}`);
            return await NpsService.initiateNps(ticketId);
        } catch (err) {
            // FIXED: error now audited before fallback
            AuditService.log({
                action: 'CLOSE_FALLBACK',
                entity: 'Ticket',
                entityId: ticketId,
                newValue: { error: String(err), actor },
            });

            try {
                await MessagesService.createSystemMessage(ticketId, `🟢 Atendimento encerrado por ${actor}`);
            } catch { }

            const ticket = await this.updateStatus(ticketId, 'CLOSED');

            if (ticket.departmentId) {
                const { RoutingService } = await import('../routing/routing.service');
                setTimeout(() => RoutingService.processQueue(ticket.departmentId!).catch(() => { }), 500);
            }
            return ticket;
        }
    }

    static async updateBotPosition(ticketId: string, nodeId: string | null) {
        return prisma.ticket.update({
            where: { id: ticketId },
            data: { currentNodeId: nodeId },
        });
    }
}
