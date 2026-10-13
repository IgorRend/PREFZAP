import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { prisma } from '../server';

let ioInstance: SocketIOServer;

// Track online users: userId -> Set of socketIds
const onlineUsers = new Map<string, Set<string>>();
// Track user → tenantId for disconnect cleanup
const userTenantMap = new Map<string, string>();

/** Build the tenant room name from a tenantId */
export function tenantRoom(tenantId: string): string {
    return `tenant:${tenantId}`;
}

export function initSocket(io: SocketIOServer) {
    ioInstance = io;

    // Auth middleware for socket connections
    io.use((socket: Socket, next) => {
        const token = socket.handshake.auth.token;
        if (!token) {
            return next(new Error('Authentication required'));
        }
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
            (socket as any).userId = decoded.id;
            (socket as any).userRole = decoded.role;
            let tenantId = decoded.tenantId;
            // Super Admin can override tenantId
            if (decoded.isSuperAdmin && socket.handshake.auth.tenantId) {
                tenantId = socket.handshake.auth.tenantId;
            }
            (socket as any).tenantId = tenantId;
            next();
        } catch {
            next(new Error('Invalid token'));
        }
    });

    io.on('connection', async (socket: Socket) => {
        const userId = (socket as any).userId;
        const socketTenantId = (socket as any).tenantId;
        console.log(`🔌 User connected: ${userId} | tenant: ${socketTenantId}`);

        if (!socketTenantId) {
            console.warn(`[Socket] User ${userId} has no tenantId — disconnecting`);
            socket.disconnect(true);
            return;
        }

        // ─── Join tenant room (security boundary) ─────────
        // Every authenticated user is confined to their own tenant room.
        // emitToTenant() targets ONLY this room — no cross-tenant leakage.
        socket.join(tenantRoom(socketTenantId));

        // Join personal room
        socket.join(`user:${userId}`);

        // ─── Online Tracking ──────────────────────────────
        if (!onlineUsers.has(userId)) {
            onlineUsers.set(userId, new Set());
        }
        onlineUsers.get(userId)!.add(socket.id);
        userTenantMap.set(userId, socketTenantId);

        // Update DB and broadcast online status (scoped to tenant room)
        try {
            await prisma.user.update({ where: { id: userId }, data: { online: true } });
        } catch { }
        io.to(tenantRoom(socketTenantId)).emit('internal:user-status', { userId, online: true });

        // Agent just came online — pick up any tickets queued in their departments
        // (auto-distribute only routes to online agents, so queued ones wait for this).
        import('../modules/routing/routing.service').then(async ({ RoutingService }) => {
            const depts = await prisma.userDepartment.findMany({
                where: { userId },
                select: { departmentId: true },
            });
            for (const d of depts) {
                RoutingService.processQueue(d.departmentId).catch(() => { });
            }
        }).catch(() => { });

        // ─── Customer Chat Events ─────────────────────────

        // Join department rooms
        socket.on('join:department', async (departmentId: string) => {
            try {
                const dept = await prisma.department.findUnique({
                    where: { id: departmentId },
                    select: { tenantId: true },
                });
                if (dept && dept.tenantId === socketTenantId) {
                    socket.join(`department:${departmentId}`);
                }
            } catch { }
        });

        // Join ticket room for live messages
        socket.on('join:ticket', async (ticketId: string) => {
            try {
                const ticket = await prisma.ticket.findUnique({
                    where: { id: ticketId },
                    select: { tenantId: true },
                });
                if (ticket && ticket.tenantId === socketTenantId) {
                    socket.join(`ticket:${ticketId}`);
                }
            } catch { }
        });

        socket.on('leave:ticket', (ticketId: string) => {
            socket.leave(`ticket:${ticketId}`);
        });

        // ─── Internal Chat Events ─────────────────────────

        socket.on('internal:join', (roomId: string) => {
            socket.join(`internal:${roomId}`);
        });

        socket.on('internal:leave', (roomId: string) => {
            socket.leave(`internal:${roomId}`);
        });

        socket.on('internal:typing', (data: { roomId: string; userName: string }) => {
            socket.to(`internal:${data.roomId}`).emit('internal:typing', {
                userId,
                userName: data.userName,
                roomId: data.roomId,
            });
        });

        socket.on('internal:stop-typing', (data: { roomId: string }) => {
            socket.to(`internal:${data.roomId}`).emit('internal:stop-typing', {
                userId,
                roomId: data.roomId,
            });
        });

        // ─── Agent typing indicator to WhatsApp ─────────
        socket.on('agent:typing', async (data: { ticketId: string }) => {
            try {
                const { WhatsAppClient } = await import('./whatsapp');
                const { prisma } = await import('../server');
                const ticket = await prisma.ticket.findUnique({
                    where: { id: data.ticketId },
                    include: { contact: true }
                });
                if (ticket && ticket.contact) {
                    const waClient = await WhatsAppClient.getClientForTicket(ticket.id);
                    await waClient.setPresence(ticket.contact.phone, 'typing');
                }
            } catch (err) {
                console.error('[Socket] agent:typing error:', err);
            }
        });

        socket.on('agent:stop-typing', async (data: { ticketId: string }) => {
            try {
                const { WhatsAppClient } = await import('./whatsapp');
                const { prisma } = await import('../server');
                const ticket = await prisma.ticket.findUnique({
                    where: { id: data.ticketId },
                    include: { contact: true }
                });
                if (ticket && ticket.contact) {
                    const waClient = await WhatsAppClient.getClientForTicket(ticket.id);
                    await waClient.setPresence(ticket.contact.phone, 'available');
                }
            } catch (err) {
                console.error('[Socket] agent:stop-typing error:', err);
            }
        });

        // ─── Disconnect ───────────────────────────────────
        socket.on('disconnect', async () => {
            console.log(`🔌 User disconnected: ${userId}`);

            const sockets = onlineUsers.get(userId);
            if (sockets) {
                sockets.delete(socket.id);
                if (sockets.size === 0) {
                    onlineUsers.delete(userId);
                    const tid = userTenantMap.get(userId) || socketTenantId;
                    userTenantMap.delete(userId);
                    try {
                        await prisma.user.update({ where: { id: userId }, data: { online: false } });
                    } catch { }
                    // Scoped to tenant room — no cross-tenant broadcast
                    io.to(tenantRoom(tid)).emit('internal:user-status', { userId, online: false });
                }
            }
        });
    });
}

export function getIO(): SocketIOServer {
    if (!ioInstance) throw new Error('Socket.io not initialized');
    return ioInstance;
}

export function getOnlineUserIds(): string[] {
    return Array.from(onlineUsers.keys());
}

// ─── Emit Helpers ─────────────────────────────────────────

/** Broadcast to ALL authenticated users of a specific tenant. */
export function emitToTenant(tId: string, event: string, data: any) {
    ioInstance?.to(tenantRoom(tId)).emit(event, data);
}

/** @deprecated Use emitToTenant(tenantId, ...). Kept for backward-compat during migration. */
export function emitToAll(event: string, data: any) {
    // Broadcast to ALL connected sockets — only use for global system events
    ioInstance?.emit(event, data);
}

export function emitToUser(userId: string, event: string, data: any) {
    ioInstance?.to(`user:${userId}`).emit(event, data);
}

export function emitToDepartment(departmentId: string, event: string, data: any) {
    ioInstance?.to(`department:${departmentId}`).emit(event, data);
}

export function emitToTicket(ticketId: string, event: string, data: any) {
    ioInstance?.to(`ticket:${ticketId}`).emit(event, data);
}

export function emitToInternalRoom(roomId: string, event: string, data: any) {
    ioInstance?.to(`internal:${roomId}`).emit(event, data);
}
