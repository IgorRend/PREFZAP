import { Router } from 'express';
import { DepartmentsService } from './departments.service';
import { requireAuth, requireAdmin, AuthRequest } from '../auth/auth.middleware';

const router = Router();

// GET /api/departments
router.get('/', requireAuth, async (req: AuthRequest, res) => {
    try {
        const tenantId = req.isSuperAdmin ? (req.query.tenantId as string || undefined) : req.tenantId!;
        const departments = await DepartmentsService.findAll(tenantId);
        res.json(departments);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/departments/:id
router.get('/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
        const dept = await DepartmentsService.findById(req.params.id as string);
        if (!dept) return res.status(404).json({ error: 'Setor não encontrado' });

        // Tenant-scoped access: TENANT_ADMIN can only see departments from own tenant
        if (!req.isSuperAdmin && dept.tenant?.id !== req.tenantId) {
            return res.status(403).json({ error: 'Acesso negado' });
        }

        res.json(dept);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/departments
router.post('/', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
        // SECURITY: SuperAdmin MUST explicitly provide tenantId.
        if (req.isSuperAdmin && !req.body.tenantId) {
            return res.status(400).json({
                error: 'SuperAdmin deve especificar o tenantId (organização) ao criar um setor.',
            });
        }

        // SuperAdmin can pass any tenantId; TENANT_ADMIN is always forced to own tenant
        const tenantId = req.isSuperAdmin ? req.body.tenantId : req.tenantId!;
        const dept = await DepartmentsService.create({ ...req.body, tenantId });
        res.status(201).json(dept);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// PUT /api/departments/:id
router.put('/:id', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
        // SECURITY: Strip tenantId from payload if not SuperAdmin — prevents cross-tenant dept moves
        const updatePayload = { ...req.body };
        if (!req.isSuperAdmin) {
            delete updatePayload.tenantId;
        }

        const dept = await DepartmentsService.update(req.params.id as string, updatePayload);
        res.json(dept);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// DELETE /api/departments/:id
router.delete('/:id', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
        await DepartmentsService.delete(req.params.id as string);
        res.json({ message: 'Setor removido' });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

export default router;
