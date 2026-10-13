import { Router } from 'express';
import { KanbanService } from './kanban.service';
import { requireAuth, requireAdmin, AuthRequest } from '../auth/auth.middleware';

const router = Router();

// ─── Boards ───────────────────────────────────────────────

// GET /api/kanban/boards
router.get('/boards', requireAuth, async (_req, res) => {
    try { res.json(await KanbanService.listBoards()); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /api/kanban/boards/:id
router.get('/boards/:id', requireAuth, async (req, res) => {
    try {
        const board = await KanbanService.getBoard(req.params.id as string);
        if (!board) return res.status(404).json({ error: 'Board não encontrado' });
        res.json(board);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /api/kanban/boards
router.post('/boards', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try { res.status(201).json(await KanbanService.createBoard(req.body)); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
});

// PUT /api/kanban/boards/:id
router.put('/boards/:id', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try { res.json(await KanbanService.updateBoard(req.params.id as string, req.body)); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
});

// DELETE /api/kanban/boards/:id
router.delete('/boards/:id', requireAuth, requireAdmin, async (req, res) => {
    try { await KanbanService.deleteBoard(req.params.id as string); res.json({ success: true }); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ─── Columns ──────────────────────────────────────────────

// POST /api/kanban/boards/:boardId/columns
router.post('/boards/:boardId/columns', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try { res.status(201).json(await KanbanService.createColumn(req.params.boardId as string, req.body)); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
});

// PUT /api/kanban/columns/:id
router.put('/columns/:id', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try { res.json(await KanbanService.updateColumn(req.params.id as string, req.body)); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
});

// DELETE /api/kanban/columns/:id
router.delete('/columns/:id', requireAuth, requireAdmin, async (req, res) => {
    try { await KanbanService.deleteColumn(req.params.id as string); res.json({ success: true }); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
});

// PUT /api/kanban/boards/:boardId/columns/reorder
router.put('/boards/:boardId/columns/reorder', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try { res.json(await KanbanService.reorderColumns(req.params.boardId as string, req.body.order)); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ─── Ticket Move ──────────────────────────────────────────

// PATCH /api/kanban/tickets/:ticketId/move
router.patch('/tickets/:ticketId/move', requireAuth, async (req: AuthRequest, res) => {
    try {
        const { columnId } = req.body; // can be null to unassign
        const ticket = await KanbanService.moveTicket(req.params.ticketId as string, columnId || null);
        res.json(ticket);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
});

export default router;
