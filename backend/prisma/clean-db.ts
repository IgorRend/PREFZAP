import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
    console.log('[Cleanup] Cleaning database tables...');

    const tables = [
        'ticket_tags',
        'messages',
        'tickets',
        'contact_merge_logs',
        'web_widget_sessions',
        'contacts',
        'whatsapp_connections',
        'nps_ratings',
        'internal_read_receipts',
        'internal_messages',
        'internal_participants',
        'internal_rooms',
        'audit_logs'
    ];

    for (const table of tables) {
        try {
            await prisma.$executeRawUnsafe(`DELETE FROM ${table};`);
            console.log(`[Cleanup] Cleared table: ${table}`);
        } catch (err: any) {
            console.error(`[Cleanup] Error clearing table ${table}:`, err.message);
        }
    }

    console.log('[Cleanup] Cleaning Zapo SQLite session files...');
    const sessionsDir = path.resolve(__dirname, 'zapo_sessions');
    if (fs.existsSync(sessionsDir)) {
        try {
            const files = fs.readdirSync(sessionsDir);
            for (const file of files) {
                if (file.endsWith('.sqlite') || file.endsWith('.sqlite-journal')) {
                    fs.unlinkSync(path.join(sessionsDir, file));
                    console.log(`[Cleanup] Deleted session file: ${file}`);
                }
            }
        } catch (err: any) {
            console.error('[Cleanup] Error deleting session files:', err.message);
        }
    }

    console.log('[Cleanup] Database cleanup completed successfully!');
}

main()
  .catch((e) => {
    console.error('[Cleanup] Fatal cleanup error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
