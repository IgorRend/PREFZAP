import { Router } from 'express';
import { requireAuth, AuthRequest } from '../auth/auth.middleware';
import { ZapoCompatService } from './zapo-compat.service';
import { WhatsAppClient } from '../../lib/whatsapp';
import { prisma } from '../../server';

const router = Router();

// Helper: get the active connection ID for the current context
async function getConnectionId(): Promise<string | null> {
    const conn = await prisma.whatsAppConnection.findFirst({
        where: { isConnected: true },
    });
    return conn?.id ?? null;
}

// ─── Chat Operations ─────────────────────────────────────────────────────

router.post('/chat/archive', requireAuth, async (req, res) => {
    try {
        const { phone, archive = true } = req.body;
        if (!phone) return res.status(400).json({ error: 'phone é obrigatório' });
        const connectionId = await getConnectionId();
        if (!connectionId) return res.status(500).json({ error: 'Nenhuma conexão ativa encontrada.' });
        const result = await ZapoCompatService.archiveChat(connectionId, phone, archive);
        res.json(result);
    } catch (error: any) { res.status(400).json({ error: error.message }); }
});

router.post('/chat/mute', requireAuth, async (req, res) => {
    try {
        const { phone, duration } = req.body;
        if (!phone) return res.status(400).json({ error: 'phone é obrigatório' });
        const connectionId = await getConnectionId();
        if (!connectionId) return res.status(500).json({ error: 'Nenhuma conexão ativa encontrada.' });
        const result = await ZapoCompatService.muteChat(connectionId, phone, duration);
        res.json(result);
    } catch (error: any) { res.status(400).json({ error: error.message }); }
});

router.post('/chat/pin', requireAuth, async (req, res) => {
    try {
        const { phone } = req.body;
        if (!phone) return res.status(400).json({ error: 'phone é obrigatório' });
        const connectionId = await getConnectionId();
        if (!connectionId) return res.status(500).json({ error: 'Nenhuma conexão ativa encontrada.' });
        const result = await ZapoCompatService.pinChat(connectionId, phone);
        res.json(result);
    } catch (error: any) { res.status(400).json({ error: error.message }); }
});

router.post('/chat/unpin', requireAuth, async (req, res) => {
    try {
        const { phone } = req.body;
        if (!phone) return res.status(400).json({ error: 'phone é obrigatório' });
        const connectionId = await getConnectionId();
        if (!connectionId) return res.status(500).json({ error: 'Nenhuma conexão ativa encontrada.' });
        const result = await ZapoCompatService.unpinChat(connectionId, phone);
        res.json(result);
    } catch (error: any) { res.status(400).json({ error: error.message }); }
});

// ─── Group Operations ────────────────────────────────────────────────────

router.post('/group/create', requireAuth, async (req, res) => {
    try {
        const { name, participants } = req.body;
        if (!name || !participants) return res.status(400).json({ error: 'name e participants são obrigatórios' });
        const connectionId = await getConnectionId();
        if (!connectionId) return res.status(500).json({ error: 'Nenhuma conexão ativa encontrada.' });
        const result = await ZapoCompatService.createGroup(connectionId, name, participants);
        res.json(result);
    } catch (error: any) { res.status(400).json({ error: error.message }); }
});

router.post('/group/info', requireAuth, async (req, res) => {
    try {
        const { groupId } = req.body;
        if (!groupId) return res.status(400).json({ error: 'groupId é obrigatório' });
        const connectionId = await getConnectionId();
        if (!connectionId) return res.status(500).json({ error: 'Nenhuma conexão ativa encontrada.' });
        const result = await ZapoCompatService.getGroupInfo(connectionId, groupId);
        res.json(result);
    } catch (error: any) { res.status(400).json({ error: error.message }); }
});

router.post('/group/invite-link', requireAuth, async (req, res) => {
    try {
        const { groupId } = req.body;
        if (!groupId) return res.status(400).json({ error: 'groupId é obrigatório' });
        const connectionId = await getConnectionId();
        if (!connectionId) return res.status(500).json({ error: 'Nenhuma conexão ativa encontrada.' });
        const result = await ZapoCompatService.getGroupInviteLink(connectionId, groupId);
        res.json(result);
    } catch (error: any) { res.status(400).json({ error: error.message }); }
});

router.post('/group/join', requireAuth, async (req, res) => {
    try {
        const { inviteCode } = req.body;
        if (!inviteCode) return res.status(400).json({ error: 'inviteCode é obrigatório' });
        const connectionId = await getConnectionId();
        if (!connectionId) return res.status(500).json({ error: 'Nenhuma conexão ativa encontrada.' });
        const result = await ZapoCompatService.joinGroupByLink(connectionId, inviteCode);
        res.json(result);
    } catch (error: any) { res.status(400).json({ error: error.message }); }
});

router.get('/groups', requireAuth, async (req, res) => {
    try {
        const connectionId = await getConnectionId();
        if (!connectionId) return res.status(500).json({ error: 'Nenhuma conexão ativa encontrada.' });
        const result = await ZapoCompatService.listGroups(connectionId);
        res.json(result);
    } catch (error: any) { res.status(400).json({ error: error.message }); }
});

router.get('/groups/my', requireAuth, async (req, res) => {
    try {
        const connectionId = await getConnectionId();
        if (!connectionId) return res.status(500).json({ error: 'Nenhuma conexão ativa encontrada.' });
        const result = await ZapoCompatService.getMyGroups(connectionId);
        res.json(result);
    } catch (error: any) { res.status(400).json({ error: error.message }); }
});

router.post('/group/set-name', requireAuth, async (req, res) => {
    try {
        const { groupId, name } = req.body;
        if (!groupId || !name) return res.status(400).json({ error: 'groupId e name são obrigatórios' });
        const connectionId = await getConnectionId();
        if (!connectionId) return res.status(500).json({ error: 'Nenhuma conexão ativa encontrada.' });
        const result = await ZapoCompatService.setGroupName(connectionId, groupId, name);
        res.json(result);
    } catch (error: any) { res.status(400).json({ error: error.message }); }
});

router.post('/group/participant', requireAuth, async (req, res) => {
    try {
        const { groupId, phone, action } = req.body;
        if (!groupId || !phone || !action) return res.status(400).json({ error: 'groupId, phone e action são obrigatórios' });
        const connectionId = await getConnectionId();
        if (!connectionId) return res.status(500).json({ error: 'Nenhuma conexão ativa encontrada.' });
        const result = await ZapoCompatService.updateParticipant(connectionId, groupId, phone, action);
        res.json(result);
    } catch (error: any) { res.status(400).json({ error: error.message }); }
});

router.post('/group/set-photo', requireAuth, async (req, res) => {
    try {
        const { groupId, photoUrl } = req.body;
        if (!groupId || !photoUrl) return res.status(400).json({ error: 'groupId e photoUrl são obrigatórios' });
        const connectionId = await getConnectionId();
        if (!connectionId) return res.status(500).json({ error: 'Nenhuma conexão ativa encontrada.' });
        const result = await ZapoCompatService.setGroupPhoto(connectionId, groupId, photoUrl);
        res.json(result);
    } catch (error: any) { res.status(400).json({ error: error.message }); }
});

// ─── User Operations ─────────────────────────────────────────────────────

router.post('/user/avatar', requireAuth, async (req, res) => {
    try {
        const { phone } = req.body;
        if (!phone) return res.status(400).json({ error: 'phone é obrigatório' });
        const connectionId = await getConnectionId();
        if (!connectionId) return res.status(500).json({ error: 'Nenhuma conexão ativa encontrada.' });
        const result = await ZapoCompatService.getUserAvatar(connectionId, phone);
        res.json(result);
    } catch (error: any) { res.status(400).json({ error: error.message }); }
});

router.post('/user/block', requireAuth, async (req, res) => {
    try {
        const { phone } = req.body;
        if (!phone) return res.status(400).json({ error: 'phone é obrigatório' });
        const connectionId = await getConnectionId();
        if (!connectionId) return res.status(500).json({ error: 'Nenhuma conexão ativa encontrada.' });
        const result = await ZapoCompatService.blockContact(connectionId, phone);
        res.json(result);
    } catch (error: any) { res.status(400).json({ error: error.message }); }
});

router.get('/user/block-list', requireAuth, async (_req, res) => {
    try {
        const connectionId = await getConnectionId();
        if (!connectionId) return res.status(500).json({ error: 'Nenhuma conexão ativa encontrada.' });
        const result = await ZapoCompatService.getBlockList(connectionId);
        res.json(result);
    } catch (error: any) { res.status(400).json({ error: error.message }); }
});

router.post('/user/check', requireAuth, async (req, res) => {
    try {
        const { phone } = req.body;
        if (!phone) return res.status(400).json({ error: 'phone é obrigatório' });
        const connectionId = await getConnectionId();
        if (!connectionId) return res.status(500).json({ error: 'Nenhuma conexão ativa encontrada.' });
        const result = await ZapoCompatService.checkUser(connectionId, phone);
        res.json(result);
    } catch (error: any) { res.status(400).json({ error: error.message }); }
});

router.get('/user/contacts', requireAuth, async (_req, res) => {
    try {
        const connectionId = await getConnectionId();
        if (!connectionId) return res.status(500).json({ error: 'Nenhuma conexão ativa encontrada.' });
        const result = await ZapoCompatService.getContacts(connectionId);
        res.json(result);
    } catch (error: any) { res.status(400).json({ error: error.message }); }
});

router.post('/user/get', requireAuth, async (req, res) => {
    try {
        const { phone } = req.body;
        if (!phone) return res.status(400).json({ error: 'phone é obrigatório' });
        const connectionId = await getConnectionId();
        if (!connectionId) return res.status(500).json({ error: 'Nenhuma conexão ativa encontrada.' });
        const result = await ZapoCompatService.getUser(connectionId, phone);
        res.json(result);
    } catch (error: any) { res.status(400).json({ error: error.message }); }
});

router.get('/user/privacy', requireAuth, async (_req, res) => {
    try {
        const connectionId = await getConnectionId();
        if (!connectionId) return res.status(500).json({ error: 'Nenhuma conexão ativa encontrada.' });
        const result = await ZapoCompatService.getPrivacySettings(connectionId);
        res.json(result);
    } catch (error: any) { res.status(400).json({ error: error.message }); }
});

router.post('/user/profile-picture', requireAuth, async (req, res) => {
    try {
        const { photoUrl } = req.body;
        if (!photoUrl) return res.status(400).json({ error: 'photoUrl é obrigatório' });
        const connectionId = await getConnectionId();
        if (!connectionId) return res.status(500).json({ error: 'Nenhuma conexão ativa encontrada.' });
        const result = await ZapoCompatService.setProfilePicture(connectionId, photoUrl);
        res.json(result);
    } catch (error: any) { res.status(400).json({ error: error.message }); }
});

router.post('/user/unblock', requireAuth, async (req, res) => {
    try {
        const { phone } = req.body;
        if (!phone) return res.status(400).json({ error: 'phone é obrigatório' });
        const connectionId = await getConnectionId();
        if (!connectionId) return res.status(500).json({ error: 'Nenhuma conexão ativa encontrada.' });
        const result = await ZapoCompatService.unblockContact(connectionId, phone);
        res.json(result);
    } catch (error: any) { res.status(400).json({ error: error.message }); }
});

// ─── Label Operations ────────────────────────────────────────────────────

router.post('/label/chat', requireAuth, async (req, res) => {
    try {
        const { phone, labelId, action = 'add' } = req.body;
        if (!phone || !labelId) return res.status(400).json({ error: 'phone e labelId são obrigatórios' });
        const connectionId = await getConnectionId();
        if (!connectionId) return res.status(500).json({ error: 'Nenhuma conexão ativa encontrada.' });
        const result = action === 'remove'
            ? await ZapoCompatService.removeLabelFromChat(connectionId, phone, labelId)
            : await ZapoCompatService.addLabelToChat(connectionId, phone, labelId);
        res.json(result);
    } catch (error: any) { res.status(400).json({ error: error.message }); }
});

router.post('/label/edit', requireAuth, async (req, res) => {
    try {
        const { labelId, name, color } = req.body;
        if (!labelId || !name || !color) return res.status(400).json({ error: 'labelId, name e color são obrigatórios' });
        const connectionId = await getConnectionId();
        if (!connectionId) return res.status(500).json({ error: 'Nenhuma conexão ativa encontrada.' });
        const result = await ZapoCompatService.editLabel(connectionId, labelId, name, color);
        res.json(result);
    } catch (error: any) { res.status(400).json({ error: error.message }); }
});

router.post('/label/message', requireAuth, async (req, res) => {
    try {
        const { messageId, labelId, action = 'add' } = req.body;
        if (!messageId || !labelId) return res.status(400).json({ error: 'messageId e labelId são obrigatórios' });
        const connectionId = await getConnectionId();
        if (!connectionId) return res.status(500).json({ error: 'Nenhuma conexão ativa encontrada.' });
        const result = action === 'remove'
            ? await ZapoCompatService.removeLabelFromMessage(connectionId, messageId, labelId)
            : await ZapoCompatService.addLabelToMessage(connectionId, messageId, labelId);
        res.json(result);
    } catch (error: any) { res.status(400).json({ error: error.message }); }
});

// ─── Contact Profile Picture Refresh ─────────────────────────────────────
// POST /api/zapo-compat/contact/refresh-avatar  — fetch avatar from Zapo and save to contact
router.post('/contact/refresh-avatar', requireAuth, async (req: AuthRequest, res) => {
    try {
        const { contactId } = req.body;
        if (!contactId) return res.status(400).json({ error: 'contactId é obrigatório' });

        const contact = await prisma.contact.findUnique({ where: { id: contactId } });
        if (!contact) return res.status(404).json({ error: 'Contato não encontrado.' });

        const connectionId = await getConnectionId();
        if (!connectionId) return res.status(500).json({ error: 'Nenhuma conexão ativa encontrada.' });

        const waClient = new WhatsAppClient(undefined, undefined, undefined, connectionId);
        const avatarResp = await waClient.getUserAvatar(contact.phone);
        const pictureUrl = avatarResp?.profilePicUrl || null;

        await prisma.contact.update({
            where: { id: contactId },
            data: { profilePicUrl: pictureUrl, avatarUrl: pictureUrl },
        });

        res.json({ contactId, profilePicUrl: pictureUrl });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

export default router;
