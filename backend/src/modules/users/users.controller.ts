import { Router } from 'express';
import { UsersService } from './users.service';
import { requireAuth, requireAdmin, AuthRequest } from '../auth/auth.middleware';

const router = Router();

// GET /api/users
router.get('/', requireAuth, async (req: AuthRequest, res) => {
    try {
        const tenantId = req.isSuperAdmin ? (req.query.tenantId as string || undefined) : req.tenantId!;
        const users = await UsersService.findAll(tenantId);
        res.json(users);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/users/:id
router.get('/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
        const user = await UsersService.findById(req.params.id as string);
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

        // Tenant-scoped access: TENANT_ADMIN can only see users from own tenant
        if (!req.isSuperAdmin && user.tenant?.id !== req.tenantId) {
            return res.status(403).json({ error: 'Acesso negado' });
        }

        res.json(user);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/users
router.post('/', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
        // SECURITY: SuperAdmin MUST explicitly provide tenantId to assign users to orgs.
        // Prevents accidental creation with no tenant context.
        if (req.isSuperAdmin && !req.body.tenantId) {
            return res.status(400).json({
                error: 'SuperAdmin deve especificar o tenantId (organização) ao criar um usuário.',
            });
        }

        // SuperAdmin can pass any tenantId; TENANT_ADMIN is always forced to own tenant
        const tenantId = req.isSuperAdmin ? req.body.tenantId : req.tenantId!;
        const user = await UsersService.create({ ...req.body, tenantId });
        res.status(201).json(user);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// PUT /api/users/:id
router.put('/:id', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
        // SECURITY: Strip tenantId from payload if not SuperAdmin — prevents cross-tenant user moves
        const updatePayload = { ...req.body };
        if (!req.isSuperAdmin) {
            delete updatePayload.tenantId;
        }

        const user = await UsersService.update(req.params.id as string, updatePayload);
        res.json(user);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// DELETE /api/users/:id
router.delete('/:id', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
        await UsersService.delete(req.params.id as string);
        res.json({ message: 'Usuário removido' });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

export default router;
