import { Router } from 'express';
import { ConnectionsService } from './connections.service';
import { WhatsAppClient } from '../../lib/whatsapp';
import { requireAuth, requireAdmin, AuthRequest } from '../auth/auth.middleware';

const router = Router();

// GET /api/connections — list all connections (scoped to caller's tenant)
router.get('/', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
        const connections = await ConnectionsService.findAll(req.tenantId!);
        res.json(connections);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/connections/:id — get single connection (ownership verified)
router.get('/:id', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
        const connection = await ConnectionsService.findById(req.params.id as string, req.tenantId!);
        res.json(connection);
    } catch (error: any) {
        const status = (error as any).status || 404;
        res.status(status).json({ error: error.message });
    }
});

// GET /api/connections/:id/qrcode — fetch QR Code from Zapo
router.get('/:id/qrcode', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
        const result = await ConnectionsService.getQrCode(req.params.id as string, req.tenantId!);
        res.json(result);
    } catch (error: any) {
        console.error('[ConnectionsController] getQrCode error:', error.message);
        const status = (error as any).status || 500;
        res.status(status).json({
            error: 'Falha ao buscar QR Code do cliente WhatsApp',
            details: error.message,
        });
    }
});

// POST /api/connections — create connection (registers with Zapo)
router.post('/', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
        const { name, type, wabaId, phoneNumberId, accessToken } = req.body;
        if (!name) {
            return res.status(400).json({ error: 'O nome da conexão é obrigatório' });
        }
        const reqType = type || 'qr_code_web';
        if (reqType === 'official_meta') {
            if (!accessToken) {
                return res.status(400).json({ error: 'Access Token é obrigatório para conexão Oficial Meta' });
            }
        }

        const connection = await ConnectionsService.create({ name, type: reqType, wabaId, phoneNumberId, accessToken, tenantId: req.tenantId! });
        res.status(201).json(connection);
    } catch (error: any) {
        console.error('[ConnectionsController] create error:', error.message);
        res.status(500).json({
            error: 'Falha na comunicação com o cliente WhatsApp',
            details: error.message,
        });
    }
});

// PUT /api/connections/:id — update connection
router.put('/:id', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
        const connection = await ConnectionsService.update(req.params.id as string, req.body);
        res.json(connection);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// DELETE /api/connections/:id — delete connection (ownership verified)
router.delete('/:id', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
        await ConnectionsService.delete(req.params.id as string, req.tenantId!);
        res.json({ message: 'Conexão removida' });
    } catch (error: any) {
        const status = (error as any).status || 400;
        res.status(status).json({ error: error.message });
    }
});

// POST /api/connections/:id/test — test connection state (ownership verified)
router.post('/:id/test', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
        const result = await ConnectionsService.testConnection(req.params.id as string, req.tenantId!);
        res.json(result);
    } catch (error: any) {
        const status = (error as any).status || 400;
        res.status(status).json({ error: error.message });
    }
});

// POST /api/connections/:id/restart — restart Zapo instance (ownership verified)
router.post('/:id/restart', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
        const result = await ConnectionsService.restartInstance(req.params.id as string, req.tenantId!);
        res.json(result);
    } catch (error: any) {
        const status = (error as any).status || 400;
        res.status(status).json({ error: error.message });
    }
});

// GET /api/connections/:id/avatar/:number — fetch contact avatar (ownership verified)
router.get('/:id/avatar/:number', requireAuth, async (req: AuthRequest, res) => {
    try {
        const conn = await ConnectionsService.findById(req.params.id as string, req.tenantId!);
        if (!conn) {
            return res.status(404).json({ error: 'Conexão não encontrada.' });
        }
        const waClient = new WhatsAppClient(undefined, undefined, undefined, conn.id);
        const result = await waClient.getUserAvatar(req.params.number as string);
        res.json(result);
    } catch (error: any) {
        const status = (error as any).status || 500;
        res.status(status).json({ error: 'Falha ao buscar avatar', details: error.message });
    }
});

export default router;
