import { Router, Request, Response } from 'express';
import { getWebhookQueue } from '../../lib/queue';
import { processWebhookPayload } from './webhook.worker';
import { ConnectionsService } from '../connections/connections.service';

const router = Router();

// GET /api/webhook — Meta verification endpoint
// Checks verify_token against DB connections first, then falls back to env var
router.get('/', async (req: Request, res: Response) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'] as string;
    const challenge = req.query['hub.challenge'];

    if (mode !== 'subscribe' || !token) {
        return res.sendStatus(403);
    }

    // Check DB connections first
    const connection = await ConnectionsService.findByVerifyToken(token);
    if (connection) {
        console.log(`✅ Webhook verified for connection: ${connection.name} (${connection.phoneNumberId})`);
        return res.status(200).send(challenge);
    }

    // Fallback to env var
    if (token === process.env.WHATSAPP_VERIFY_TOKEN) {
        console.log('✅ Webhook verified (legacy env var)');
        return res.status(200).send(challenge);
    }

    return res.sendStatus(403);
});

// POST /api/webhook — Receive WhatsApp messages
// Extracts phone_number_id to identify which connection the message belongs to
router.post('/', async (req: Request, res: Response) => {
    try {
        const body = req.body;

        // Respond 200 immediately to Meta
        res.sendStatus(200);

        // Enqueue to BullMQ or process directly
        const queue = getWebhookQueue();
        if (queue) {
            await queue.add('process-webhook', body, {
                removeOnComplete: 100,
                removeOnFail: 50,
            });
        } else {
            // Process directly if Redis is not available
            await processWebhookPayload(body);
        }
    } catch (error) {
        console.error('Webhook error:', error);
        res.sendStatus(200); // Always return 200 to Meta
    }
});

// POST /api/webhook/simulate — For testing without Meta
router.post('/simulate', async (req: Request, res: Response) => {
    try {
        const { phone, message, contactName } = req.body;
        if (!phone || !message) {
            return res.status(400).json({ error: 'phone e message são obrigatórios' });
        }

        // Create a simulated Meta-like payload
        const simulatedPayload = {
            object: 'whatsapp_business_account',
            entry: [{
                id: 'SIMULATED',
                changes: [{
                    value: {
                        messaging_product: 'whatsapp',
                        metadata: { display_phone_number: '0000000000', phone_number_id: 'SIMULATED' },
                        contacts: [{ profile: { name: contactName || 'Contato Teste' }, wa_id: phone }],
                        messages: [{
                            from: phone,
                            id: `sim_${Date.now()}`,
                            timestamp: Math.floor(Date.now() / 1000).toString(),
                            text: { body: message },
                            type: 'text',
                        }],
                    },
                    field: 'messages',
                }],
            }],
        };

        await processWebhookPayload(simulatedPayload);
        res.json({ success: true, message: 'Webhook simulado processado' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
