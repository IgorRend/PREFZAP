import { Router } from 'express';
import { WidgetService } from './widget.service';
import { requireAuth, requireAdmin, AuthRequest } from '../auth/auth.middleware';

const router = Router();

// ─── Admin: Widget CRUD ──────────────────────────────────

// GET /api/widgets
router.get('/', requireAuth, requireAdmin, async (_req, res) => {
    try {
        const widgets = await WidgetService.list();
        res.json(widgets);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /api/widgets
router.post('/', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
        const widget = await WidgetService.create(req.body);
        res.status(201).json(widget);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// PUT /api/widgets/:id
router.put('/:id', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
        const widget = await WidgetService.update(req.params.id as string, req.body);
        res.json(widget);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// DELETE /api/widgets/:id
router.delete('/:id', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
        await WidgetService.delete(req.params.id as string);
        res.json({ success: true });
    } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ─── Public: Widget Config (for the embeddable SDK) ──────

// GET /api/widgets/public/:token — returns widget config (no auth required)
router.get('/public/:token', async (req, res) => {
    try {
        const widget = await WidgetService.findByToken(req.params.token);
        if (!widget || !widget.isActive) return res.status(404).json({ error: 'Widget não encontrado ou inativo' });

        // Only return safe config fields
        res.json({
            id: widget.id,
            name: widget.name,
            primaryColor: widget.primaryColor,
            welcomeMessage: widget.welcomeMessage,
            agentName: widget.agentName,
        });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /api/widgets/public/:token/messages?visitorId=... — session message history
router.get('/public/:token/messages', async (req, res) => {
    try {
        const widget = await WidgetService.findByToken(req.params.token);
        if (!widget || !widget.isActive) return res.status(404).json({ error: 'Widget inativo' });

        const visitorId = String(req.query.visitorId || '');
        if (!visitorId) return res.status(400).json({ error: 'visitorId é obrigatório' });

        const { tenantStorage } = require('../../lib/db');
        const { createTenantPrisma } = require('../../lib/prisma-tenant');

        await tenantStorage.run({ tenantId: widget.tenantId, prisma: createTenantPrisma(widget.tenantId) }, async () => {
            const { session, ticket } = await WidgetService.findOrCreateSession(widget.id, visitorId);
            const messages = await WidgetService.getSessionMessages(ticket.id);
            res.json({ ticketId: ticket.id, sessionId: session.id, messages });
        });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /api/widgets/public/:token/identify — visitor CRM identification
router.post('/public/:token/identify', async (req, res) => {
    try {
        const widget = await WidgetService.findByToken(req.params.token);
        if (!widget || !widget.isActive) return res.status(404).json({ error: 'Widget inativo' });

        const { sessionId, fullName, cpf, email } = req.body;
        if (!sessionId) return res.status(400).json({ error: 'sessionId é obrigatório' });

        const { tenantStorage } = require('../../lib/db');
        const { createTenantPrisma } = require('../../lib/prisma-tenant');

        await tenantStorage.run({ tenantId: widget.tenantId, prisma: createTenantPrisma(widget.tenantId) }, async () => {
            const contact = await WidgetService.identifyVisitor(sessionId, { fullName, cpf, email });
            res.json(contact);
        });
    } catch (e: any) { res.status(400).json({ error: e.message }); }
});

export default router;
