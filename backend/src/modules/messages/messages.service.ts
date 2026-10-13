import { prisma } from '../../server';
type MessageOrigin = 'AGENT' | 'BOT' | 'CONTACT' | 'SYSTEM';
import { emitToTicket } from '../../lib/socket';
import { whatsappClient, WhatsAppClient } from '../../lib/whatsapp';
import { SettingsService } from '../settings/settings.service';
import { TemplatesService } from '../templates/templates.service';
// EvolutionService removed – replaced by Zapo

// ─── Generic outbound message types ────────────────────────
export interface OutboundTextMessage {
    ticketId: string;
    type: 'text';
    body: string;
    origin?: MessageOrigin;
    userId?: string;
    senderName?: string;
}

export interface OutboundMediaMessage {
    ticketId: string;
    type: 'media';
    mediaType: 'document' | 'image' | 'video' | 'audio';
    urlOrBase64: string;
    filename: string;
    caption?: string;
    origin?: MessageOrigin;
    userId?: string;
    senderName?: string;
}

export interface OutboundLinkMessage {
    ticketId: string;
    type: 'link';
    url: string;
    text: string;
    title: string;
    description: string;
    imgUrl?: string;
    origin?: MessageOrigin;
    userId?: string;
    senderName?: string;
}

export interface OutboundReactionMessage {
    ticketId: string;
    type: 'reaction';
    messageId: string;
    emoji: string;
}

export interface OutboundPollMessage {
    ticketId: string;
    type: 'poll';
    question: string;
    options: string[];
    selectableCount?: number;
    origin?: MessageOrigin;
    userId?: string;
    senderName?: string;
}

export interface OutboundLocationMessage {
    ticketId: string;
    type: 'location';
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
    origin?: MessageOrigin;
    userId?: string;
    senderName?: string;
}

export interface OutboundContactMessage {
    ticketId: string;
    type: 'contact';
    contacts: Array<{ fullName: string; wuid: string; phoneNumber: string }>;
    origin?: MessageOrigin;
    userId?: string;
    senderName?: string;
}

export interface OutboundStickerMessage {
    ticketId: string;
    type: 'sticker';
    url: string;
    origin?: MessageOrigin;
    userId?: string;
    senderName?: string;
}

export interface OutboundButtonsMessage {
    ticketId: string;
    type: 'buttons';
    body: string;
    buttons: Array<{ id: string; text: string; type?: 'quick_reply' | 'url'; url?: string }>;
    title?: string;
    footer?: string;
    origin?: MessageOrigin;
    userId?: string;
    senderName?: string;
}

export interface OutboundListMessage {
    ticketId: string;
    type: 'list';
    body: string;
    buttonText: string;
    sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>;
    title?: string;
    footer?: string;
    origin?: MessageOrigin;
    userId?: string;
    senderName?: string;
}

export type OutboundMessage = 
    | OutboundTextMessage 
    | OutboundMediaMessage 
    | OutboundLinkMessage 
    | OutboundReactionMessage
    | OutboundPollMessage
    | OutboundLocationMessage
    | OutboundContactMessage
    | OutboundStickerMessage
    | OutboundButtonsMessage
    | OutboundListMessage;

const WINDOW_HOURS = 24;

export class MessagesService {
    /**
     * Generic sendMessage: routes internal message object to the correct
     * WhatsAppClient method based on message type.
     */
    static async sendMessage(msg: OutboundMessage) {
        const client = await WhatsAppClient.getClientForTicket(msg.ticketId);
        const ticket = await prisma.ticket.findUnique({
            where: { id: msg.ticketId },
            include: { contact: true },
        });

        if (!ticket || !ticket.contact) throw new Error('Ticket or contact not found');

        let whatsappMessageId: string | undefined;

        switch (msg.type) {
            case 'text':
                whatsappMessageId = (await client.sendTextMessage(ticket.contact.phone, msg.body, msg.senderName)).messages?.[0]?.id;
                break;

            case 'media': {
                switch (msg.mediaType) {
                    case 'image':
                        whatsappMessageId = (await client.sendImageMessage(
                            ticket.contact.phone,
                            msg.urlOrBase64,
                            msg.caption,
                            msg.senderName
                        )).messages?.[0]?.id;
                        break;
                    case 'video':
                        whatsappMessageId = (await client.sendVideoMessage(
                            ticket.contact.phone,
                            msg.urlOrBase64,
                            msg.caption,
                            msg.senderName
                        )).messages?.[0]?.id;
                        break;
                    case 'document':
                        whatsappMessageId = (await client.sendDocumentMessage(
                            ticket.contact.phone,
                            msg.urlOrBase64,
                            msg.filename,
                            msg.caption,
                            msg.senderName
                        )).messages?.[0]?.id;
                        break;
                    case 'audio':
                        whatsappMessageId = (await client.sendAudioMessage(
                            ticket.contact.phone,
                            msg.urlOrBase64,
                        )).messages?.[0]?.id;
                        break;
                }
                break;
            }

            case 'link':
                whatsappMessageId = (await client.sendLinkMessage(
                    ticket.contact.phone,
                    msg.url,
                    msg.text,
                    msg.title,
                    msg.description,
                    msg.imgUrl,
                )).messages?.[0]?.id;
                break;

            case 'reaction':
                whatsappMessageId = (await client.sendReaction(
                    ticket.contact.phone,
                    msg.messageId,
                    msg.emoji,
                )).messages?.[0]?.id;
                break;

            case 'poll':
                whatsappMessageId = (await client.sendPollMessage(
                    ticket.contact.phone,
                    msg.question,
                    msg.options,
                    msg.selectableCount || 1
                )).messages?.[0]?.id;
                break;

            case 'location':
                whatsappMessageId = (await client.sendLocationMessage(
                    ticket.contact.phone,
                    msg.latitude,
                    msg.longitude,
                    msg.name,
                    msg.address
                )).messages?.[0]?.id;
                break;

            case 'contact':
                whatsappMessageId = (await client.sendContactMessage(
                    ticket.contact.phone,
                    msg.contacts
                )).messages?.[0]?.id;
                break;

            case 'sticker':
                whatsappMessageId = (await client.sendStickerMessage(
                    ticket.contact.phone,
                    msg.url
                )).messages?.[0]?.id;
                break;

            case 'buttons':
                whatsappMessageId = (await client.sendButtonsMessage(
                    ticket.contact.phone,
                    msg.body,
                    msg.buttons,
                    msg.footer,
                    msg.title
                )).messages?.[0]?.id;
                break;

            case 'list':
                whatsappMessageId = (await client.sendListMessage(
                    ticket.contact.phone,
                    msg.body,
                    msg.buttonText,
                    msg.sections,
                    msg.footer,
                    msg.title
                )).messages?.[0]?.id;
                break;

            default:
                throw new Error(`Unknown message type: ${(msg as any).type}`);
        }

        // Persist to DB (skip for reactions — they don't create standalone messages)
        if (msg.type === 'reaction') {
            return { whatsappMessageId };
        }

        const message = await this.create({
            ticketId: msg.ticketId,
            body: msg.type === 'text' ? msg.body
                : msg.type === 'link' ? msg.text
                : msg.type === 'media' ? msg.caption ?? msg.filename
                : msg.type === 'poll' ? `[Enquete] ${msg.question}\n${msg.options.map((opt, i) => `${i + 1}. ${opt}`).join('\n')}`
                : msg.type === 'location' ? `[Localização] ${msg.name || 'Coordenadas'}: ${msg.latitude}, ${msg.longitude}${msg.address ? `\nEndereço: ${msg.address}` : ''}`
                : msg.type === 'contact' ? `[Contato] ${msg.contacts.map(c => `${c.fullName}: ${c.phoneNumber}`).join(', ')}`
                : msg.type === 'sticker' ? '[Figurinha]'
                : msg.type === 'buttons' ? `[Botões] ${msg.body}\n${msg.buttons.map(b => `[${b.text}]`).join(' ')}`
                : msg.type === 'list' ? `[Lista] ${msg.body}\n${msg.buttonText}: ${msg.sections.map(s => s.title).join(', ')}`
                : '',
            mediaUrl: msg.type === 'media' ? msg.urlOrBase64
                : msg.type === 'sticker' ? msg.url
                : undefined,
            mediaType: msg.type === 'media' ? msg.mediaType
                : msg.type === 'poll' ? 'poll'
                : msg.type === 'location' ? 'location'
                : msg.type === 'contact' ? 'contact'
                : msg.type === 'sticker' ? 'sticker'
                : msg.type === 'buttons' ? 'buttons'
                : msg.type === 'list' ? 'list'
                : undefined,
            origin: msg.origin ?? 'BOT',
            userId: msg.userId,
            senderName: msg.senderName ?? 'Bot',
            whatsappMessageId,
        });

        return message;
    }

    static async findByTicket(ticketId: string) {
        return prisma.message.findMany({
            where: { ticketId },
            orderBy: { createdAt: 'asc' },
            include: {
                user: { select: { id: true, name: true } },
            },
        });
    }

    static async create(data: {
        ticketId: string;
        body?: string;
        mediaUrl?: string;
        mediaType?: string;
        origin: MessageOrigin;
        whatsappMessageId?: string;
        userId?: string;
        senderName?: string;
        isInternal?: boolean;
    }) {
        // ── Idempotency guard ─────────────────────────────────────────
        // If a WhatsApp message ID is provided, check the DB before inserting.
        // This serves as a second line of defence against duplicates.
        if (data.whatsappMessageId) {
            const existing = await prisma.message.findFirst({
                where: { whatsappMessageId: data.whatsappMessageId },
                include: { user: { select: { id: true, name: true } } },
            });
            if (existing) {
                console.warn(`[MessagesService] Duplicate whatsappMessageId skipped: ${data.whatsappMessageId}`);
                return existing;
            }
        }

        let message;
        try {
            message = await prisma.message.create({
                data,
                include: { user: { select: { id: true, name: true } } },
            });
        } catch (err: any) {
            if (err?.code === 'P2002' && data.whatsappMessageId) {
                const existing = await prisma.message.findFirst({
                    where: { whatsappMessageId: data.whatsappMessageId },
                    include: { user: { select: { id: true, name: true } } },
                });
                if (existing) {
                    console.warn(`[MessagesService] Corrida em whatsappMessageId resolvida via P2002; retornando existente: ${data.whatsappMessageId}`);
                    return existing;
                }
            }
            throw err;
        }

        // Update ticket's updatedAt
        await prisma.ticket.update({
            where: { id: data.ticketId },
            data: { updatedAt: new Date() },
        });

        // Emit to ticket room
        emitToTicket(data.ticketId, 'message:new', message);

        return message;
    }

    /**
     * Check the 24h session window status for a ticket
     */
    static async checkWindowStatus(ticketId: string) {
        const ticket = await prisma.ticket.findUnique({
            where: { id: ticketId },
            select: { lastContactMessageAt: true },
        });

        if (!ticket) throw new Error('Ticket não encontrado');

        const settings = await SettingsService.get();

        // Janela de 24h só existe na Cloud API da Meta. No WhatsApp Web (padrão
        // deste SaaS) fica desligada, então o agente sempre pode responder.
        if (!settings.enforce24hWindow) {
            return {
                withinWindow: true,
                allowTemplates: settings.allowPaidTemplates,
                minutesRemaining: 0,
            };
        }

        // If no contact message ever received, window is "expired"
        if (!ticket.lastContactMessageAt) {
            return {
                withinWindow: false,
                allowTemplates: settings.allowPaidTemplates,
                minutesRemaining: 0,
            };
        }

        const elapsed = Date.now() - new Date(ticket.lastContactMessageAt).getTime();
        const windowMs = WINDOW_HOURS * 60 * 60 * 1000;
        const withinWindow = elapsed < windowMs;
        const minutesRemaining = withinWindow
            ? Math.floor((windowMs - elapsed) / (60 * 1000))
            : 0;

        return {
            withinWindow,
            allowTemplates: settings.allowPaidTemplates,
            minutesRemaining,
        };
    }

    /**
     * Send a free-text message from agent.
     * Enforces 24h window rules.
     */
    static async sendAgentMessage(ticketId: string, body: string, userId: string) {
        const ticket = await prisma.ticket.findUnique({
            where: { id: ticketId },
            include: { contact: true },
        });

        if (!ticket) throw new Error('Ticket não encontrado');

        // Resolve sender name for watermark
        const sender = await prisma.user.findUnique({
            where: { id: userId },
            select: { name: true },
        });

        // Check 24h window
        const windowStatus = await this.checkWindowStatus(ticketId);

        if (!windowStatus.withinWindow) {
            if (!windowStatus.allowTemplates) {
                throw new Error(
                    'Janela de 24h expirada. O uso de templates pagos está desativado para esta conta.'
                );
            } else {
                throw new Error(
                    'Janela de 24h expirada. Use um Template HSM para enviar mensagens fora da janela.'
                );
            }
        }

        const client = await WhatsAppClient.getClientForTicket(ticketId);
        let whatsappMessageId;
        
        try {
            const result = await client.sendTextMessage(ticket.contact.phone, body, sender?.name ?? 'Agente');
            whatsappMessageId = result?.key?.id || result?.messages?.[0]?.id;
        } catch (error) {
            console.error('Failed to send WhatsApp message:', error);
            throw new Error('Falha ao enviar mensagem pelo WhatsApp. Verifique a conexão do canal.');
        }

        const message = await this.create({
            ticketId,
            body,
            origin: 'AGENT',
            userId,
            senderName: sender?.name ?? 'Agente',
            whatsappMessageId
        });

        return message;
    }

    /**
     * Send an HSM template message (Scenario C — outside 24h window)
     */
    static async sendHsmMessage(
        ticketId: string,
        templateName: string,
        variables: Record<string, string>,
        userId: string
    ) {
        const ticket = await prisma.ticket.findUnique({
            where: { id: ticketId },
            include: { contact: true },
        });

        if (!ticket) throw new Error('Ticket não encontrado');

        // Verify the template exists and is approved
        const template = await TemplatesService.findByName(templateName);
        if (!template) throw new Error('Template não encontrado');
        if (template.status !== 'APPROVED') throw new Error('Template não aprovado');

        // Build components with variables
        const components: any[] = [];
        const variableValues = Object.values(variables);
        if (variableValues.length > 0) {
            components.push({
                type: 'body',
                parameters: variableValues.map(v => ({ type: 'text', text: v })),
            });
        }

        // Build display body for local message
        let displayBody = `📋 [Template: ${templateName}]`;
        if (variableValues.length > 0) {
            displayBody += ` — Variáveis: ${variableValues.join(', ')}`;
        }

        const client = await WhatsAppClient.getClientForTicket(ticketId);
        let whatsappMessageId;

        // Send via WhatsApp Template API
        try {
            const result: any = await client.sendTemplateMessage(
                ticket.contact.phone,
                templateName,
                template.language,
                components
            );
            whatsappMessageId = result?.key?.id || result?.messages?.[0]?.id;
        } catch (error) {
            console.error('Failed to send HSM template message:', error);
            throw new Error('Falha ao disparar Template HSM.');
        }

        // Save message to DB
        const message = await this.create({
            ticketId,
            body: displayBody,
            origin: 'AGENT',
            whatsappMessageId
        });

        return message;
    }

    static async sendBotMessage(ticketId: string, body: string) {
        const ticket = await prisma.ticket.findUnique({
            where: { id: ticketId },
            include: { contact: true },
        });

        if (!ticket) throw new Error('Ticket não encontrado');

        const client = await WhatsAppClient.getClientForTicket(ticketId);
        let whatsappMessageId;

        try {
            const result = await client.sendTextMessage(ticket.contact.phone, body);
            whatsappMessageId = result?.key?.id || result?.messages?.[0]?.id;
        } catch (error) {
            console.error('Failed to send bot WhatsApp message:', error);
            throw new Error('Falha no envio do Bot pelo WhatsApp.');
        }

        const message = await this.create({
            ticketId,
            body,
            origin: 'BOT',
            whatsappMessageId
        });

        return message;
    }

    static async createSystemMessage(ticketId: string, body: string) {
        return this.create({
            ticketId,
            body,
            origin: 'SYSTEM',
        });
    }

    /**
     * Create an internal note (whisper) — saved to DB but never sent to WhatsApp.
     */
    static async createInternalNote(ticketId: string, body: string, userId: string) {
        const sender = await prisma.user.findUnique({
            where: { id: userId },
            select: { name: true },
        });

        const message = await prisma.message.create({
            data: {
                ticketId,
                body,
                origin: 'AGENT',
                isInternal: true,
                userId,
                senderName: sender?.name ?? 'Agente',
            },
            include: { user: { select: { id: true, name: true } } },
        });

        await prisma.ticket.update({
            where: { id: ticketId },
            data: { updatedAt: new Date() },
        });

        emitToTicket(ticketId, 'message:new', message);

        return message;
    }
}
