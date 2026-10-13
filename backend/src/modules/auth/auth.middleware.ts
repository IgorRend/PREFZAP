import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { createTenantPrisma } from '../../lib/prisma-tenant';
import { tenantStorage } from '../../lib/db';

export interface AuthRequest extends Request {
    userId?: string;
    userRole?: string;
    isSuperAdmin?: boolean;
    tenantId?: string;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token não fornecido' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
        req.userId = decoded.id;
        req.userRole = decoded.role;
        req.isSuperAdmin = decoded.isSuperAdmin === true;
        req.tenantId = decoded.tenantId;

        // Allow Super Admins to impersonate a tenant via x-tenant-id header
        if (req.isSuperAdmin && req.headers['x-tenant-id']) {
            req.tenantId = req.headers['x-tenant-id'] as string;
        }

        if (req.tenantId) {
            const tenantPrisma = createTenantPrisma(req.tenantId);
            tenantStorage.run({ tenantId: req.tenantId, prisma: tenantPrisma }, () => {
                next();
            });
        } else {
            next();
        }
    } catch {
        return res.status(401).json({ error: 'Token inválido' });
    }
}

/**
 * Requires the user to be a TENANT_ADMIN (role === 'ADMIN') within their tenant.
 * Super admins also pass this check.
 */
export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
    if (req.userRole !== 'ADMIN' && !req.isSuperAdmin) {
        return res.status(403).json({ error: 'Acesso restrito a administradores' });
    }
    next();
}

/** Alias for clarity — same as requireAdmin */
export const requireTenantAdmin = requireAdmin;

/**
 * Requires the user to belong to an active tenant.
 * This is called after requireAuth, using tenantId from the JWT.
 * Rejects if the tenant has been deactivated by the super admin.
 */
export async function requireTenantActive(req: AuthRequest, res: Response, next: NextFunction) {
    if (req.isSuperAdmin) return next(); // Super admins bypass tenant active check
    if (!req.tenantId) {
        return res.status(403).json({ error: 'Contexto de tenant ausente' });
    }
    try {
        const { prisma } = await import('../../server');
        const tenant = await prisma.tenant.findUnique({
            where: { id: req.tenantId },
            select: { isActive: true },
        });
        if (!tenant || !tenant.isActive) {
            return res.status(403).json({
                error: 'Sua organização está desativada. Contate o suporte.',
            });
        }
        next();
    } catch {
        return res.status(500).json({ error: 'Erro ao verificar status do tenant' });
    }
}

export function requireSuperAdmin(req: AuthRequest, res: Response, next: NextFunction) {
    if (!req.isSuperAdmin) {
        return res.status(403).json({ error: 'Acesso restrito ao Super Admin' });
    }
    next();
}
