import { Router } from 'express';
import { TicketsService } from './tickets.service';
import { requireAuth, AuthRequest } from '../auth/auth.middleware';

const router = Router();

// GET /api/tickets
router.get('/', requireAuth, async (req: AuthRequest, res) => {
    try {
        const { status, departmentId, userId, page } = req.query;
        const result = await TicketsService.findAll({
            status: status as string | undefined,
            departmentId: departmentId as string | undefined,
            userId: userId as string | undefined,
            page: page ? parseInt(page as string) : 1,
            tenantId: req.tenantId,
        });
        res.json(result); // { total, page, pageSize, tickets }
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/tickets/search?q= — Command Palette full-text search
router.get('/search', requireAuth, async (req: AuthRequest, res) => {
    try {
        const q = (req.query.q as string || '').trim();
        if (!q) return res.json([]);
        const { prisma } = await import('../../server');
        const tickets = await prisma.ticket.findMany({
            where: {
                OR: [
                    { protocol: { contains: q } },
                    { contact: { name: { contains: q } } },
                    { contact: { phone: { contains: q } } },
                    { contact: { cpf: { contains: q } } },
                ],
            },
            include: {
                contact: { select: { id: true, name: true, phone: true, cpf: true } },
                department: { select: { name: true } },
            },
            orderBy: { updatedAt: 'desc' },
            take: 15,
        });
        res.json(tickets);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});


// GET /api/tickets/:id
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const ticket = await TicketsService.findById(req.params.id as string);
        if (!ticket) return res.status(404).json({ error: 'Ticket não encontrado' });
        res.json(ticket);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/tickets/:id/status
router.put('/:id/status', requireAuth, async (req: AuthRequest, res) => {
    try {
        const { status, departmentId, userId } = req.body;
        const ticket = await TicketsService.updateStatus(req.params.id as string, status, { departmentId, userId });
        res.json(ticket);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// PUT /api/tickets/:id/assign
router.put('/:id/assign', requireAuth, async (req: AuthRequest, res) => {
    try {
        const ticket = await TicketsService.assignToUser(req.params.id as string, req.body.userId || req.userId!);
        res.json(ticket);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// PUT /api/tickets/:id/transfer
router.put('/:id/transfer', requireAuth, async (req: AuthRequest, res) => {
    try {
        const ticket = await TicketsService.transferToDepartment(req.params.id as string, req.body.departmentId);
        res.json(ticket);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// PUT /api/tickets/:id/close
router.put('/:id/close', requireAuth, async (req: AuthRequest, res) => {
    try {
        const ticket = await TicketsService.close(req.params.id as string);
        res.json(ticket);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// ─── CHAT MANAGEMENT (Zapo) ───
import { WhatsAppClient } from '../../lib/whatsapp';

router.post('/:id/chat/archive', requireAuth, async (req: AuthRequest, res) => {
    try {
        const { prisma } = await import('../../server');
        const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id as string }, include: { contact: true } });
        if (!ticket) return res.status(404).json({ error: 'Ticket não encontrado' });
        const waClient = await WhatsAppClient.getClientForTicket(ticket.id);
        await waClient.archiveChat(ticket.contact.phone);
        res.json({ success: true });
    } catch (error: any) { res.status(400).json({ error: error.message }); }
});

router.post('/:id/chat/unarchive', requireAuth, async (req: AuthRequest, res) => {
    try {
        const { prisma } = await import('../../server');
        const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id as string }, include: { contact: true } });
        if (!ticket) return res.status(404).json({ error: 'Ticket não encontrado' });
        const waClient = await WhatsAppClient.getClientForTicket(ticket.id);
        await waClient.unarchiveChat(ticket.contact.phone);
        res.json({ success: true });
    } catch (error: any) { res.status(400).json({ error: error.message }); }
});

router.post('/:id/chat/mute', requireAuth, async (req: AuthRequest, res) => {
    try {
        const { prisma } = await import('../../server');
        const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id as string }, include: { contact: true } });
        if (!ticket) return res.status(404).json({ error: 'Ticket não encontrado' });
        const waClient = await WhatsAppClient.getClientForTicket(ticket.id);
        await waClient.muteChat(ticket.contact.phone);
        res.json({ success: true });
    } catch (error: any) { res.status(400).json({ error: error.message }); }
});

router.post('/:id/chat/unmute', requireAuth, async (req: AuthRequest, res) => {
    try {
        const { prisma } = await import('../../server');
        const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id as string }, include: { contact: true } });
        if (!ticket) return res.status(404).json({ error: 'Ticket não encontrado' });
        const waClient = await WhatsAppClient.getClientForTicket(ticket.id);
        await waClient.unmuteChat(ticket.contact.phone);
        res.json({ success: true });
    } catch (error: any) { res.status(400).json({ error: error.message }); }
});

router.post('/:id/chat/pin', requireAuth, async (req: AuthRequest, res) => {
    try {
        const { prisma } = await import('../../server');
        const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id as string }, include: { contact: true } });
        if (!ticket) return res.status(404).json({ error: 'Ticket não encontrado' });
        const waClient = await WhatsAppClient.getClientForTicket(ticket.id);
        await waClient.pinChat(ticket.contact.phone);
        res.json({ success: true });
    } catch (error: any) { res.status(400).json({ error: error.message }); }
});

router.post('/:id/chat/unpin', requireAuth, async (req: AuthRequest, res) => {
    try {
        const { prisma } = await import('../../server');
        const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id as string }, include: { contact: true } });
        if (!ticket) return res.status(404).json({ error: 'Ticket não encontrado' });
        const waClient = await WhatsAppClient.getClientForTicket(ticket.id);
        await waClient.unpinChat(ticket.contact.phone);
        res.json({ success: true });
    } catch (error: any) { res.status(400).json({ error: error.message }); }
});

router.post('/:id/chat/block', requireAuth, async (req: AuthRequest, res) => {
    try {
        const { prisma } = await import('../../server');
        const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id as string }, include: { contact: true } });
        if (!ticket) return res.status(404).json({ error: 'Ticket não encontrado' });
        const waClient = await WhatsAppClient.getClientForTicket(ticket.id);
        await waClient.blockContact(ticket.contact.phone);
        res.json({ success: true });
    } catch (error: any) { res.status(400).json({ error: error.message }); }
});

router.post('/:id/chat/unblock', requireAuth, async (req: AuthRequest, res) => {
    try {
        const { prisma } = await import('../../server');
        const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id as string }, include: { contact: true } });
        if (!ticket) return res.status(404).json({ error: 'Ticket não encontrado' });
        const waClient = await WhatsAppClient.getClientForTicket(ticket.id);
        await waClient.unblockContact(ticket.contact.phone);
        res.json({ success: true });
    } catch (error: any) { res.status(400).json({ error: error.message }); }
});

router.post('/:id/chat/read', requireAuth, async (req: AuthRequest, res) => {
    try {
        const { prisma } = await import('../../server');
        const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id as string }, include: { contact: true } });
        if (!ticket) return res.status(404).json({ error: 'Ticket não encontrado' });
        const waClient = await WhatsAppClient.getClientForTicket(ticket.id);
        await waClient.markAsRead(ticket.contact.phone);
        res.json({ success: true });
    } catch (error: any) { res.status(400).json({ error: error.message }); }
});

export default router;
