import { prisma } from '../../server';

export class InternalChatService {

    // ─── Rooms ──────────────────────────────────────────

    /** Get or create a direct (1:1) room between two users */
    static async getOrCreateDirectRoom(userId: string, targetUserId: string, tenantId: string) {
        // Find existing direct room between these two users
        const existing = await prisma.internalRoom.findFirst({
            where: {
                type: 'direct',
                tenantId,
                AND: [
                    { participants: { some: { userId } } },
                    { participants: { some: { userId: targetUserId } } },
                ],
            },
            include: {
                participants: { include: { user: { select: { id: true, name: true, email: true, online: true } } } },
                messages: { take: 1, orderBy: { createdAt: 'desc' }, include: { sender: { select: { id: true, name: true } } } },
            },
        });
        if (existing) return existing;

        // Create new direct room
        return prisma.internalRoom.create({
            data: {
                type: 'direct',
                createdBy: userId,
                tenantId,
                participants: {
                    create: [
                        { userId, role: 'member' },
                        { userId: targetUserId, role: 'member' },
                    ],
                },
            },
            include: {
                participants: { include: { user: { select: { id: true, name: true, email: true, online: true } } } },
                messages: { take: 1, orderBy: { createdAt: 'desc' }, include: { sender: { select: { id: true, name: true } } } },
            },
        });
    }

    /** Create a group room (admin only) */
    static async createGroup(name: string, createdBy: string, memberIds: string[], tenantId: string) {
        const allMembers = Array.from(new Set([createdBy, ...memberIds]));
        return prisma.internalRoom.create({
            data: {
                name,
                type: 'group',
                createdBy,
                tenantId,
                participants: {
                    create: allMembers.map(uid => ({
                        userId: uid,
                        role: uid === createdBy ? 'admin' : 'member',
                    })),
                },
            },
            include: {
                participants: { include: { user: { select: { id: true, name: true, email: true, online: true } } } },
                messages: { take: 1, orderBy: { createdAt: 'desc' }, include: { sender: { select: { id: true, name: true } } } },
            },
        });
    }

    /** Add member to group (admin only) */
    static async addGroupMember(roomId: string, userId: string, actorId: string) {
        const room = await prisma.internalRoom.findUnique({ where: { id: roomId }, include: { participants: true } });
        if (!room || room.type !== 'group') throw new Error('Sala não encontrada');

        const actor = room.participants.find(p => p.userId === actorId);
        if (!actor || actor.role !== 'admin') throw new Error('Apenas admins podem adicionar membros');

        const already = room.participants.find(p => p.userId === userId);
        if (already) throw new Error('Usuário já está no grupo');

        await prisma.internalParticipant.create({ data: { roomId, userId, role: 'member' } });
        return this.getRoomById(roomId);
    }

    /** Remove member from group (admin only) */
    static async removeGroupMember(roomId: string, userId: string, actorId: string) {
        const room = await prisma.internalRoom.findUnique({ where: { id: roomId }, include: { participants: true } });
        if (!room || room.type !== 'group') throw new Error('Sala não encontrada');

        const actor = room.participants.find(p => p.userId === actorId);
        if (!actor || actor.role !== 'admin') throw new Error('Apenas admins podem remover membros');

        await prisma.internalParticipant.delete({ where: { roomId_userId: { roomId, userId } } });
        return this.getRoomById(roomId);
    }

    /** Get a room by ID with participants */
    static async getRoomById(roomId: string) {
        return prisma.internalRoom.findUnique({
            where: { id: roomId },
            include: {
                participants: { include: { user: { select: { id: true, name: true, email: true, online: true } } } },
                messages: { take: 1, orderBy: { createdAt: 'desc' }, include: { sender: { select: { id: true, name: true } } } },
            },
        });
    }

    /** Get all rooms for a user with latest message + unread counts */
    static async getUserRooms(userId: string) {
        const rooms = await prisma.internalRoom.findMany({
            where: { participants: { some: { userId } } },
            include: {
                participants: { include: { user: { select: { id: true, name: true, email: true, online: true } } } },
                messages: {
                    take: 1,
                    orderBy: { createdAt: 'desc' },
                    include: { sender: { select: { id: true, name: true } } },
                },
            },
            orderBy: { updatedAt: 'desc' },
        });

        // Calculate unread counts per room
        const roomsWithUnread = await Promise.all(rooms.map(async (room) => {
            const unreadCount = await prisma.internalMessage.count({
                where: {
                    roomId: room.id,
                    senderId: { not: userId },
                    readReceipts: { none: { userId } },
                },
            });
            return { ...room, unreadCount };
        }));

        return roomsWithUnread;
    }

    // ─── Messages ──────────────────────────────────────

    /** Get messages for a room (paginated) */
    static async getRoomMessages(roomId: string, userId: string, cursor?: string, limit = 50) {
        // Verify user is participant
        const participant = await prisma.internalParticipant.findUnique({
            where: { roomId_userId: { roomId, userId } },
        });
        if (!participant) throw new Error('Acesso negado');

        const messages = await prisma.internalMessage.findMany({
            where: { roomId },
            take: limit,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            orderBy: { createdAt: 'desc' },
            include: {
                sender: { select: { id: true, name: true, email: true } },
                readReceipts: { select: { userId: true, readAt: true } },
            },
        });

        return messages.reverse();
    }

    /** Send a message (immutable — no edit/delete) */
    static async sendMessage(roomId: string, senderId: string, content?: string, attachmentUrl?: string, messageType = 'text') {
        // Verify sender is participant
        const participant = await prisma.internalParticipant.findUnique({
            where: { roomId_userId: { roomId, userId: senderId } },
        });
        if (!participant) throw new Error('Acesso negado');

        const message = await prisma.internalMessage.create({
            data: {
                roomId,
                senderId,
                content,
                attachmentUrl,
                messageType,
            },
            include: {
                sender: { select: { id: true, name: true, email: true } },
                readReceipts: { select: { userId: true, readAt: true } },
            },
        });

        // Update room's updatedAt
        await prisma.internalRoom.update({ where: { id: roomId }, data: { updatedAt: new Date() } });

        return message;
    }

    // ─── Read Receipts ──────────────────────────────────

    /** Mark all unread messages in a room as read for a user */
    static async markAsRead(roomId: string, userId: string) {
        const unreadMessages = await prisma.internalMessage.findMany({
            where: {
                roomId,
                senderId: { not: userId },
                readReceipts: { none: { userId } },
            },
            select: { id: true },
        });

        if (unreadMessages.length === 0) return [];

        for (const m of unreadMessages) {
            try {
                await prisma.internalReadReceipt.create({
                    data: { messageId: m.id, userId },
                });
            } catch {
                // Skip duplicates
            }
        }

        return unreadMessages.map(m => m.id);
    }

    // ─── Users ──────────────────────────────────────────

    /** List all users (for starting new conversations) */
    static async getAllUsers() {
        return prisma.user.findMany({
            select: { id: true, name: true, email: true, role: true, online: true },
            orderBy: { name: 'asc' },
        });
    }
}
