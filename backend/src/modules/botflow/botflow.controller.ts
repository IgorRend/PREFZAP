import { Router } from 'express';
import { BotFlowService } from './botflow.service';
import { requireAuth, requireAdmin, AuthRequest } from '../auth/auth.middleware';

const router = Router();

// GET /api/bot-flows
router.get('/', requireAuth, async (_req, res) => {
    try {
        const flows = await BotFlowService.findAll();
        res.json(flows);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/bot-flows/active
router.get('/active', requireAuth, async (_req, res) => {
    try {
        const flow = await BotFlowService.findActive();
        res.json(flow);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/bot-flows/:id
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const flow = await BotFlowService.findById(req.params.id as string);
        if (!flow) return res.status(404).json({ error: 'Fluxo não encontrado' });
        res.json(flow);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/bot-flows
router.post('/', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
        const flow = await BotFlowService.create({ ...req.body, tenantId: req.tenantId });
        res.status(201).json(flow);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// PUT /api/bot-flows/:id
router.put('/:id', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
        const flow = await BotFlowService.update(req.params.id as string, req.body);
        res.json(flow);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// DELETE /api/bot-flows/:id
router.delete('/:id', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
        await BotFlowService.delete(req.params.id as string);
        res.json({ message: 'Fluxo removido' });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

export default router;
