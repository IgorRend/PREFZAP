import { Router } from 'express';
import { TemplatesService } from './templates.service';
import { requireAuth, requireAdmin, AuthRequest } from '../auth/auth.middleware';

const router = Router();

// GET /api/templates — All authenticated users can list
router.get('/', requireAuth, async (req: AuthRequest, res) => {
    try {
        const status = req.query.status as string | undefined;
        const templates = await TemplatesService.findAll(status);
        // Parse components back to JSON for frontend
        const parsed = templates.map(t => ({
            ...t,
            components: JSON.parse(t.components || '[]'),
        }));
        res.json(parsed);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/templates/sync — Admin only: sync from Meta
router.post('/sync', requireAuth, requireAdmin, async (_req: AuthRequest, res) => {
    try {
        const result = await TemplatesService.syncFromMeta();
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// POST /api/templates — Admin only: create
router.post('/', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
        const template = await TemplatesService.create(req.body);
        res.status(201).json(template);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// PUT /api/templates/:id — Admin only: update
router.put('/:id', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
        const template = await TemplatesService.update(req.params.id as string, req.body);
        res.json(template);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// DELETE /api/templates/:id — Admin only: delete
router.delete('/:id', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
        await TemplatesService.delete(req.params.id as string);
        res.json({ message: 'Template removido' });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

export default router;
