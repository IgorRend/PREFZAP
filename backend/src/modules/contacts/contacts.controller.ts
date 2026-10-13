import { Router } from 'express';
import { ContactsService } from './contacts.service';
import { requireAuth, requireAdmin, AuthRequest } from '../auth/auth.middleware';

const router = Router();

// GET /api/contacts/search?q=...&limit=20
router.get('/search', requireAuth, async (req, res) => {
    try {
        const q = String(req.query.q || '');
        const limit = parseInt(String(req.query.limit || '20'));
        const contacts = await ContactsService.search(q, limit, (req as AuthRequest).tenantId);
        res.json(contacts);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/contacts?page=1&pageSize=60&q=... — Paginated list for the Contacts screen
router.get('/', requireAuth, async (req: AuthRequest, res) => {
    try {
        const page = parseInt(String(req.query.page || '1'));
        const pageSize = parseInt(String(req.query.pageSize || '60'));
        const q = String(req.query.q || '');
        const result = await ContactsService.list({ tenantId: req.tenantId, page, pageSize, q });
        res.json(result); // { total, identifiedTotal, page, pageSize, contacts }
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/contacts/sync — Fetch device contacts from Zapo and upsert
router.post('/sync', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
        if (!req.tenantId) return res.status(403).json({ error: 'Tenant ID required' });
        const result = await ContactsService.syncDeviceContacts(req.tenantId);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/contacts/:id — Full contact profile (follows merge pointer)
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const contact = await ContactsService.findById(req.params.id as string, (req as AuthRequest).tenantId);
        if (!contact) return res.status(404).json({ error: 'Contato não encontrado' });
        res.json(contact);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/contacts/:id — Update CRM fields
router.put('/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
        const owned = await ContactsService.findById(req.params.id as string, req.tenantId);
        if (!owned) return res.status(404).json({ error: 'Contato não encontrado' });

        const { fullName, cpf, email, avatarUrl } = req.body;
        const contact = await ContactsService.update(req.params.id as string, { fullName, cpf, email, avatarUrl });

        // After updating CPF, attempt auto-merge if a duplicate CPF exists elsewhere
        if (cpf) {
            const cleaned = String(cpf).replace(/\D/g, '');
            ContactsService.autoMergeByCpf(req.params.id as string, cleaned).catch(e =>
                console.warn('[AutoMerge] Non-fatal:', e.message)
            );
        }

        res.json(contact);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// GET /api/contacts/:id/timeline?page=1&limit=50
router.get('/:id/timeline', requireAuth, async (req, res) => {
    try {
        const owned = await ContactsService.findById(req.params.id as string, (req as AuthRequest).tenantId);
        if (!owned) return res.status(404).json({ error: 'Contato não encontrado' });

        const page = parseInt(String(req.query.page || '1'));
        const limit = parseInt(String(req.query.limit || '50'));
        const data = await ContactsService.getTimeline(req.params.id as string, page, limit);
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/contacts/:id/merge — Manual merge (ADMIN only)
// Merges :id (source) INTO body.targetId (canonical)
router.post('/:id/merge', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
        const { targetId } = req.body;
        if (!targetId) return res.status(400).json({ error: 'targetId é obrigatório' });
        const result = await ContactsService.merge(
            req.params.id as string,
            String(targetId),
            req.userId!,
            'manual'
        );
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// GET /api/contacts/:id/merge-history
router.get('/:id/merge-history', requireAuth, requireAdmin, async (req, res) => {
    try {
        const history = await ContactsService.getMergeHistory(req.params.id as string);
        res.json(history);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});
// GET /api/contacts/:phone/avatar — Fetch avatar automatically using active connection
router.get('/:phone/avatar', requireAuth, async (req, res) => {
    try {
        const { prisma } = await import('../../server');
        const conn = await prisma.whatsAppConnection.findFirst({ where: { isConnected: true } });
        if (!conn) {
            return res.status(404).json({ error: 'Nenhuma conexão ativa encontrada' });
        }
        const { WhatsAppClient } = await import('../../lib/whatsapp');
        const waClient = new WhatsAppClient(undefined, undefined, undefined, conn.id);
        const result = await waClient.getUserAvatar(req.params.phone as string);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
