import { Router } from 'express';
import { requireAuth, requireSuperAdmin, AuthRequest } from '../auth/auth.middleware';
import { SuperAdminService } from './super-admin.service';

const router = Router();

// All routes require authentication + super admin flag
router.use(requireAuth, requireSuperAdmin);

// ─── Tenant List ──────────────────────────────────────────────────────

// GET /api/super-admin/tenants
router.get('/tenants', async (_req, res) => {
    try {
        const tenants = await SuperAdminService.listTenants();
        const parsed = tenants.map(t => ({
            ...t,
            activeModules: JSON.parse((t as any).activeModules || '[]'),
        }));
        res.json(parsed);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/super-admin/tenants/:id
router.get('/tenants/:id', async (req, res) => {
    try {
        const tenant = await SuperAdminService.getTenant(req.params.id);
        if (!tenant) return res.status(404).json({ error: 'Tenant não encontrado' });
        res.json({ ...tenant, activeModules: JSON.parse((tenant as any).activeModules || '[]') });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ─── Tenant Create / Provision ────────────────────────────────────────

/**
 * POST /api/super-admin/tenants
 * Legacy: creates tenant row only (no admin user).
 */
router.post('/tenants', async (req: AuthRequest, res) => {
    try {
        const { name, domain, businessNiche, activeModules, logoUrl } = req.body;
        if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
        const tenant = await SuperAdminService.createTenant({ name, domain, businessNiche, activeModules, logoUrl });
        res.status(201).json({ ...tenant, activeModules: JSON.parse((tenant as any).activeModules || '[]') });
    } catch (error: any) {
        if (error.code === 'P2002') {
            return res.status(409).json({ error: 'Domínio já cadastrado' });
        }
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/super-admin/tenants/provision
 * Full provisioning: creates Tenant + AccountSettings + first ADMIN user + sends welcome email.
 * Body: { name, domain?, businessNiche?, activeModules?, logoUrl?, adminName, adminEmail, adminPassword? }
 */
router.post('/tenants/provision', async (req: AuthRequest, res) => {
    try {
        const {
            name, domain, businessNiche, activeModules, logoUrl,
            adminName, adminEmail, adminPassword,
        } = req.body;
        if (!name) return res.status(400).json({ error: 'Nome da organização é obrigatório' });
        if (!adminName) return res.status(400).json({ error: 'Nome do administrador é obrigatório' });
        if (!adminEmail) return res.status(400).json({ error: 'E-mail do administrador é obrigatório' });

        const result = await SuperAdminService.provisionTenant({
            name, domain, businessNiche, activeModules, logoUrl,
            adminName, adminEmail, adminPassword,
        });

        res.status(201).json({
            tenant: { ...result.tenant, activeModules: JSON.parse((result.tenant as any).activeModules || '[]') },
            adminEmail: result.adminEmail,
            temporaryPassword: result.temporaryPassword,
            message: `Tenant "${name}" provisionado com sucesso. E-mail de boas-vindas enviado para ${result.adminEmail}.`,
        });
    } catch (error: any) {
        if (error.code === 'P2002') {
            return res.status(409).json({ error: 'E-mail ou domínio já cadastrado' });
        }
        res.status(500).json({ error: error.message });
    }
});

// ─── Tenant Update ────────────────────────────────────────────────────

// PUT /api/super-admin/tenants/:id
router.put('/tenants/:id', async (req, res) => {
    try {
        const { name, domain, businessNiche, activeModules, logoUrl, isActive } = req.body;
        const tenant = await SuperAdminService.updateTenant(req.params.id, {
            name, domain, businessNiche, activeModules, logoUrl, isActive,
        });
        res.json({ ...tenant, activeModules: JSON.parse((tenant as any).activeModules || '[]') });
    } catch (error: any) {
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Tenant não encontrado' });
        }
        res.status(500).json({ error: error.message });
    }
});

// ─── Tenant Delete ────────────────────────────────────────────────────

/**
 * DELETE /api/super-admin/tenants/:id
 * Soft delete: deactivates the tenant (users cannot log in, data preserved).
 */
router.delete('/tenants/:id', async (req, res) => {
    try {
        await SuperAdminService.deactivateTenant(req.params.id);
        res.json({ message: 'Tenant desativado (soft-delete). Dados preservados.' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/super-admin/tenants/:id/hard
 * Hard delete: PERMANENTLY removes ALL data and files for this tenant.
 * Requires X-Confirm-Hard-Delete: true header as an extra safety gate.
 */
router.delete('/tenants/:id/hard', async (req, res) => {
    try {
        const confirm = req.headers['x-confirm-hard-delete'];
        if (confirm !== 'true') {
            return res.status(400).json({
                error: 'Hard delete requires the header X-Confirm-Hard-Delete: true',
            });
        }
        const result = await SuperAdminService.hardDeleteTenant(req.params.id);
        res.json({
            message: `Tenant "${result.tenantName}" permanentemente excluído. Todos os dados e arquivos foram removidos.`,
        });
    } catch (error: any) {
        if (error.message === 'Tenant não encontrado') {
            return res.status(404).json({ error: error.message });
        }
        res.status(500).json({ error: error.message });
    }
});

// ─── Global Metrics ───────────────────────────────────────────────────

/**
 * GET /api/super-admin/metrics
 * Returns platform-wide aggregate metrics for the Master Dashboard.
 */
router.get('/metrics', async (_req, res) => {
    try {
        const metrics = await SuperAdminService.getGlobalMetrics();
        res.json(metrics);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
