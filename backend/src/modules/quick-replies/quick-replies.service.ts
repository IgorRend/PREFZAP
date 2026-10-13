import { prisma } from '../../server';

export class QuickRepliesService {
    static async findAll() {
        return prisma.quickReply.findMany({
            orderBy: { shortcut: 'asc' },
        });
    }

    static async create(data: { shortcut: string; message: string; tenantId: string }) {
        // Ensure shortcut starts with /
        const shortcut = data.shortcut.startsWith('/') ? data.shortcut : `/${data.shortcut}`;
        return prisma.quickReply.create({
            data: { shortcut, message: data.message, tenantId: data.tenantId },
        });
    }

    static async update(id: string, data: { shortcut?: string; message?: string }) {
        const updateData: any = {};
        if (data.shortcut) {
            updateData.shortcut = data.shortcut.startsWith('/') ? data.shortcut : `/${data.shortcut}`;
        }
        if (data.message) updateData.message = data.message;
        return prisma.quickReply.update({ where: { id }, data: updateData });
    }

    static async delete(id: string) {
        return prisma.quickReply.delete({ where: { id } });
    }
}
