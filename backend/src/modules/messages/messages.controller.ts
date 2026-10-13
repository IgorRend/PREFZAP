import { Router } from 'express';
import multer from 'multer';
import { MessagesService, OutboundMessage } from './messages.service';
import { requireAuth, AuthRequest } from '../auth/auth.middleware';
import { WhatsAppClient } from '../../lib/whatsapp';
import { StorageService } from '../../lib/storage.service';

const MAX_FILE_SIZE = 64 * 1024 * 1024; // 64 MB

// Use memory storage — StorageService handles tenant-isolated disk writes
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE },
}).single('file');

function mediaType(mime: string): 'image' | 'video' | 'audio' | 'document' {
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    return 'document';
}

const ALLOWED_MIME_TYPES = new Set([
    'image/jpeg','image/jpg','image/png','image/webp','image/gif',
    'video/mp4','video/3gpp','video/quicktime',
    'audio/ogg','audio/mpeg','audio/mp4','audio/aac','audio/wav',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip','text/plain',
]);

async function resolveTicketTenant(ticketId: string): Promise<string | null> {
    const { prisma } = await import('../../server');
    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, select: { tenantId: true } });
    return ticket?.tenantId ?? null;
}

const router = Router();

// GET /api/messages/:ticketId
router.get('/:ticketId', requireAuth, async (req, res) => {
    try {
        const messages = await MessagesService.findByTicket(req.params.ticketId as string);
        res.json(messages);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/messages/:ticketId/window-status
router.get('/:ticketId/window-status', requireAuth, async (req, res) => {
    try {
        const status = await MessagesService.checkWindowStatus(req.params.ticketId as string);
        res.json(status);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// POST /api/messages/:ticketId/send — Generic send (text, media, link, reaction)
router.post('/:ticketId/send', requireAuth, async (req: AuthRequest, res) => {
    try {
        const ticketTenant = await resolveTicketTenant(req.params.ticketId as string);
        if (!ticketTenant || ticketTenant !== req.tenantId) {
            return res.status(403).json({ error: 'Acesso negado a este ticket' });
        }

        const body: OutboundMessage = req.body;
        if (!body || !body.type) return res.status(400).json({ error: 'Tipo de mensagem é obrigatório' });

        const enriched = { ...body, ticketId: req.params.ticketId } as OutboundMessage;
        if ('origin' in enriched && !enriched.origin) (enriched as any).origin = 'AGENT';
        if ('userId' in enriched && !enriched.userId) (enriched as any).userId = req.userId;

        const result = await MessagesService.sendMessage(enriched);
        res.status(201).json(result);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// POST /api/messages/:ticketId — Send free-text message
router.post('/:ticketId', requireAuth, async (req: AuthRequest, res) => {
    try {
        const ticketTenant = await resolveTicketTenant(req.params.ticketId as string);
        if (!ticketTenant || ticketTenant !== req.tenantId) {
            return res.status(403).json({ error: 'Acesso negado a este ticket' });
        }

        const { body } = req.body;
        if (!body) return res.status(400).json({ error: 'Mensagem é obrigatória' });

        const message = await MessagesService.sendAgentMessage(
            req.params.ticketId as string,
            body,
            req.userId!
        );
        res.status(201).json(message);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// POST /api/messages/:ticketId/note — Internal note (whisper)
router.post('/:ticketId/note', requireAuth, async (req: AuthRequest, res) => {
    try {
        const ticketTenant = await resolveTicketTenant(req.params.ticketId as string);
        if (!ticketTenant || ticketTenant !== req.tenantId) {
            return res.status(403).json({ error: 'Acesso negado a este ticket' });
        }

        const { body } = req.body;
        if (!body) return res.status(400).json({ error: 'Nota é obrigatória' });

        const message = await MessagesService.createInternalNote(
            req.params.ticketId as string,
            body,
            req.userId!
        );
        res.status(201).json(message);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// POST /api/messages/:ticketId/template — Send HSM template message
router.post('/:ticketId/template', requireAuth, async (req: AuthRequest, res) => {
    try {
        const ticketTenant = await resolveTicketTenant(req.params.ticketId as string);
        if (!ticketTenant || ticketTenant !== req.tenantId) {
            return res.status(403).json({ error: 'Acesso negado a este ticket' });
        }

        const { templateName, variables } = req.body;
        if (!templateName) return res.status(400).json({ error: 'templateName é obrigatório' });

        const message = await MessagesService.sendHsmMessage(
            req.params.ticketId as string,
            templateName,
            variables || {},
            req.userId!
        );
        res.status(201).json(message);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// POST /api/messages/:ticketId/media — Upload file (paste/drag-drop), max 64MB
router.post('/:ticketId/media', requireAuth, (req: AuthRequest, res) => {
    upload(req, res as any, async (err) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({ error: 'O arquivo excede o limite máximo de 64MB.' });
            }
            return res.status(400).json({ error: err.message });
        }
        try {
            const file = (req as any).file as Express.Multer.File | undefined;
            if (!file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
            if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
                return res.status(415).json({ error: `Tipo de arquivo não permitido: ${file.mimetype}` });
            }

            const ticketId = req.params.ticketId as string;
            const tenantId = req.tenantId!;
            const { prisma } = await import('../../server');

            const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
            if (!ticket) return res.status(404).json({ error: 'Ticket não encontrado.' });
            const contact = await prisma.contact.findUnique({ where: { id: ticket.contactId } });
            if (!contact) return res.status(404).json({ error: 'Contato não encontrado.' });

            // ── Save file to tenant-isolated storage ──────────────────────
            const relPath = await StorageService.saveMullerFile(tenantId, file);
            const mType = mediaType(file.mimetype);

            // Optional caption typed by the agent alongside the image/video/document.
            const rawCaption = typeof (req as any).body?.caption === 'string' ? (req as any).body.caption.trim() : '';
            const caption = rawCaption || undefined;

            // Send via WhatsApp — pass the in-memory buffer directly so the backend
            // doesn't HTTP-fetch its own /uploads URL (avoids a self round-trip and
            // any dependency on BACKEND_URL being reachable).
            try {
                const waClient = await WhatsAppClient.getClientForTicket(ticketId);
                const phone = contact.phone;
                if (mType === 'image') await waClient.sendImageMessage(phone, file.buffer, caption, undefined, file.mimetype);
                else if (mType === 'video') await waClient.sendVideoMessage(phone, file.buffer, caption, undefined, file.mimetype);
                else if (mType === 'audio') await waClient.sendAudioMessage(phone, file.buffer, file.mimetype);
                else await waClient.sendDocumentMessage(phone, file.buffer, file.originalname, caption, undefined, file.mimetype);
            } catch (waError) {
                console.warn('[media] WhatsApp send failed (file recorded anyway):', waError);
            }

            // Save to DB — store the RELATIVE path so the media is reachable from
            // any host/IP (the browser resolves it against the current origin).
            // publicUrl (absolute) is kept only for the WhatsApp send above.
            // Body shown in the timeline:
            //  - image/video: the caption (empty when none — the file speaks for itself)
            //  - document: the caption when typed, otherwise the filename (shown as the
            //    download label in its own bubble)
            //  - audio: nothing
            const timelineBody = mType === 'document' ? (caption || file.originalname)
                : mType === 'audio' ? ''
                : (caption ?? '');
            const message = await MessagesService.create({
                ticketId,
                mediaUrl: relPath,
                mediaType: mType,
                body: timelineBody,
                origin: 'AGENT',
                userId: req.userId!,
            });

            res.status(201).json(message);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });
});

// DELETE /api/messages/:id — Delete message for everyone
router.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
        const { prisma } = await import('../../server');
        const message = await prisma.message.findUnique({ 
            where: { id: req.params.id as string },
            include: { ticket: true }
        });
        if (!message) return res.status(404).json({ error: 'Mensagem não encontrada' });
        
        if (message.whatsappMessageId) {
            const waClient = await WhatsAppClient.getClientForTicket(message.ticketId);
            try {
                // Resolve contact phone for the chat JID
                const ticket = await prisma.ticket.findUnique({
                    where: { id: message.ticketId },
                    include: { contact: { select: { phone: true } } },
                });
                const chatJid = ticket?.contact?.phone;
                await waClient.deleteMessage(message.whatsappMessageId, chatJid);
            } catch (err) {
                console.warn('[messages] WhatsApp delete failed:', err);
            }
        }
        
        await prisma.message.delete({ where: { id: message.id } });
        
        const { getIO, tenantRoom } = await import('../../lib/socket');
        const msgTicket = await prisma.ticket.findUnique({ where: { id: message.ticketId }, select: { tenantId: true } });
        if (msgTicket) getIO().to(tenantRoom(msgTicket.tenantId)).emit('message:delete', message.id);
        
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
