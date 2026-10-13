import { prisma } from '../../server';

export class TagsService {
    static async findAll() {
        return prisma.tag.findMany({
            orderBy: { name: 'asc' },
            include: { _count: { select: { tickets: true } } },
        });
    }

    static async create(data: { name: string; color?: string; tenantId: string }) {
        return prisma.tag.create({
            data: { name: data.name, color: data.color || '#6366f1', tenantId: data.tenantId },
        });
    }

    static async update(id: string, data: { name?: string; color?: string }) {
        return prisma.tag.update({ where: { id }, data });
    }

    static async delete(id: string) {
        return prisma.tag.delete({ where: { id } });
    }

    // ─── Ticket Tag Assignment ───────────────────────────

    static async getTicketTags(ticketId: string) {
        const ticketTags = await prisma.ticketTag.findMany({
            where: { ticketId },
            include: { tag: true },
        });
        return ticketTags.map(tt => tt.tag);
    }

    static async assignTag(ticketId: string, tagId: string) {
        return prisma.ticketTag.create({
            data: { ticketId, tagId },
            include: { tag: true },
        });
    }

    static async removeTag(ticketId: string, tagId: string) {
        return prisma.ticketTag.delete({
            where: { ticketId_tagId: { ticketId, tagId } },
        });
    }
}
