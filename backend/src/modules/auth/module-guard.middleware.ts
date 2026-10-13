import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';

/**
 * Feature Toggling middleware.
 * Checks if the tenant has a specific module enabled.
 * Returns 403 if the module is not in the tenant's activeModules list.
 * Super Admins bypass this check.
 */
export function requireModule(moduleName: string) {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
        // Super admins bypass module checks
        if (req.isSuperAdmin) return next();

        try {
            const tenantId = req.tenantId;
            if (!tenantId) {
                return res.status(403).json({ error: 'Contexto de tenant ausente' });
            }
            const { globalPrisma } = await import('../../server');
            const tenant = await globalPrisma.tenant.findUnique({ where: { id: tenantId } });
            if (!tenant) {
                // If no tenant exists yet, allow all (backwards compatibility)
                return next();
            }

            const modules: string[] = JSON.parse(tenant.activeModules || '[]');
            if (!modules.includes(moduleName)) {
                return res.status(403).json({
                    error: `Módulo '${moduleName}' não está ativo para este tenant`,
                    module: moduleName,
                });
            }
            next();
        } catch {
            next(); // On error, allow through (fail open for backwards compat)
        }
    };
}
