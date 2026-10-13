import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';

let connection: IORedis | null = null;
let webhookQueue: Queue | null = null;
let redisAvailable = false;

function getConnection(): IORedis | null {
    if (!connection) {
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
        connection = new IORedis(redisUrl, {
            maxRetriesPerRequest: null,
            retryStrategy: () => null, // Don't retry, fail fast
            connectTimeout: 3000,
            lazyConnect: true,
        });
        connection.on('error', () => {
            // Silently ignore Redis errors — queue is optional for local dev
        });
    }
    return connection;
}

export async function initQueue() {
    try {
        const conn = getConnection();
        if (!conn) return;

        await conn.connect();
        redisAvailable = true;
        webhookQueue = new Queue('whatsapp-webhooks', { connection: conn });
        console.log('📬 BullMQ queue initialized');
    } catch (error) {
        redisAvailable = false;
        console.warn('⚠️  Redis not available — webhook queue disabled (install Redis for production)');
    }
}

export function getWebhookQueue(): Queue | null {
    return webhookQueue;
}

export function isRedisAvailable(): boolean {
    return redisAvailable;
}

export function createWebhookWorker(
    processor: (job: Job) => Promise<void>
): Worker | null {
    if (!redisAvailable || !connection) {
        console.warn('⚠️  Redis not available — webhook worker not started');
        return null;
    }

    try {
        const worker = new Worker('whatsapp-webhooks', processor, {
            connection: connection,
            concurrency: 5,
        });

        worker.on('completed', (job) => {
            console.log(`✅ Webhook job ${job.id} completed`);
        });

        worker.on('failed', (job, err) => {
            console.error(`❌ Webhook job ${job?.id} failed:`, err.message);
        });

        console.log('👷 Webhook worker started');
        return worker;
    } catch (error) {
        console.warn('⚠️  Could not start webhook worker:', (error as Error).message);
        return null;
    }
}
