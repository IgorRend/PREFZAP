import dotenv from 'dotenv';
dotenv.config();

// ── Startup environment validation ─────────────────────────────────
const REQUIRED_ENV = ['JWT_SECRET', 'APP_WEBHOOK_URL'] as const;
for (const key of REQUIRED_ENV) {
    if (!process.env[key]) {
        console.error(`\n❌ FATAL: Required environment variable ${key} is not set.\n   Create a .env file based on .env.example and restart.\n`);
        process.exit(1);
    }
}
if (process.env.JWT_SECRET === 'your-super-secret-jwt-key-change-in-production') {
    console.warn('\n⚠️  WARNING: JWT_SECRET is set to the default placeholder. Change it before deploying to production!\n');
}

import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import { initSocket } from './lib/socket';
import { initQueue } from './lib/queue';
import authRoutes from './modules/auth/auth.controller';
import userRoutes from './modules/users/users.controller';
import departmentRoutes from './modules/departments/departments.controller';
import ticketRoutes from './modules/tickets/tickets.controller';
import messageRoutes from './modules/messages/messages.controller';
import webhookRoutes from './modules/webhook/webhook.controller';
import botflowRoutes from './modules/botflow/botflow.controller';
import { ZapoService } from './lib/zapo';
import settingsRoutes from './modules/settings/settings.controller';
import templateRoutes from './modules/templates/templates.controller';
import internalChatRoutes from './modules/internal-chat/internal-chat.controller';
import bulkImportRoutes from './modules/bulk-import/bulk-import.controller';
import quickRepliesRoutes from './modules/quick-replies/quick-replies.controller';
import tagsRoutes from './modules/tags/tags.controller';
import analyticsRoutes from './modules/analytics/analytics.controller';
import connectionsRoutes from './modules/connections/connections.controller';
import zapoCompatRoutes from './modules/connections/zapo-compat.controller';
import superAdminRoutes from './modules/super-admin/super-admin.controller';
import { SuperAdminService } from './modules/super-admin/super-admin.service';
import contactRoutes from './modules/contacts/contacts.controller';
import widgetRoutes from './modules/widget/widget.controller';
import { initWidgetGateway, setWidgetNamespace } from './modules/widget/widget.gateway';
import kanbanRoutes from './modules/kanban/kanban.controller';
import auditRoutes from './modules/audit/audit.controller';
import { startWindowRenewalCron } from './lib/window-renewal.cron';
import { startAutomationsCron } from './lib/automations.cron';

process.on('unhandledRejection', (reason) => {
    console.error('[UnhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
    console.error('[UncaughtException]', err);
});

const app = express();
const server = http.createServer(app);

// Prisma
export { prisma, globalPrisma, tenantStorage } from './lib/db';

// CORS
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Static files for media uploads and embeddable assets
app.use('/uploads', express.static('uploads'));
app.use(express.static('public', { maxAge: '1d' })); // serves /widget.js

// Initialize Socket.io
const io = new SocketIOServer(server, {
    cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:5173',
        methods: ['GET', 'POST'],
        credentials: true,
    },
});
initSocket(io);

// Initialize Widget Gateway (separate namespace: /widget)
const widgetNs = initWidgetGateway(io);
setWidgetNamespace(widgetNs);

console.log('📡 Widget gateway ready on /widget');

// Initialize BullMQ (async, non-blocking — works without Redis)
initQueue().catch(() => { });

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/bot-flows', botflowRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/internal-chat', internalChatRoutes);
app.use('/api/bulk-import', bulkImportRoutes);
app.use('/api/quick-replies', quickRepliesRoutes);
app.use('/api/tags', tagsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/connections', connectionsRoutes);
app.use('/api/zapo-compat', zapoCompatRoutes);
app.use('/api/super-admin', superAdminRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/widgets', widgetRoutes);
app.use('/api/kanban', kanbanRoutes);
app.use('/api/audit', auditRoutes);


// Public endpoint: tenant config (niche + modules for frontend)
app.get('/api/tenant-config', async (req, res) => {
    try {
        let tenantId: string | undefined = undefined;

        // 1. Get x-tenant-id header (for superadmin impersonation)
        const xTenantId = req.headers['x-tenant-id'] as string;

        // 2. Decode JWT if Authorization header is present
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            try {
                const jwt = require('jsonwebtoken');
                const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
                tenantId = decoded.tenantId;
                
                // Superadmin can override with x-tenant-id
                if (decoded.isSuperAdmin && xTenantId) {
                    tenantId = xTenantId;
                }
            } catch (e) {
                // Invalid token, ignore and fallback
            }
        } else if (xTenantId) {
            // Direct header override (fallback)
            tenantId = xTenantId;
        }

        const config = await SuperAdminService.getCurrentTenantConfig(tenantId);
        res.json(config);
    } catch (error: any) {
        res.json({ businessNiche: 'generic', activeModules: [] });
    }
});

// Health check
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Global error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error',
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, async () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📡 Socket.io ready`);
    
    // Initialize active Zapo connections
    try {
        await ZapoService.init();
    } catch (err) {
        console.error('Failed to initialize ZapoService:', err);
    }

    startWindowRenewalCron();
    startAutomationsCron();
});

export { io };
export default app;
