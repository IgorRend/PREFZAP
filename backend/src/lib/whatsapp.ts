import { ZapoService } from './zapo';
import axios from 'axios';

/**
 * WhatsAppClient — abstraction layer for sending messages via Zapo.
 */
class WhatsAppClient {
    private connectionId: string | null;

    constructor(_phoneNumberId?: string, _token?: string, _connectionType?: string, connectionId: string | null = null) {
        this.connectionId = connectionId;
    }

    static forConnection(_phoneNumberId: string, _accessToken: string, _connectionType: string = 'qr_code_web', connectionId: string | null = null): WhatsAppClient {
        return new WhatsAppClient(undefined, undefined, _connectionType, connectionId);
    }

    static async getClientForTicket(ticketId: string): Promise<WhatsAppClient> {
        try {
            const { prisma } = await import('../server');
            // First resolve the ticket to get its tenantId
            const ticket = await prisma.ticket.findUnique({
                where: { id: ticketId },
                select: { tenantId: true }
            });
            if (!ticket) {
                console.warn(`[WhatsAppClient] getClientForTicket: ticket ${ticketId} not found, falling back to any connection`);
                const conn = await prisma.whatsAppConnection.findFirst({ where: { isConnected: true } });
                if (conn) return new WhatsAppClient(conn.phoneNumberId || '', undefined, conn.type, conn.id);
                return new WhatsAppClient();
            }
            // Find a connected connection for this tenant
            const conn = await prisma.whatsAppConnection.findFirst({
                where: { isConnected: true, tenantId: ticket.tenantId }
            });
            if (conn) {
                console.log(`[WhatsAppClient] getClientForTicket: resolved ticket ${ticketId} → tenant ${ticket.tenantId} → connection ${conn.id}`);
                return new WhatsAppClient(conn.phoneNumberId || '', undefined, conn.type, conn.id);
            }
            console.warn(`[WhatsAppClient] getClientForTicket: no connected connection for tenant ${ticket.tenantId}`);
        } catch (error) {
            console.error('[WhatsAppClient] getClientForTicket Error:', error);
        }
        return new WhatsAppClient();
    }

    private async getActiveConnectionId(): Promise<string> {
        if (this.connectionId) return this.connectionId;
        const { prisma } = await import('../server');
        const conn = await prisma.whatsAppConnection.findFirst({ where: { isConnected: true } });
        if (!conn) throw new Error('Nenhuma conexão ativa encontrada.');
        return conn.id;
    }

    async downloadMedia(mediaUrl: string): Promise<Buffer> {
        const response = await axios.get(mediaUrl, {
            responseType: 'arraybuffer',
            timeout: 30_000,
            maxContentLength: 64 * 1024 * 1024,
        });
        return Buffer.from(response.data);
    }

    // ─── Send Messages ───

    async sendTextMessage(to: string, text: string, senderName?: string) {
        const connId = await this.getActiveConnectionId();
        const client = ZapoService.getClient(connId);
        const finalJid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
        const finalText = senderName ? `*${senderName}*\n\n${text}` : text;
        console.log(`[WhatsAppClient] sendTextMessage → connId=${connId} jid=${finalJid} senderName=${senderName || '(none)'}`);
        const result = await client.message.send(finalJid, finalText);
        console.log(`[WhatsAppClient] sendTextMessage ✓ msgId=${result.id}`);
        return { messages: [{ id: result.id }], key: { id: result.id } };
    }

    async sendImageMessage(to: string, imageUrl: string | Buffer, caption?: string, senderName?: string, mimetype?: string) {
        const connId = await this.getActiveConnectionId();
        const client = ZapoService.getClient(connId);
        const finalJid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
        const finalCaption = senderName ? `*${senderName}*\n\n${caption || ''}` : caption;

        let mediaInput: string | Buffer = imageUrl;
        if (typeof imageUrl === 'string' && imageUrl.startsWith('http')) {
            mediaInput = await this.downloadMedia(imageUrl);
        }
        
        const result = await client.message.send(finalJid, {
            type: 'image',
            media: mediaInput,
            caption: finalCaption,
            mimetype
        });
        return { messages: [{ id: result.id }], key: { id: result.id } };
    }

    async sendDocumentMessage(to: string, documentUrl: string | Buffer, filename: string, caption?: string, senderName?: string, mimetype?: string) {
        const connId = await this.getActiveConnectionId();
        const client = ZapoService.getClient(connId);
        const finalJid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
        const finalCaption = senderName ? `*${senderName}*\n\n${caption || ''}` : caption;

        let mediaInput: string | Buffer = documentUrl;
        if (typeof documentUrl === 'string' && documentUrl.startsWith('http')) {
            mediaInput = await this.downloadMedia(documentUrl);
        }

        const result = await client.message.send(finalJid, {
            type: 'document',
            media: mediaInput,
            fileName: filename,
            title: filename,
            caption: finalCaption,
            mimetype
        });
        return { messages: [{ id: result.id }], key: { id: result.id } };
    }

    async sendAudioMessage(to: string, audioUrl: string | Buffer, mimetype?: string) {
        const connId = await this.getActiveConnectionId();
        const client = ZapoService.getClient(connId);
        const finalJid = to.includes('@') ? to : `${to}@s.whatsapp.net`;

        let mediaInput: string | Buffer = audioUrl;
        if (typeof audioUrl === 'string' && audioUrl.startsWith('http')) {
            mediaInput = await this.downloadMedia(audioUrl);
        }

        const result = await client.message.send(finalJid, {
            type: 'audio',
            media: mediaInput,
            mimetype
        });
        return { messages: [{ id: result.id }], key: { id: result.id } };
    }

    async sendVideoMessage(to: string, videoUrl: string | Buffer, caption?: string, senderName?: string, mimetype?: string) {
        const connId = await this.getActiveConnectionId();
        const client = ZapoService.getClient(connId);
        const finalJid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
        const finalCaption = senderName ? `*${senderName}*\n\n${caption || ''}` : caption;
        
        let mediaInput: string | Buffer = videoUrl;
        if (typeof videoUrl === 'string' && videoUrl.startsWith('http')) {
            mediaInput = await this.downloadMedia(videoUrl);
        }

        const result = await client.message.send(finalJid, {
            type: 'video',
            media: mediaInput,
            caption: finalCaption,
            mimetype
        });
        return { messages: [{ id: result.id }], key: { id: result.id } };
    }

    async sendLinkMessage(to: string, url: string, text: string, title: string, description: string, imgUrl?: string) {
        const connId = await this.getActiveConnectionId();
        const client = ZapoService.getClient(connId);
        const finalJid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
        
        let thumbnailBytes: Uint8Array | undefined;
        if (imgUrl) {
            try {
                const buf = await this.downloadMedia(imgUrl);
                thumbnailBytes = new Uint8Array(buf);
            } catch (err) {
                console.error('[WhatsAppClient] Failed to download link thumbnail:', err);
            }
        }

        const result = await client.message.send(finalJid, {
            type: 'text',
            text,
            linkPreview: {
                matchedText: url,
                title,
                description,
                ...(thumbnailBytes ? { thumbnail: { bytes: thumbnailBytes } } : {})
            }
        });
        return { messages: [{ id: result.id }], key: { id: result.id } };
    }

    async sendReaction(to: string, messageId: string, emoji: string) {
        const connId = await this.getActiveConnectionId();
        const client = ZapoService.getClient(connId);
        const finalJid = to.includes('@') ? to : `${to}@s.whatsapp.net`;

        const { prisma } = await import('../server');
        const dbMsg = await prisma.message.findFirst({ where: { whatsappMessageId: messageId } });
        const fromMe = dbMsg ? (dbMsg.origin === 'AGENT' || dbMsg.origin === 'BOT') : false;

        const result = await client.message.send(finalJid, {
            type: 'reaction',
            emoji,
            target: { remoteJid: finalJid, id: messageId, fromMe }
        });
        return { messages: [{ id: result.id }], key: { id: result.id } };
    }

    async sendTemplateMessage(_to: string, _templateName: string, _languageCode: string = 'pt_BR', _components: any[] = []): Promise<never> {
        throw new Error('Template HSM não suportado via Zapo. Use conexão Oficial Meta.');
    }

    async sendLocationMessage(to: string, latitude: number, longitude: number, name?: string, address?: string) {
        const connId = await this.getActiveConnectionId();
        const client = ZapoService.getClient(connId);
        const finalJid = to.includes('@') ? to : `${to}@s.whatsapp.net`;

        const result = await client.message.send(finalJid, {
            locationMessage: {
                degreesLatitude: latitude,
                degreesLongitude: longitude,
                name: name || '',
                address: address || ''
            }
        });
        return { messages: [{ id: result.id }], key: { id: result.id } };
    }

    async sendContactMessage(to: string, contacts: Array<{ fullName: string; wuid: string; phoneNumber: string }>) {
        const connId = await this.getActiveConnectionId();
        const client = ZapoService.getClient(connId);
        const finalJid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
        const first = contacts[0];
        const phone = first?.phoneNumber?.replace(/\D/g, '') || '';
        const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${first?.fullName || ''}\nTEL;type=CELL;waid=${phone}:+${phone}\nEND:VCARD`;
        
        const result = await client.message.send(finalJid, {
            contactMessage: {
                displayName: first?.fullName || '',
                vcard
            }
        });
        return { messages: [{ id: result.id }], key: { id: result.id } };
    }

    async sendPollMessage(to: string, question: string, options: string[], selectableCount = 1) {
        const connId = await this.getActiveConnectionId();
        const client = ZapoService.getClient(connId);
        const finalJid = to.includes('@') ? to : `${to}@s.whatsapp.net`;

        const result = await client.message.send(finalJid, {
            type: 'poll',
            name: question,
            options: options,
            selectableCount
        });
        return { messages: [{ id: result.id }], key: { id: result.id } };
    }

    async sendStickerMessage(to: string, imageUrl: string) {
        const connId = await this.getActiveConnectionId();
        const client = ZapoService.getClient(connId);
        const finalJid = to.includes('@') ? to : `${to}@s.whatsapp.net`;

        let mediaInput: string | Buffer = imageUrl;
        if (imageUrl.startsWith('http')) {
            mediaInput = await this.downloadMedia(imageUrl);
        }

        const result = await client.message.send(finalJid, {
            type: 'sticker',
            media: mediaInput
        });
        return { messages: [{ id: result.id }], key: { id: result.id } };
    }

    // ─── Message Operations ───

    async deleteMessage(messageId: string, chatJid?: string) {
        const connId = await this.getActiveConnectionId();
        const client = ZapoService.getClient(connId);
        let finalJid = chatJid;
        if (!finalJid) {
            const { prisma } = await import('../server');
            const dbMsg = await prisma.message.findFirst({
                where: { whatsappMessageId: messageId },
                include: { ticket: { include: { contact: true } } }
            });
            if (dbMsg?.ticket?.contact?.phone) {
                finalJid = dbMsg.ticket.contact.phone + '@s.whatsapp.net';
            }
        }
        if (!finalJid) throw new Error('Could not resolve chat JID for message deletion.');
        return client.message.send(finalJid, {
            type: 'revoke',
            target: { remoteJid: finalJid, id: messageId, fromMe: true }
        });
    }

    async editMessage(messageId: string, newText: string, chatJid?: string) {
        const connId = await this.getActiveConnectionId();
        const client = ZapoService.getClient(connId);
        let finalJid = chatJid;
        if (!finalJid) {
            const { prisma } = await import('../server');
            const dbMsg = await prisma.message.findFirst({
                where: { whatsappMessageId: messageId },
                include: { ticket: { include: { contact: true } } }
            });
            if (dbMsg?.ticket?.contact?.phone) {
                finalJid = dbMsg.ticket.contact.phone + '@s.whatsapp.net';
            }
        }
        if (!finalJid) throw new Error('Could not resolve chat JID for message editing.');
        await client.message.send(finalJid, newText, {
            editKey: { id: messageId }
        });
        return { messages: [{ id: messageId }] };
    }

    async markAsRead(phone: string, messageId?: string) {
        const connId = await this.getActiveConnectionId();
        const client = ZapoService.getClient(connId);
        const jid = phone.includes('@') ? phone : phone + '@s.whatsapp.net';
        let ids: string[] = [];
        if (messageId) {
            ids = [messageId];
        } else {
            const { prisma } = await import('../server');
            const lastMsg = await prisma.message.findFirst({
                where: {
                    origin: 'CONTACT',
                    ticket: { contact: { phone: phone.replace(/\D/g, '') } }
                },
                orderBy: { createdAt: 'desc' }
            });
            if (lastMsg?.whatsappMessageId) {
                ids = [lastMsg.whatsappMessageId];
            }
        }
        if (ids.length > 0) {
            await client.message.sendReceipt(jid, ids, { type: 'read' });
        }
    }

    async setPresence(phone: string, presence: 'typing' | 'recording' | 'available') {
        const connId = await this.getActiveConnectionId();
        const client = ZapoService.getClient(connId);
        const jid = phone.includes('@') ? phone : phone + '@s.whatsapp.net';
        if (presence === 'typing') {
            await client.presence.sendChatstate(jid, { state: 'composing' });
        } else if (presence === 'recording') {
            await client.presence.sendChatstate(jid, { state: 'composing', media: 'audio' });
        } else if (presence === 'available') {
            await client.presence.sendChatstate(jid, { state: 'paused' });
        }
    }

    async sendButtonsMessage(
        to: string,
        text: string,
        buttons: Array<{ id: string; text: string; type?: 'quick_reply' | 'url'; url?: string }>,
        footer?: string,
        title?: string
    ) {
        const connId = await this.getActiveConnectionId();
        const client = ZapoService.getClient(connId);
        const finalJid = to.includes('@') ? to : `${to}@s.whatsapp.net`;

        const result = await client.message.send(finalJid, {
            interactiveMessage: {
                body: { text },
                ...(footer ? { footer: { text: footer } } : {}),
                ...(title ? { header: { title, hasMediaAttachment: false } } : {}),
                nativeFlowMessage: {
                    buttons: buttons.map(btn => {
                        const isUrl = btn.type === 'url' || (btn.url && (btn.url.startsWith('http://') || btn.url.startsWith('https://')));
                        if (isUrl) {
                            return {
                                name: 'cta_url',
                                buttonParamsJson: JSON.stringify({
                                    display_text: btn.text,
                                    url: btn.url || '',
                                    merchant_url: btn.url || ''
                                })
                            };
                        }
                        return {
                            name: 'quick_reply',
                            buttonParamsJson: JSON.stringify({
                                display_text: btn.text,
                                id: btn.id
                            })
                        };
                    })
                }
            }
        });
        return { messages: [{ id: result.id }], key: { id: result.id } };
    }

    async sendListMessage(to: string, text: string, buttonText: string, sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>, footer?: string, title?: string) {
        const connId = await this.getActiveConnectionId();
        const client = ZapoService.getClient(connId);
        const finalJid = to.includes('@') ? to : `${to}@s.whatsapp.net`;

        const result = await client.message.send(finalJid, {
            listMessage: {
                title: title || '',
                description: text,
                buttonText,
                listType: 1, // SINGLE_SELECT
                sections: sections.map(sec => ({
                    title: sec.title,
                    rows: sec.rows.map(row => ({
                        title: row.title,
                        rowId: row.id,
                        description: row.description || ''
                    }))
                })),
                ...(footer ? { footerText: footer } : {})
            }
        });
        return { messages: [{ id: result.id }], key: { id: result.id } };
    }

    async getMessageStatus(_messageId: string) {
        return { status: 'read' };
    }

    // ─── Chat Management ───

    async archiveChat(phone: string) {
        const connId = await this.getActiveConnectionId();
        const client = ZapoService.getClient(connId);
        const jid = phone.includes('@') ? phone : phone + '@s.whatsapp.net';
        return client.chat.setChatArchive(jid, true);
    }

    async unarchiveChat(phone: string) {
        const connId = await this.getActiveConnectionId();
        const client = ZapoService.getClient(connId);
        const jid = phone.includes('@') ? phone : phone + '@s.whatsapp.net';
        return client.chat.setChatArchive(jid, false);
    }

    async muteChat(phone: string) {
        const connId = await this.getActiveConnectionId();
        const client = ZapoService.getClient(connId);
        const jid = phone.includes('@') ? phone : phone + '@s.whatsapp.net';
        const muteEndTimestampMs = 253402300000000;
        return client.chat.setChatMute(jid, true, muteEndTimestampMs);
    }

    async unmuteChat(phone: string) {
        const connId = await this.getActiveConnectionId();
        const client = ZapoService.getClient(connId);
        const jid = phone.includes('@') ? phone : phone + '@s.whatsapp.net';
        return client.chat.setChatMute(jid, false);
    }

    async pinChat(phone: string) {
        const connId = await this.getActiveConnectionId();
        const client = ZapoService.getClient(connId);
        const jid = phone.includes('@') ? phone : phone + '@s.whatsapp.net';
        return client.chat.setChatPin(jid, true);
    }

    async unpinChat(phone: string) {
        const connId = await this.getActiveConnectionId();
        const client = ZapoService.getClient(connId);
        const jid = phone.includes('@') ? phone : phone + '@s.whatsapp.net';
        return client.chat.setChatPin(jid, false);
    }

    // ─── Group ───

    async createGroup(name: string, participants: string[]) {
        const connId = await this.getActiveConnectionId();
        const client = ZapoService.getClient(connId);
        const parsedParticipants = participants.map(p => p.includes('@') ? p : `${p}@s.whatsapp.net`);
        return client.group.createGroup(name, parsedParticipants);
    }

    async getGroupInfo(groupId: string) {
        const connId = await this.getActiveConnectionId();
        const client = ZapoService.getClient(connId);
        const groupJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
        return client.group.queryGroupMetadata(groupJid);
    }

    async getGroupInviteLink(groupId: string) {
        const connId = await this.getActiveConnectionId();
        const client = ZapoService.getClient(connId);
        const groupJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
        const code = await client.group.queryInviteCode(groupJid);
        return { code, link: `https://chat.whatsapp.com/${code}` };
    }

    async joinGroupByLink(inviteCode: string) {
        const connId = await this.getActiveConnectionId();
        const client = ZapoService.getClient(connId);
        return client.group.joinGroupViaInvite(inviteCode);
    }

    async listGroups() {
        const connId = await this.getActiveConnectionId();
        const client = ZapoService.getClient(connId);
        return client.group.queryAllGroups();
    }

    async getMyGroups() {
        const connId = await this.getActiveConnectionId();
        const client = ZapoService.getClient(connId);
        return client.group.queryAllGroups();
    }

    async setGroupName(groupId: string, name: string) {
        const connId = await this.getActiveConnectionId();
        const client = ZapoService.getClient(connId);
        const groupJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
        return client.group.setSubject(groupJid, name);
    }

    async updateParticipant(groupId: string, phone: string, action: 'add' | 'remove' | 'promote' | 'demote') {
        const connId = await this.getActiveConnectionId();
        const client = ZapoService.getClient(connId);
        const groupJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
        const participantJid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
        if (action === 'add') {
            return client.group.addParticipants(groupJid, [participantJid]);
        } else if (action === 'remove') {
            return client.group.removeParticipants(groupJid, [participantJid]);
        } else if (action === 'promote') {
            return client.group.promoteParticipants(groupJid, [participantJid]);
        } else if (action === 'demote') {
            return client.group.demoteParticipants(groupJid, [participantJid]);
        }
    }

    async setGroupPhoto(groupId: string, photoUrl: string) {
        const connId = await this.getActiveConnectionId();
        const client = ZapoService.getClient(connId);
        const groupJid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
        const imageBytes = await this.downloadMedia(photoUrl);
        return client.profile.setProfilePicture(new Uint8Array(imageBytes), groupJid);
    }

    // ─── User ───

    async getUserAvatar(phone: string) {
        const connId = await this.getActiveConnectionId();
        const client = ZapoService.getClient(connId);
        const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
        const result = await client.profile.getProfilePicture(jid, 'preview');
        return { profilePicUrl: result.url };
    }

    async blockContact(phone: string) {
        const connId = await this.getActiveConnectionId();
        const client = ZapoService.getClient(connId);
        const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
        return client.privacy.blockUser(jid);
    }

    async getBlockList() {
        const connId = await this.getActiveConnectionId();
        const client = ZapoService.getClient(connId);
        const result = await client.privacy.getBlocklist();
        return result.jids;
    }

    async checkUser(phone: string) {
        const connId = await this.getActiveConnectionId();
        const client = ZapoService.getClient(connId);
        const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
        try {
            const profiles = await client.profile.getProfiles([jid]);
            const exists = profiles.some((p: any) => p.jid === jid || p.jid.startsWith(phone));
            return { exists, jid: exists ? jid : null };
        } catch {
            return { exists: false, jid: null };
        }
    }

    async getContacts() {
        const connId = await this.getActiveConnectionId();
        const { prisma } = await import('../server');
        const conn = await prisma.whatsAppConnection.findUnique({ where: { id: connId } });
        if (!conn) throw new Error('Conexão não encontrada');
        const contacts = await prisma.contact.findMany({
            where: { tenantId: conn.tenantId }
        });
        return contacts.map(c => ({
            id: c.phone + '@s.whatsapp.net',
            name: c.name,
            pushname: c.name
        }));
    }

    async getUser(phone: string) {
        const connId = await this.getActiveConnectionId();
        const client = ZapoService.getClient(connId);
        const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
        const profiles = await client.profile.getProfiles([jid]);
        const profile = profiles.find((p: any) => p.jid === jid);
        return {
            jid,
            status: profile?.status || null,
            pictureId: profile?.pictureId || null
        };
    }

    async getPrivacySettings() {
        const connId = await this.getActiveConnectionId();
        const client = ZapoService.getClient(connId);
        return client.privacy.getPrivacySettings();
    }

    async setProfilePicture(photoUrl: string) {
        const connId = await this.getActiveConnectionId();
        const client = ZapoService.getClient(connId);
        const imageBytes = await this.downloadMedia(photoUrl);
        return client.profile.setProfilePicture(new Uint8Array(imageBytes));
    }

    async unblockContact(phone: string) {
        const connId = await this.getActiveConnectionId();
        const client = ZapoService.getClient(connId);
        const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
        return client.privacy.unblockUser(jid);
    }

    // ─── Label ───

    async addLabelToChat(phone: string, labelId: string) {
        const connId = await this.getActiveConnectionId();
        const client = ZapoService.getClient(connId);
        const chatJid = phone.includes('@') ? phone : phone + '@s.whatsapp.net';
        await client.chat.set({
            schema: 'LabelJid',
            labelId,
            chatJid,
            labeled: true
        });
    }

    async editLabel(labelId: string, name: string, color: string) {
        const connId = await this.getActiveConnectionId();
        const client = ZapoService.getClient(connId);
        const colorVal = parseInt(color.replace('#', ''), 16) || 0;
        const colorIndex = colorVal % 20;
        await client.chat.set({
            schema: 'LabelEdit',
            id: labelId,
            name,
            color: colorIndex,
            isActive: true
        });
    }

    async addLabelToMessage(_messageId: string, _phone: string, _labelId: string) {
        // No-op / not supported
    }

    async removeLabelFromChat(phone: string, labelId: string) {
        const connId = await this.getActiveConnectionId();
        const client = ZapoService.getClient(connId);
        const chatJid = phone.includes('@') ? phone : phone + '@s.whatsapp.net';
        await client.chat.remove({
            schema: 'LabelJid',
            labelId,
            chatJid
        });
    }

    async removeLabelFromMessage(_messageId: string, _labelId: string) {
        // No-op / not supported
    }

    // ─── Media Utility ───

    async getMediaUrl(mediaId: string): Promise<string> { return mediaId; }
}

export const whatsappClient = new WhatsAppClient();
export { WhatsAppClient };
