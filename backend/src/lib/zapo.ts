import path from 'path';
import fs from 'fs';
import { ConsoleLogger, createStore, WaClient } from 'zapo-js';
import { createSqliteStore } from '@zapo-js/store-sqlite';
import QRCode from 'qrcode';
import { prisma } from '../server';
import { getIO, tenantRoom } from './socket';
import { TicketsService } from '../modules/tickets/tickets.service';
import { MessagesService } from '../modules/messages/messages.service';
import { BotFlowEngine } from '../modules/botflow/botflow.engine';
import { NpsService } from '../modules/nps/nps.service';
import { checkBusinessHours } from './business-hours';
import { StorageService } from './storage.service';

// In-memory idempotency cache
const processedMessageIds = new Map<string, number>();
const MESSAGE_CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

function evictStaleMessageIds() {
    const cutoff = Date.now() - MESSAGE_CACHE_TTL_MS;
    for (const [id, ts] of processedMessageIds) {
        if (ts < cutoff) processedMessageIds.delete(id);
    }
}

function isAlreadyProcessed(messageId: string): boolean {
    evictStaleMessageIds();
    if (processedMessageIds.has(messageId)) return true;
    processedMessageIds.set(messageId, Date.now());
    return false;
}

function sanitizeJid(jid: string): string {
    if (!jid) return '';
    let sanitized = jid.split('@')[0];
    sanitized = sanitized.split(':')[0];
    sanitized = sanitized.replace(/\D/g, '');
    return sanitized;
}

interface ParsedContent {
    body?: string;
    mediaUrl?: string;
    mediaType?: string;
    locationJson?: Record<string, any>;
    contactJson?: Record<string, any>;
    buttonId?: string;
    isReaction?: boolean;
    reaction?: { targetMsgId?: string; emoji: string };
}

async function parseMessageContent(event: any, client: any, tenantId: string): Promise<ParsedContent> {
    const message = event.message || {};
    const out: ParsedContent = {};

    if (message.reactionMessage) {
        out.isReaction = true;
        out.reaction = {
            targetMsgId: message.reactionMessage.key?.id,
            emoji: message.reactionMessage.text || '',
        };
        return out;
    }

    if (message.conversation || message.extendedTextMessage) {
        out.body = message.conversation || message.extendedTextMessage.text || '';
    } else if (message.buttonsResponseMessage) {
        out.body = message.buttonsResponseMessage.selectedDisplayText || message.buttonsResponseMessage.selectedButtonId || '';
        out.buttonId = message.buttonsResponseMessage.selectedButtonId;
    } else if (message.listResponseMessage) {
        out.body = message.listResponseMessage.title || message.listResponseMessage.singleSelectReply?.selectedRowId || '';
        out.buttonId = message.listResponseMessage.singleSelectReply?.selectedRowId;
    } else if (message.interactiveResponseMessage) {
        const interactive = message.interactiveResponseMessage;
        out.body = interactive.body?.text || '';
        if (interactive.nativeFlowResponseMessage?.paramsJson) {
            try {
                const params = JSON.parse(interactive.nativeFlowResponseMessage.paramsJson);
                out.buttonId = params.id || params.selectedButtonId;
                if (!out.body && params.id) out.body = params.id;
            } catch {}
        }
    } else if (message.templateButtonReplyMessage) {
        out.body = message.templateButtonReplyMessage.selectedDisplayText || message.templateButtonReplyMessage.selectedId || '';
        out.buttonId = message.templateButtonReplyMessage.selectedId;
    } else if (message.imageMessage || message.videoMessage || message.audioMessage || message.documentMessage || message.stickerMessage) {
        const mediaObj = message.imageMessage || message.videoMessage || message.audioMessage || message.documentMessage || message.stickerMessage;
        const mime = mediaObj?.mimetype || 'application/octet-stream';
        const mediaBytes = await client.message.downloadBytes(event);
        const relPath = await StorageService.saveBuffer(tenantId, Buffer.from(mediaBytes), mime);
        // Store the RELATIVE path so media loads from any host/IP (browser resolves
        // it against the current origin; Vite/prod proxies /uploads to the backend).
        out.mediaUrl = relPath;
        if (message.imageMessage) out.mediaType = 'image';
        else if (message.videoMessage) out.mediaType = 'video';
        else if (message.audioMessage) out.mediaType = 'audio';
        else if (message.stickerMessage) out.mediaType = 'sticker';
        else out.mediaType = 'document';
        // Caption goes in body (shown under image/video). Documents fall back to the
        // filename (used as the download label); other types stay empty when captionless.
        const caption = (mediaObj as any).caption;
        const fileName = (mediaObj as any).fileName;
        out.body = caption || (out.mediaType === 'document' ? (fileName || '[Documento]') : '');
    } else if (message.locationMessage) {
        const loc = message.locationMessage;
        out.locationJson = {
            latitude: loc.degreesLatitude,
            longitude: loc.degreesLongitude,
            name: loc.name || '',
            address: loc.address || '',
        };
        out.body = `📍 ${loc.name || 'Localização'}: ${loc.degreesLatitude}, ${loc.degreesLongitude}`;
    } else if (message.contactMessage) {
        const cont = message.contactMessage;
        out.contactJson = { displayName: cont.displayName, vcard: cont.vcard };
        out.body = `👤 Contato: ${cont.displayName}`;
    } else if (message.contactsArrayMessage) {
        const first = message.contactsArrayMessage.contacts?.[0];
        if (first) {
            out.contactJson = { displayName: first.displayName, vcard: first.vcard };
            out.body = `👤 Contato: ${first.displayName}`;
        }
    }

    return out;
}

async function resolveOutboundTicket(contactId: string, tenantId: string): Promise<{ id: string }> {
    const latest = await prisma.ticket.findFirst({
        where: { contactId },
        orderBy: { createdAt: 'desc' },
    });

    if (!latest) {
        return TicketsService.createOpenTicket(contactId, tenantId);
    }
    if (latest.status === 'BOT' || latest.status === 'CLOSED') {
        return TicketsService.updateStatus(latest.id, 'OPEN');
    }
    return latest;
}

const OUTBOUND_WATERMARK = 'Enviado por fora (WhatsApp)';

async function handleOutboundSync(event: any, client: any, tenantId: string, connectionId: string): Promise<void> {
    const msgId = event.key.id;

    // Dedup em memória (mesma janela do fluxo de entrada)
    if (isAlreadyProcessed(msgId)) return;

    // Dedup de eco por whatsappMessageId: se o próprio SaaS enviou (ou já
    // sincronizamos), a mensagem já existe no banco → não reprocessa.
    const already = await prisma.message.findFirst({ where: { whatsappMessageId: msgId } });
    if (already) return;

    // Resolver telefone do destinatário (mesma lógica LID→PN do fluxo de entrada)
    const rawJid = event.key.remoteJid;
    const altJid = event.key.remoteJidAlt;
    const rawPhone = sanitizeJid(rawJid);
    let phone = '';
    if (altJid) {
        phone = sanitizeJid(altJid);
    } else if (rawJid.includes('@lid') || rawPhone.length >= 14) {
        try {
            const Database = require('better-sqlite3');
            const p = require('path');
            const dbPath = p.resolve(process.cwd(), 'prisma', 'zapo_sessions', `zapo_${connectionId}.sqlite`);
            if (fs.existsSync(dbPath)) {
                const db = new Database(dbPath);
                const row = db.prepare("SELECT phone_number FROM mailbox_contacts WHERE jid = ? OR lid = ?").get(rawJid, rawPhone);
                if (row?.phone_number) phone = row.phone_number.split('@')[0].replace(/\D/g, '');
            }
        } catch (err: any) {
            console.error('[ZapoService][outbound] LID resolve failed:', err.message);
        }
    }
    if (!phone) phone = rawPhone;

    // Upsert do contato (não sobrescreve o nome — não temos pushName confiável aqui)
    let contact = await prisma.contact.findFirst({ where: { tenantId, phone } });
    if (!contact) {
        contact = await prisma.contact.create({ data: { phone, name: phone, tenantId } });
    }

    // Parsear conteúdo (reação enviada por fora fica fora do MVP)
    const parsed = await parseMessageContent(event, client, tenantId);
    if (parsed.isReaction) return;
    const finalBody = parsed.locationJson
        ? JSON.stringify(parsed.locationJson)
        : parsed.contactJson
            ? JSON.stringify(parsed.contactJson)
            : parsed.body;
    if (!finalBody && !parsed.mediaUrl) return;

    // Resolver ticket com as regras (assumir do bot / reabrir / criar OPEN)
    const ticket = await resolveOutboundTicket(contact.id, tenantId);

    // Gravar como saída. create() deduplica de novo por whatsappMessageId,
    // toca updatedAt do ticket e emite 'message:new' (o front renderiza).
    await MessagesService.create({
        ticketId: ticket.id,
        body: finalBody,
        mediaUrl: parsed.mediaUrl,
        mediaType: parsed.mediaType,
        origin: 'AGENT',
        whatsappMessageId: msgId,
        senderName: OUTBOUND_WATERMARK,
    });

    console.log(`[ZapoService] Synced outbound message ${msgId} → ticket ${ticket.id} (phone=${phone})`);
}

export class ZapoService {
    private static clients = new Map<string, WaClient>();
    private static stores = new Map<string, any>();
    private static qrcodes = new Map<string, string>();

    /**
     * Initialize Zapo sessions on server start.
     * Loads connected connections and attempts to connect them.
     */
    static async init(): Promise<void> {
        console.log('[ZapoService] Initializing sessions...');
        try {
            const connections = await prisma.whatsAppConnection.findMany({
                where: {
                    type: 'qr_code_web',
                    OR: [
                        { isConnected: true },
                        { sessionStatus: 'connected' }
                    ]
                }
            });

            console.log(`[ZapoService] Found ${connections.length} connected sessions to restore.`);
            for (const conn of connections) {
                this.connect(conn.id, conn.tenantId).catch(err => {
                    console.error(`[ZapoService] Failed to reconnect session ${conn.id}:`, err);
                });
            }
        } catch (error) {
            console.error('[ZapoService] Error during initialization:', error);
        }
    }

    /**
     * Establish a connection session.
     */
    static async connect(connectionId: string, tenantId: string): Promise<WaClient> {
        if (this.clients.has(connectionId)) {
            console.log(`[ZapoService] Session ${connectionId} already active.`);
            return this.clients.get(connectionId)!;
        }

        console.log(`[ZapoService] Connecting session ${connectionId} for tenant ${tenantId}...`);

        const sessionsDir = path.resolve(process.cwd(), 'prisma', 'zapo_sessions');
        if (!fs.existsSync(sessionsDir)) {
            fs.mkdirSync(sessionsDir, { recursive: true });
        }

        const dbPath = path.join(sessionsDir, `zapo_${connectionId}.sqlite`);

        const store = createStore({
            backends: {
                sqlite: createSqliteStore({ path: dbPath })
            },
            providers: {
                auth: 'sqlite',
                signal: 'sqlite',
                preKey: 'sqlite',
                session: 'sqlite',
                identity: 'sqlite',
                senderKey: 'sqlite',
                appState: 'sqlite',
                privacyToken: 'sqlite',
                messages: 'sqlite',
                threads: 'sqlite',
                contacts: 'sqlite'
            }
        });

        this.stores.set(connectionId, store);

        // persistAllSecrets: guarda o segredo de toda mensagem para que reações/
        // edições a mensagens comuns continuem decriptáveis após um restart do backend.
        const client = new WaClient({ store, sessionId: connectionId, addons: { persistAllSecrets: true } }, new ConsoleLogger('warn'));
        this.clients.set(connectionId, client);

        // ── Event: auth_qr (QR Code generated) ──
        client.on('auth_qr', async ({ qr }: { qr: string }) => {
            try {
                console.log(`[ZapoService] QR Code generated for connectionId=${connectionId}`);
                const qrBase64 = await QRCode.toDataURL(qr);
                this.qrcodes.set(connectionId, qrBase64);

                await prisma.whatsAppConnection.update({
                    where: { id: connectionId },
                    data: { sessionStatus: 'qr_ready', isConnected: false }
                });

                const io = getIO();
                io.emit(`qrcode_update_${connectionId}`, { connectionId, qr: qrBase64 });
                io.to(tenantRoom(tenantId)).emit('qrcode_update', { connectionId, qr: qrBase64 });
            } catch (err: any) {
                if (err.code === 'P2025') {
                    console.log(`[ZapoService] Connection ${connectionId} was deleted. Cleaning up and disconnecting.`);
                    ZapoService.disconnect(connectionId).catch(() => {});
                } else {
                    console.error('[ZapoService] auth_qr error:', err);
                }
            }
        });

        // ── Event: connection (state updates) ──
        client.on('connection', async (event: any) => {
            try {
                console.log(`[ZapoService] Connection event for connectionId=${connectionId}:`, event);
                const io = getIO();

                if (event.status === 'open') {
                    this.qrcodes.delete(connectionId);
                    const credentials = client.getCredentials();
                    const meJid = credentials?.meJid || '';

                    await prisma.whatsAppConnection.update({
                        where: { id: connectionId },
                        data: { sessionStatus: 'connected', isConnected: true, phoneNumberId: sanitizeJid(meJid) }
                    }).catch((err: any) => {
                        if (err.code !== 'P2025') console.error('[ZapoService] Failed to update connection on open:', err);
                    });

                    io.to(tenantRoom(tenantId)).emit('connection_status', {
                        connectionId,
                        status: 'connected',
                        jid: meJid
                    });
                    io.emit(`connection_status_${connectionId}`, { status: 'connected' });
                } else if (event.status === 'close') {
                    // Mark DB as disconnected
                    await prisma.whatsAppConnection.update({
                        where: { id: connectionId },
                        data: { sessionStatus: 'disconnected', isConnected: false }
                    }).catch((err: any) => {
                        if (err.code !== 'P2025') console.error('[ZapoService] Failed to update connection on close:', err);
                    });

                    io.to(tenantRoom(tenantId)).emit('connection_status', {
                        connectionId,
                        status: 'disconnected',
                        reason: event.reason
                    });
                    io.emit(`connection_status_${connectionId}`, { status: 'disconnected' });

                    // Auto-reconnect unless this was a deliberate logout or the client was removed
                    if (!event.isLogout && this.clients.has(connectionId)) {
                        const RECONNECT_DELAYS_MS = [3000, 8000, 20000, 45000, 90000];
                        let attempt = 0;

                        const tryReconnect = () => {
                            if (!this.clients.has(connectionId)) {
                                console.log(`[ZapoService] Auto-reconnect aborted: client ${connectionId} was removed.`);
                                return;
                            }
                            attempt += 1;
                            const delayMs = RECONNECT_DELAYS_MS[Math.min(attempt - 1, RECONNECT_DELAYS_MS.length - 1)];
                            console.log(`[ZapoService] Auto-reconnect attempt ${attempt} for ${connectionId} in ${delayMs}ms (reason=${event.reason})`);
                            setTimeout(() => {
                                if (!this.clients.has(connectionId)) return;
                                const activeClient = this.clients.get(connectionId);
                                if (!activeClient) return;
                                activeClient.connect().catch((err: any) => {
                                    console.error(`[ZapoService] Auto-reconnect attempt ${attempt} failed for ${connectionId}:`, err.message);
                                    if (attempt < RECONNECT_DELAYS_MS.length) {
                                        tryReconnect();
                                    } else {
                                        console.error(`[ZapoService] Auto-reconnect exhausted for ${connectionId}. Manual reconnect required.`);
                                    }
                                });
                            }, delayMs);
                        };
                        tryReconnect();
                    }
                }
            } catch (err) {
                console.error('[ZapoService] connection event error:', err);
            }
        });

        // ── Event: receipt (message read/delivered confirmation) ──
        client.on('receipt', async (event: any) => {
            try {
                const io = getIO();
                io.to(tenantRoom(tenantId)).emit('receipt_update', {
                    connectionId,
                    state: event.status === 'read' ? 'Read' : event.status === 'delivered' ? 'Delivered' : 'Server',
                    messageIds: [event.stanzaId],
                    chat: event.chatJid,
                    timestamp: event.timestampSeconds ? event.timestampSeconds * 1000 : Date.now()
                });
            } catch (err) {
                console.error('[ZapoService] receipt event error:', err);
            }
        });

        // ── Event: message (incoming message) ──
        // ── Event: message_unavailable (placeholder que não pôde ser exibido) ──
        // Antes essas mensagens sumiam sem rastro. Agora, se houver um atendimento
        // ativo para o contato, deixamos um aviso no timeline para o atendente.
        client.on('message_unavailable', async (event: any) => {
            try {
                const key = event?.key;
                if (!key || key.fromMe || key.isGroup || key.isBroadcast) return;
                const remoteJid = key.remoteJid || '';
                if (typeof remoteJid === 'string' && (remoteJid.includes('@g.us') || remoteJid === 'status@broadcast')) return;
                if (key.id && isAlreadyProcessed(`unavail:${key.id}`)) return;

                const phone = sanitizeJid(key.remoteJidAlt || remoteJid);
                if (!phone) return;

                const contact = await prisma.contact.findFirst({ where: { tenantId, phone } });
                if (!contact) return; // sem contato conhecido: o reenvio, se vier, cria o ticket normalmente

                const ticket = await prisma.ticket.findFirst({
                    where: { contactId: contact.id, status: { in: ['BOT', 'QUEUE', 'OPEN'] } },
                    orderBy: { createdAt: 'desc' },
                });
                if (!ticket) return; // não criamos ticket a partir de um evento sem conteúdo

                await MessagesService.createSystemMessage(
                    ticket.id,
                    '⚠️ Mensagem recebida mas indisponível (não pôde ser exibida). Aguardando reenvio pelo WhatsApp.',
                );
            } catch (err) {
                console.error('[ZapoService] message_unavailable handler error:', err);
            }
        });

        client.on('message', async (event: any) => {
            try {
                // Mensagens enviadas por fora (celular / WhatsApp Web oficial): sincronizar
                if (event.key.fromMe) {
                    // Manter filtros: ignorar grupos, broadcast e mensagens para o próprio número
                    if (event.key.isGroup || event.key.isBroadcast || event.key.remoteJid.includes('@g.us') || event.key.remoteJid === 'status@broadcast') return;
                    const creds = client.getCredentials();
                    const meJidClean = creds?.meJid ? sanitizeJid(creds.meJid) : '';
                    const meLidClean = creds?.meLid ? sanitizeJid(creds.meLid) : '';
                    const remoteClean = sanitizeJid(event.key.remoteJid);
                    if (remoteClean === meJidClean || (meLidClean && remoteClean === meLidClean)) return;

                    await handleOutboundSync(event, client, tenantId, connectionId);
                    return;
                }

                // Ignore groups and broadcasts
                if (event.key.isGroup || event.key.isBroadcast || event.key.remoteJid.includes('@g.us') || event.key.remoteJid === 'status@broadcast') return;

                // Ignore messages to/from self (bot's own phone or LID)
                const credentials = client.getCredentials();
                const meJidClean = credentials?.meJid ? sanitizeJid(credentials.meJid) : '';
                const meLidClean = credentials?.meLid ? sanitizeJid(credentials.meLid) : '';
                const remoteJidClean = sanitizeJid(event.key.remoteJid);

                if (remoteJidClean === meJidClean || (meLidClean && remoteJidClean === meLidClean)) {
                    console.log(`[ZapoService] Ignoring sync/self message from/to bot: ${event.key.remoteJid}`);
                    return;
                }

                // Idempotency check
                if (isAlreadyProcessed(event.key.id)) {
                    console.log(`[ZapoService] Duplicate message ignored: ${event.key.id}`);
                    return;
                }

                // ── Resolve phone number (handle LID vs PN addressing) ──
                // WhatsApp may address messages by LID (large numeric ID) rather than phone number.
                // When this happens: key.remoteJid = LID@s.whatsapp.net, key.remoteJidAlt = phone@s.whatsapp.net
                // We store the phone number (PN) in DB, not the LID, so replies route correctly.
                const rawJid = event.key.remoteJid;
                const altJid = event.key.remoteJidAlt;
                
                // Prefer remoteJidAlt if it looks like a normal phone number (shorter / starts with country code)
                // LIDs tend to be very long (15+ digits) while phone numbers are 10-14 digits
                const rawPhone = sanitizeJid(rawJid);
                let phone = '';
                let sqlitePushName = '';
                
                if (altJid) {
                    phone = sanitizeJid(altJid);
                } else if (rawJid.includes('@lid') || rawPhone.length >= 14) {
                    // Try to resolve from Zapo SQLite database dynamically
                    try {
                        const Database = require('better-sqlite3');
                        const path = require('path');
                        const dbPath = path.resolve(process.cwd(), 'prisma', 'zapo_sessions', `zapo_${connectionId}.sqlite`);
                        if (fs.existsSync(dbPath)) {
                            const db = new Database(dbPath);
                            const row = db.prepare("SELECT phone_number, push_name, display_name FROM mailbox_contacts WHERE jid = ? OR lid = ?").get(rawJid, rawPhone);
                            if (row) {
                                if (row.phone_number) {
                                    phone = row.phone_number.split('@')[0].replace(/\D/g, '');
                                    console.log(`[ZapoService] Resolved phone from Zapo SQLite mapping for LID ${rawJid} -> ${phone}`);
                                }
                                sqlitePushName = row.push_name || row.display_name || '';
                            }
                        }
                    } catch (err: any) {
                        console.error('[ZapoService] Failed to resolve JID from local SQLite mapping:', err.message);
                    }
                }
                
                if (!phone) {
                    phone = rawPhone;
                }
                
                console.log(`[ZapoService] Inbound message: rawJid=${rawJid} altJid=${altJid || 'none'} → phone=${phone} (connectionId=${connectionId})`);

                const pushName = event.pushName || sqlitePushName || phone;
                const msgId = event.key.id;

                // Upsert Contact
                let upsertedContact = await prisma.contact.findFirst({
                    where: { tenantId, phone }
                });
                if (!upsertedContact) {
                    upsertedContact = await prisma.contact.create({
                        data: { phone, name: pushName, tenantId }
                    });
                } else if (pushName && upsertedContact.name !== pushName) {
                    await prisma.contact.update({
                        where: { id: upsertedContact.id },
                        data: { name: pushName }
                    });
                }

                // Fetch Profile Pic async (non-blocking)
                setImmediate(async () => {
                    try {
                        const avatarResp = await client.profile.getProfilePicture(event.key.remoteJid, 'preview');
                        const pictureUrl = avatarResp?.url || null;
                        if (pictureUrl && upsertedContact) {
                            await prisma.contact.update({
                                where: { id: upsertedContact.id },
                                data: { profilePicUrl: pictureUrl, avatarUrl: pictureUrl }
                            });
                        }
                    } catch { /* best effort */ }
                });

                // Parse message content
                const parsed = await parseMessageContent(event, client, tenantId);

                // Reação: emite e sai (comportamento atual preservado)
                if (parsed.isReaction) {
                    const targetMsgId = parsed.reaction?.targetMsgId;
                    if (targetMsgId) {
                        const existingMsg = await prisma.message.findFirst({ where: { whatsappMessageId: targetMsgId } });
                        if (existingMsg) {
                            getIO().to(tenantRoom(tenantId)).emit('message_reaction', {
                                connectionId,
                                targetMessageId: targetMsgId,
                                internalMessageId: existingMsg.id,
                                emoji: parsed.reaction?.emoji || '',
                                ticketId: existingMsg.ticketId,
                            });
                        }
                    }
                    return;
                }

                const { body, mediaUrl: localMediaUrl, mediaType: mType, locationJson, contactJson, buttonId } = parsed;

                if (!body && !localMediaUrl) return;

                // ── NPS Check ──
                if (upsertedContact && body && !localMediaUrl) {
                    const npsTicket = await prisma.ticket.findFirst({
                        where: { contactId: upsertedContact.id, status: 'PENDING_NPS' }
                    });
                    if (npsTicket) {
                        await MessagesService.create({
                            ticketId: npsTicket.id,
                            body,
                            origin: 'CONTACT',
                            whatsappMessageId: msgId
                        });
                        const handled = await NpsService.handleNpsResponse(npsTicket.id, body, buttonId);
                        if (handled) return;
                    }
                }

                // ── Business Hours Check ──
                const bh = await checkBusinessHours();
                if (!bh.isOpen) {
                    // Só aplica fechamento automático em CONVERSAS NOVAS.
                    // Se já há atendimento ativo, deixa o fluxo normal seguir.
                    const activeTicket = upsertedContact
                        ? await prisma.ticket.findFirst({
                            where: {
                                contactId: upsertedContact.id,
                                status: { in: ['OPEN', 'QUEUE', 'BOT', 'PENDING_NPS'] },
                            },
                        })
                        : null;

                    if (!activeTicket) {
                        const offBody = locationJson
                            ? JSON.stringify(locationJson)
                            : contactJson
                                ? JSON.stringify(contactJson)
                                : body;
                        const closed = await TicketsService.createClosedAfterHours(upsertedContact!.id, tenantId);
                        await MessagesService.create({
                            ticketId: closed.id,
                            body: offBody,
                            mediaUrl: localMediaUrl,
                            mediaType: mType,
                            origin: 'CONTACT',
                            whatsappMessageId: msgId,
                        });
                        if (bh.awayMessage) {
                            try {
                                await client.message.send(event.key.remoteJid, bh.awayMessage);
                            } catch (err) {
                                console.error('[ZapoService] Failed to send away message:', err);
                            }
                            await MessagesService.create({
                                ticketId: closed.id,
                                body: bh.awayMessage,
                                origin: 'BOT',
                            });
                        }
                        console.log(`[ZapoService] After-hours new conversation closed → ticket ${closed.id}`);
                        return;
                    }
                    // Atendimento ativo fora do horário: segue o fluxo normal abaixo.
                }

                // ── Find or Create Ticket ──
                const { ticket, isNew } = await TicketsService.findOrCreateByContact(phone, pushName, tenantId);

                // ── Save Incoming Message ──
                const finalBody = locationJson ? JSON.stringify(locationJson) : contactJson ? JSON.stringify(contactJson) : body;
                const savedMsg = await MessagesService.create({
                    ticketId: ticket.id,
                    body: finalBody,
                    mediaUrl: localMediaUrl,
                    mediaType: mType,
                    origin: 'CONTACT',
                    whatsappMessageId: msgId
                });

                await prisma.ticket.update({
                    where: { id: ticket.id },
                    data: { lastContactMessageAt: new Date() }
                });

                // ── Socket Emit ──
                const parsedMessage = {
                    id: savedMsg?.id,
                    whatsappMessageId: msgId,
                    senderPhone: phone,
                    senderName: pushName,
                    connectionId,
                    type: mType || (locationJson ? 'location' : contactJson ? 'contact' : 'text'),
                    body: body,
                    mediaUrl: localMediaUrl,
                    mediaType: mType,
                    location: locationJson,
                    contact: contactJson,
                    ticketId: ticket.id,
                    timestamp: new Date().toISOString()
                };

                const io = getIO();
                io.to(tenantRoom(tenantId)).emit('new_message', parsedMessage);

                // ── Bot Flow Engine ──
                if (ticket.status === 'BOT' && body) {
                    if (isNew && ticket.botFlowId) {
                        await BotFlowEngine.startFlow(ticket.id, ticket.botFlowId);
                    } else {
                        await BotFlowEngine.processMessage(ticket.id, body, buttonId);
                    }
                }
            } catch (err) {
                console.error('[ZapoService] message event error:', err);
            }
        });

        // Trigger the connect!
        client.connect().catch((err: any) => {
            console.error(`[ZapoService] Client connection failure for connectionId=${connectionId}:`, err);
        });

        return client;
    }

    /**
     * Gracefully disconnect a session (keeps credentials).
     */
    static async disconnect(connectionId: string): Promise<void> {
        const client = this.clients.get(connectionId);
        if (client) {
            console.log(`[ZapoService] Disconnecting session ${connectionId}...`);
            try {
                await client.disconnect();
            } catch (err) {
                console.error(`[ZapoService] Error during client.disconnect for connectionId=${connectionId}:`, err);
            }
            this.clients.delete(connectionId);
        }
        const store = this.stores.get(connectionId);
        if (store) {
            try {
                await store.destroy();
            } catch {}
            this.stores.delete(connectionId);
        }
    }

    /**
     * Completely log out (wipes credentials) and deletes session file.
     */
    static async logout(connectionId: string): Promise<void> {
        console.log(`[ZapoService] Logging out session ${connectionId}...`);
        const client = this.clients.get(connectionId);
        if (client) {
            try {
                await client.logout();
            } catch (err) {
                console.warn(`[ZapoService] Warn during client.logout for connectionId=${connectionId}:`, err);
            }
            this.clients.delete(connectionId);
        }

        const store = this.stores.get(connectionId);
        if (store) {
            try {
                await store.destroy();
            } catch {}
            this.stores.delete(connectionId);
        }

        // Delete SQLite database file physically
        const dbPath = path.resolve(process.cwd(), 'prisma', 'zapo_sessions', `zapo_${connectionId}.sqlite`);
        if (fs.existsSync(dbPath)) {
            try {
                fs.unlinkSync(dbPath);
                console.log(`[ZapoService] Cleaned up state database at ${dbPath}`);
            } catch (err) {
                console.error(`[ZapoService] Error deleting session file ${dbPath}:`, err);
            }
        }
    }

    /**
     * Retrieve the active client instance.
     */
    static getClient(connectionId: string): WaClient {
        const client = this.clients.get(connectionId);
        if (!client) {
            throw new Error(`[ZapoService] Client not found or not connected for ID: ${connectionId}`);
        }
        return client;
    }

    /**
     * Retrieve the active base64 QR code.
     */
    static getQrCode(connectionId: string): string | null {
        return this.qrcodes.get(connectionId) || null;
    }
}
