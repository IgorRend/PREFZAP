import { prisma } from '../../server';

type AutoDistribute = 'NONE' | 'BALANCE' | 'RANDOM' | 'ROUND_ROBIN';

export class RoutingService {
    /**
     * Routes a ticket to a department using the configured distribution strategy.
     * If no strategy is provided, reads from AccountSettings.
     */
    static async routeToDepartment(
        ticketId: string,
        departmentId: string,
        autoDistribute?: AutoDistribute
    ) {
        const { TicketsService } = await import('../tickets/tickets.service');
        const { MessagesService } = await import('../messages/messages.service');

        // Load strategy from settings if not provided
        if (!autoDistribute) {
            const ticket = await prisma.ticket.findUnique({
                where: { id: ticketId },
                select: { tenantId: true },
            });
            const { SettingsService } = await import('../settings/settings.service');
            const settings = ticket ? await SettingsService.get(ticket.tenantId) : null;
            autoDistribute = (settings?.autoDistribute as AutoDistribute) || 'ROUND_ROBIN';
        }

        if (autoDistribute === 'NONE') {
            await TicketsService.updateStatus(ticketId, 'QUEUE', { departmentId });
            await MessagesService.createSystemMessage(ticketId, 'Ticket transferido para a fila do setor.');
            return;
        }

        // Get online agents in the department
        const departmentUsers = await prisma.userDepartment.findMany({
            where: { departmentId },
            include: { user: true },
        });

        // Route ONLY to online agents — no fallback to offline. If nobody is online,
        // the ticket waits in queue and is picked up when an agent connects
        // (see processQueue trigger in lib/socket.ts on connection).
        const candidates = departmentUsers.filter(du => du.user.online);

        if (candidates.length === 0) {
            await TicketsService.updateStatus(ticketId, 'QUEUE', { departmentId });
            await MessagesService.createSystemMessage(ticketId, 'Nenhum atendente online no momento. Ticket na fila.');
            return;
        }

        // Count OPEN tickets per agent and check capacity
        const agentStats = await Promise.all(
            candidates.map(async (du) => {
                const openCount = await prisma.ticket.count({
                    where: { userId: du.userId, status: 'OPEN' },
                });
                return {
                    userId: du.userId,
                    name: du.user.name,
                    openCount,
                    maxConcurrentChats: du.user.maxConcurrentChats,
                    lastAssignedAt: du.user.lastAssignedAt,
                    isAvailable: openCount < du.user.maxConcurrentChats,
                };
            })
        );

        const availableAgents = agentStats.filter(a => a.isAvailable);

        if (availableAgents.length === 0) {
            // All agents at capacity — send to queue with wait message
            await TicketsService.updateStatus(ticketId, 'QUEUE', { departmentId });
            await MessagesService.createSystemMessage(
                ticketId,
                'Todos os atendentes estão em capacidade máxima. Você está na fila de espera e será atendido em breve.'
            );
            return;
        }

        let selectedAgent: typeof agentStats[0] | null = null;

        switch (autoDistribute) {
            case 'ROUND_ROBIN':
                // Sort by lastAssignedAt ASC — the agent who hasn't received a chat the longest goes first
                availableAgents.sort((a, b) => {
                    const aTime = a.lastAssignedAt ? new Date(a.lastAssignedAt).getTime() : 0;
                    const bTime = b.lastAssignedAt ? new Date(b.lastAssignedAt).getTime() : 0;
                    return aTime - bTime;
                });
                selectedAgent = availableAgents[0];
                break;

            case 'BALANCE':
                // Agent with fewest open tickets
                availableAgents.sort((a, b) => a.openCount - b.openCount);
                selectedAgent = availableAgents[0];
                break;

            case 'RANDOM':
                const idx = Math.floor(Math.random() * availableAgents.length);
                selectedAgent = availableAgents[idx];
                break;
        }

        if (selectedAgent) {
            await TicketsService.updateStatus(ticketId, 'OPEN', {
                departmentId,
                userId: selectedAgent.userId,
            });
            // Update lastAssignedAt for round-robin tracking
            await prisma.user.update({
                where: { id: selectedAgent.userId },
                data: { lastAssignedAt: new Date() },
            });
            await MessagesService.createSystemMessage(
                ticketId,
                `Ticket atribuído automaticamente a ${selectedAgent.name}.`
            );
        } else {
            await TicketsService.updateStatus(ticketId, 'QUEUE', { departmentId });
        }
    }

    /**
     * Routes a ticket directly to a specific user.
     */
    static async routeToUser(ticketId: string, userId: string) {
        const { TicketsService } = await import('../tickets/tickets.service');
        const { MessagesService } = await import('../messages/messages.service');

        const user = await prisma.user.findUnique({ where: { id: userId } });
        await TicketsService.updateStatus(ticketId, 'OPEN', { userId });
        await prisma.user.update({
            where: { id: userId },
            data: { lastAssignedAt: new Date() },
        });
        await MessagesService.createSystemMessage(
            ticketId,
            `Ticket atribuído a ${user?.name || 'atendente'}.`
        );
    }

    /**
     * Try to assign queued tickets when an agent becomes available.
     * Called when an agent closes a ticket or comes online.
     */
    static async processQueue(departmentId?: string) {
        const where: any = { status: 'QUEUE' };
        if (departmentId) where.departmentId = departmentId;

        const queuedTickets = await prisma.ticket.findMany({
            where,
            orderBy: { createdAt: 'asc' },
            take: 10,
        });

        for (const ticket of queuedTickets) {
            if (ticket.departmentId) {
                await this.routeToDepartment(ticket.id, ticket.departmentId);
            }
        }
    }
}
