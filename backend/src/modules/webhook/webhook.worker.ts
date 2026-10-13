import { Job } from 'bullmq';
import { createWebhookWorker } from '../../lib/queue';
import { TicketsService } from '../tickets/tickets.service';
import { MessagesService } from '../messages/messages.service';
import { BotFlowEngine } from '../botflow/botflow.engine';
import { whatsappClient, WhatsAppClient } from '../../lib/whatsapp';
import { ConnectionsService } from '../connections/connections.service';
import { checkBusinessHours } from '../../lib/business-hours';
import { NpsService } from '../nps/nps.service';
import { SettingsService } from '../settings/settings.service';

interface WhatsAppMessage {
    from: string;
    id: string;
    timestamp: string;
    type: string;
    text?: { body: string };
    image?: { id: string; caption?: string; mime_type?: string };
    document?: { id: string; filename?: string; caption?: string; mime_type?: string };
    audio?: { id: string; mime_type?: string };
    video?: { id: string; caption?: string; mime_type?: string };
}

interface WhatsAppContact {
    profile: { name: string };
    wa_id: string;
}

/**
 * Process a WhatsApp webhook payload.
 */
export async function processWebhookPayload(payload: any) {
    if (payload?.object !== 'whatsapp_business_account') return;

    const entries = payload.entry || [];

    for (const entry of entries) {
        const changes = entry.changes || [];

        for (const change of changes) {
            if (change.field !== 'messages') continue;

            const value = change.value;
            const contacts: WhatsAppContact[] = value.contacts || [];
            const messages: WhatsAppMessage[] = value.messages || [];
            const statuses = value.statuses || [];

            // Extract phone_number_id for connection routing
            const phoneNumberId = value.metadata?.phone_number_id;

            // Resolve WhatsApp client for this connection
            let client: WhatsAppClient | typeof whatsappClient = whatsappClient;
            if (phoneNumberId && phoneNumberId !== 'SIMULATED') {
                const connection = await ConnectionsService.findByPhoneNumberId(phoneNumberId);
                if (connection) {
                    client = WhatsAppClient.forConnection(
                        connection.phoneNumberId || '',
                        connection.accessToken || '',
                        connection.type || 'cloud_api',
                        connection.id
                    );
                }
            }

            // ─── Handle call rejection ───────────────────────
            // Check for system/call events in statuses or messages
            for (const msg of messages) {
                if (msg.type === 'unsupported' || msg.type === 'system') {
                    // Could be a call event — check and reject
                    await handleCallRejection(msg.from, client);
                    continue;
                }
            }

            // Process actual messages
            for (const msg of messages) {
                if (msg.type === 'unsupported' || msg.type === 'system') continue;

                const contact = contacts.find(c => c.wa_id === msg.from);
                const contactName = contact?.profile?.name || msg.from;

                await processIncomingMessage(msg, contactName, client);
            }
        }
    }
}

/**
 * Handle call rejection: send friendly message.
 */
async function handleCallRejection(from: string, client: WhatsAppClient | typeof whatsappClient) {
    try {
        const settings = await SettingsService.get();
        if (!settings.rejectCalls) return;

        await client.sendTextMessage(from, settings.rejectCallMessage);
    } catch (e) {
        console.error('[Webhook] Failed to reject call:', e);
    }
}

async function processIncomingMessage(msg: WhatsAppMessage, contactName: string, client: WhatsAppClient | typeof whatsappClient) {
    try {
        // ─── Check for existing PENDING_NPS ticket ───────
        const { prisma } = await import('../../server');
        const existingContact = await prisma.contact.findFirst({ where: { phone: msg.from } });
        if (existingContact) {
            const npsTicket = await prisma.ticket.findFirst({
                where: {
                    contactId: existingContact.id,
                    status: 'PENDING_NPS',
                },
            });
            if (npsTicket && msg.text?.body) {
                // Save the incoming message
                await MessagesService.create({
                    ticketId: npsTicket.id,
                    body: msg.text.body,
                    origin: 'CONTACT',
                    whatsappMessageId: msg.id,
                });
                // Handle as NPS response
                const handled = await NpsService.handleNpsResponse(npsTicket.id, msg.text.body);
                if (handled) {
                    try { await client.markAsRead(msg.id); } catch { }
                    return;
                }
            }
        }

        // ─── Business hours check ────────────────────────
        const bh = await checkBusinessHours();
        if (!bh.isOpen) {
            // Send away message and don't create/route ticket
            if (bh.awayMessage) {
                try {
                    await client.sendTextMessage(msg.from, bh.awayMessage);
                } catch { }
            }
            try { await client.markAsRead(msg.id); } catch { }
            return;
        }

        // Find or create ticket
        const { ticket, isNew } = await TicketsService.findOrCreateByContact(msg.from, contactName);

        // Extract message content
        let body: string | undefined;
        let mediaUrl: string | undefined;
        let mediaType: string | undefined;

        switch (msg.type) {
            case 'text':
                body = msg.text?.body;
                break;
            case 'image':
                mediaType = 'image';
                body = msg.image?.caption;
                if (msg.image?.id) {
                    try { mediaUrl = await client.getMediaUrl(msg.image.id); } catch (e) { console.error('Failed to get image URL:', e); }
                }
                break;
            case 'document':
                mediaType = 'document';
                body = msg.document?.caption || msg.document?.filename;
                if (msg.document?.id) {
                    try { mediaUrl = await client.getMediaUrl(msg.document.id); } catch (e) { console.error('Failed to get document URL:', e); }
                }
                break;
            case 'audio':
                mediaType = 'audio';
                if (msg.audio?.id) {
                    try { mediaUrl = await client.getMediaUrl(msg.audio.id); } catch (e) { console.error('Failed to get audio URL:', e); }
                }
                break;
            case 'video':
                mediaType = 'video';
                body = msg.video?.caption;
                if (msg.video?.id) {
                    try { mediaUrl = await client.getMediaUrl(msg.video.id); } catch (e) { console.error('Failed to get video URL:', e); }
                }
                break;
            default:
                body = `[${msg.type}]`;
        }

        // Save incoming message
        await MessagesService.create({
            ticketId: ticket.id,
            body,
            mediaUrl,
            mediaType,
            origin: 'CONTACT',
            whatsappMessageId: msg.id,
        });

        // Update lastContactMessageAt for 24h window tracking
        await prisma.ticket.update({
            where: { id: ticket.id },
            data: { lastContactMessageAt: new Date() },
        });

        // Mark as read
        try { await client.markAsRead(msg.id); } catch { }

        // If ticket is in BOT status, process through bot engine
        if (ticket.status === 'BOT' && body) {
            if (isNew && ticket.botFlowId) {
                // New ticket: send welcome message first
                await BotFlowEngine.startFlow(ticket.id, ticket.botFlowId);
            } else {
                await BotFlowEngine.processMessage(ticket.id, body);
            }
        }
    } catch (error) {
        console.error('Error processing incoming message:', error);
    }
}

// Initialize the BullMQ worker
export function initWebhookWorker() {
    createWebhookWorker(async (job: Job) => {
        await processWebhookPayload(job.data);
    });
}
