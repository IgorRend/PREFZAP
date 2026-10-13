import { prisma } from '../../server';

export class KanbanService {

    // ─── Boards ───────────────────────────────────────────

    static async listBoards() {
        return prisma.kanbanBoard.findMany({
            include: {
                columns: {
                    orderBy: { position: 'asc' },
                    include: {
                        _count: { select: { tickets: true } },
                    },
                },
            },
            orderBy: { createdAt: 'asc' },
        });
    }

    static async getBoard(id: string) {
        return prisma.kanbanBoard.findUnique({
            where: { id },
            include: {
                columns: {
                    orderBy: { position: 'asc' },
                    include: {
                        tickets: {
                            where: { status: { not: 'CLOSED' } },
                            orderBy: { updatedAt: 'desc' },
                            include: {
                                contact: { select: { id: true, name: true, fullName: true, phone: true, avatarUrl: true, channel: true } },
                                user: { select: { id: true, name: true } },
                                department: { select: { id: true, name: true } },
                                tags: { include: { tag: true } },
                                messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { body: true, origin: true, createdAt: true } },
                            },
                        },
                    },
                },
            },
        });
    }

    static async createBoard(data: { name: string; description?: string; tenantId: string }) {
        const board = await prisma.kanbanBoard.create({
            data: { name: data.name, description: data.description, tenantId: data.tenantId },
        });

        // Seed default columns
        const defaults = [
            { name: 'Fila', color: '#f59e0b', position: 0, columnType: 'start' },
            { name: 'Em andamento', color: '#6366f1', position: 1, columnType: 'default' },
            { name: 'Aguardando', color: '#ec4899', position: 2, columnType: 'default' },
            { name: 'Resolvido', color: '#22c55e', position: 3, columnType: 'end', autoStatus: 'CLOSED' },
        ];
        await prisma.kanbanColumn.createMany({
            data: defaults.map(d => ({ ...d, boardId: board.id })),
        });

        return prisma.kanbanBoard.findUnique({
            where: { id: board.id },
            include: { columns: { orderBy: { position: 'asc' } } },
        });
    }

    static async updateBoard(id: string, data: { name?: string; description?: string; isDefault?: boolean }) {
        // Only one default at a time
        if (data.isDefault) {
            await prisma.kanbanBoard.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
        }
        return prisma.kanbanBoard.update({ where: { id }, data });
    }

    static async deleteBoard(id: string) {
        // Detach all tickets from this board's columns first
        const columns = await prisma.kanbanColumn.findMany({ where: { boardId: id }, select: { id: true } });
        const colIds = columns.map(c => c.id);
        await prisma.ticket.updateMany({ where: { kanbanColumnId: { in: colIds } }, data: { kanbanColumnId: null } });
        return prisma.kanbanBoard.delete({ where: { id } });
    }

    // ─── Columns ──────────────────────────────────────────

    static async createColumn(boardId: string, data: { name: string; color?: string; position?: number; columnType?: string; autoStatus?: string }) {
        const maxPos = await prisma.kanbanColumn.aggregate({ where: { boardId }, _max: { position: true } });
        const nextPos = (maxPos._max.position ?? -1) + 1;
        return prisma.kanbanColumn.create({
            data: { boardId, name: data.name, color: data.color || '#6366f1', position: data.position ?? nextPos, columnType: data.columnType || 'default', autoStatus: data.autoStatus || null },
        });
    }

    static async updateColumn(id: string, data: { name?: string; color?: string; autoStatus?: string; columnType?: string }) {
        return prisma.kanbanColumn.update({ where: { id }, data });
    }

    static async deleteColumn(id: string) {
        await prisma.ticket.updateMany({ where: { kanbanColumnId: id }, data: { kanbanColumnId: null } });
        return prisma.kanbanColumn.delete({ where: { id } });
    }

    /**
     * Reorder columns: payload = [{ id, position }]
     */
    static async reorderColumns(boardId: string, order: { id: string; position: number }[]) {
        await prisma.$transaction(
            order.map(({ id, position }) =>
                prisma.kanbanColumn.update({ where: { id, boardId }, data: { position } })
            )
        );
        return this.getBoard(boardId);
    }

    // ─── Ticket placement ─────────────────────────────────

    /**
     * Move a ticket to a column. If the column has autoStatus, update ticket status.
     */
    static async moveTicket(ticketId: string, columnId: string | null) {
        let ticketData: any = { kanbanColumnId: columnId };

        if (columnId) {
            const col = await prisma.kanbanColumn.findUnique({ where: { id: columnId } });
            if (col?.autoStatus) {
                ticketData.status = col.autoStatus;
                if (col.autoStatus === 'CLOSED') ticketData.closedAt = new Date();
            }
        }

        return prisma.ticket.update({ where: { id: ticketId }, data: ticketData });
    }

    /**
     * Auto-place a ticket: put it in the first column of the default board (if any).
     * Called when a ticket is created and no column is assigned.
     */
    static async autoPlaceTicket(ticketId: string) {
        const defaultBoard = await prisma.kanbanBoard.findFirst({ where: { isDefault: true }, include: { columns: { orderBy: { position: 'asc' }, take: 1 } } });
        if (!defaultBoard || !defaultBoard.columns[0]) return;
        await prisma.ticket.update({ where: { id: ticketId }, data: { kanbanColumnId: defaultBoard.columns[0].id } });
    }
}
