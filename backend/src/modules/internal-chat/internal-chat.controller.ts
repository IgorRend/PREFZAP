import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { InternalChatService } from './internal-chat.service';
import { requireAuth, requireAdmin, AuthRequest } from '../auth/auth.middleware';

const router = Router();

// ─── File Upload Config (64MB limit) ─────────────────────
const uploadDir = path.resolve('uploads/internal-chat');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${uuidv4()}${ext}`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 64 * 1024 * 1024 }, // 64MB
});

// ─── Routes ──────────────────────────────────────────────

// GET /api/internal-chat/users — List all users for chat
router.get('/users', requireAuth, async (_req, res) => {
    try {
        const users = await InternalChatService.getAllUsers();
        res.json(users);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/internal-chat/rooms — List user's rooms
router.get('/rooms', requireAuth, async (req: AuthRequest, res) => {
    try {
        const rooms = await InternalChatService.getUserRooms(req.userId!);
        res.json(rooms);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/internal-chat/rooms/direct/:targetUserId — Get or create direct room
router.post('/rooms/direct/:targetUserId', requireAuth, async (req: AuthRequest, res) => {
    try {
        const room = await InternalChatService.getOrCreateDirectRoom(req.userId!, req.params.targetUserId as string, req.tenantId!);
        res.json(room);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// POST /api/internal-chat/rooms/group — Create group (admin only)
router.post('/rooms/group', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
        const { name, memberIds } = req.body;
        if (!name) return res.status(400).json({ error: 'Nome do grupo é obrigatório' });
        const room = await InternalChatService.createGroup(name, req.userId!, memberIds || [], req.tenantId!);
        res.status(201).json(room);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// GET /api/internal-chat/rooms/:roomId/messages — Get messages
router.get('/rooms/:roomId/messages', requireAuth, async (req: AuthRequest, res) => {
    try {
        const { cursor } = req.query;
        const messages = await InternalChatService.getRoomMessages(
            req.params.roomId as string,
            req.userId!,
            cursor as string | undefined,
        );
        res.json(messages);
    } catch (error: any) {
        res.status(403).json({ error: error.message });
    }
});

// POST /api/internal-chat/rooms/:roomId/messages — Send message
router.post('/rooms/:roomId/messages', requireAuth, async (req: AuthRequest, res) => {
    try {
        const { content, attachmentUrl, messageType } = req.body;
        const message = await InternalChatService.sendMessage(
            req.params.roomId as string,
            req.userId!,
            content,
            attachmentUrl,
            messageType,
        );
        // Emit via socket
        const { getIO } = await import('../../lib/socket');
        getIO().to(`internal:${req.params.roomId}`).emit('internal:message', message);
        res.status(201).json(message);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// POST /api/internal-chat/rooms/:roomId/read — Mark as read
router.post('/rooms/:roomId/read', requireAuth, async (req: AuthRequest, res) => {
    try {
        const readMessageIds = await InternalChatService.markAsRead(req.params.roomId as string, req.userId!);
        // Emit read receipts
        if (readMessageIds.length > 0) {
            const { getIO } = await import('../../lib/socket');
            getIO().to(`internal:${req.params.roomId}`).emit('internal:read', {
                userId: req.userId,
                roomId: req.params.roomId,
                messageIds: readMessageIds,
            });
        }
        res.json({ marked: readMessageIds.length });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// POST /api/internal-chat/rooms/:roomId/members — Add member (admin only)
router.post('/rooms/:roomId/members', requireAuth, async (req: AuthRequest, res) => {
    try {
        const { userId } = req.body;
        const room = await InternalChatService.addGroupMember(req.params.roomId as string, userId, req.userId!);
        res.json(room);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// DELETE /api/internal-chat/rooms/:roomId/members/:userId — Remove member (admin only)
router.delete('/rooms/:roomId/members/:userId', requireAuth, async (req: AuthRequest, res) => {
    try {
        const room = await InternalChatService.removeGroupMember(req.params.roomId as string, req.params.userId as string, req.userId!);
        res.json(room);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// POST /api/internal-chat/upload — Upload file
router.post('/upload', requireAuth, upload.single('file'), async (req: AuthRequest, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
        const fileUrl = `/uploads/internal-chat/${req.file.filename}`;
        res.json({
            url: fileUrl,
            originalName: req.file.originalname,
            size: req.file.size,
            mimeType: req.file.mimetype,
        });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

export default router;
