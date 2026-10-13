import { prisma } from '../../server';
import { Request } from 'express';

export interface AuditInput {
    userId?: string | null;
    userName?: string | null;
    action: string;         // CREATE | UPDATE | DELETE | LOGIN | LOGOUT | TRANSFER | CLOSE | EXPORT
    entity: string;         // e.g. "User" | "Ticket" | "Settings" | "Department"
    entityId?: string | null;
    oldValue?: object | null;
    newValue?: object | null;
    req?: Request;
}

export class AuditService {
    static async log(input: AuditInput) {
        try {
            const ip = input.req
                ? (input.req.headers['x-forwarded-for'] as string || input.req.socket.remoteAddress || null)
                : null;

            await prisma.auditLog.create({
                data: {
                    userId: input.userId ?? null,
                    userName: input.userName ?? null,
                    action: input.action,
                    entity: input.entity,
                    entityId: input.entityId ?? null,
                    oldValue: input.oldValue ? JSON.stringify(input.oldValue) : null,
                    newValue: input.newValue ? JSON.stringify(input.newValue) : null,
                    ip,
                },
            });
        } catch (err) {
            // Audit errors must never break main flow
            console.warn('[AuditService] Falha ao registrar log:', err);
        }
    }

    static async findAll(filters: {
        entity?: string;
        action?: string;
        userId?: string;
        from?: string;
        to?: string;
        page?: number;
        limit?: number;
    }) {
        const { entity, action, userId, from, to, page = 1, limit = 50 } = filters;
        const where: any = {};
        if (entity) where.entity = entity;
        if (action) where.action = action;
        if (userId) where.userId = userId;
        if (from || to) {
            where.createdAt = {};
            if (from) where.createdAt.gte = new Date(from);
            if (to) where.createdAt.lte = new Date(to);
        }

        const [total, logs] = await Promise.all([
            prisma.auditLog.count({ where }),
            prisma.auditLog.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
                include: { user: { select: { name: true, email: true } } },
            }),
        ]);

        return { total, page, limit, logs };
    }
}
