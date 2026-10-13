import { Router } from 'express';
import { TagsService } from './tags.service';
import { requireAuth, requireAdmin, AuthRequest } from '../auth/auth.middleware';

const router = Router();

// GET /api/tags — list all tags
router.get('/', requireAuth, async (_req, res) => {
    try {
        const tags = await TagsService.findAll();
        res.json(tags);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/tags — create tag (admin only)
router.post('/', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
        const { name, color } = req.body;
        if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
        const tag = await TagsService.create({ name, color, tenantId: req.tenantId! });
        res.status(201).json(tag);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// PUT /api/tags/:id — update tag (admin only)
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const tag = await TagsService.update(req.params.id as string, req.body);
        res.json(tag);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// DELETE /api/tags/:id — delete tag (admin only)
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        await TagsService.delete(req.params.id as string);
        res.json({ message: 'Tag removida' });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// ─── Ticket Tag Assignment ──────────────────────────────

// GET /api/tags/ticket/:ticketId — get tags for a ticket
router.get('/ticket/:ticketId', requireAuth, async (req, res) => {
    try {
        const tags = await TagsService.getTicketTags(req.params.ticketId as string);
        res.json(tags);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/tags/ticket/:ticketId — assign tag to ticket
router.post('/ticket/:ticketId', requireAuth, async (req, res) => {
    try {
        const { tagId } = req.body;
        if (!tagId) return res.status(400).json({ error: 'tagId é obrigatório' });
        const result = await TagsService.assignTag(req.params.ticketId as string, tagId);
        res.status(201).json(result);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// DELETE /api/tags/ticket/:ticketId/:tagId — remove tag from ticket
router.delete('/ticket/:ticketId/:tagId', requireAuth, async (req, res) => {
    try {
        await TagsService.removeTag(req.params.ticketId as string, req.params.tagId as string);
        res.json({ message: 'Tag removida do ticket' });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

export default router;
