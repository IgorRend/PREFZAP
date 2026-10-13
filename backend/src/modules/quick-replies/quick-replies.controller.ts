import { Router } from 'express';
import { QuickRepliesService } from './quick-replies.service';
import { requireAuth, requireAdmin, AuthRequest } from '../auth/auth.middleware';

const router = Router();

// GET /api/quick-replies — list all (any authenticated user)
router.get('/', requireAuth, async (_req, res) => {
    try {
        const replies = await QuickRepliesService.findAll();
        res.json(replies);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/quick-replies — create (admin only)
router.post('/', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
        const { shortcut, message } = req.body;
        if (!shortcut || !message) {
            return res.status(400).json({ error: 'shortcut e message são obrigatórios' });
        }
        const reply = await QuickRepliesService.create({ shortcut, message, tenantId: req.tenantId! });
        res.status(201).json(reply);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// PUT /api/quick-replies/:id — update (admin only)
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const reply = await QuickRepliesService.update(req.params.id as string, req.body);
        res.json(reply);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// DELETE /api/quick-replies/:id — delete (admin only)
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        await QuickRepliesService.delete(req.params.id as string);
        res.json({ message: 'Resposta rápida removida' });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

export default router;
