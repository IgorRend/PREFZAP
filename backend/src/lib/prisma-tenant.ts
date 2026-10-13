/**
 * prisma-tenant.ts
 *
 * Prisma Client Extension that creates a tenant-scoped client.
 * All queries on tenant-owned models automatically inject `where: { tenantId }`
 * so developers cannot accidentally read cross-tenant data.
 *
 * Usage:
 *   import { createTenantPrisma } from '../../lib/prisma-tenant';
 *   const db = createTenantPrisma(req.tenantId!);
 *   const tickets = await db.ticket.findMany(); // ← tenantId injected automatically
 *
 * NOTE: The global `prisma` from server.ts is still available for:
 *   - Super-admin cross-tenant queries
 *   - Webhook handlers that resolve tenantId from the payload (before context is set)
 *   - Auth (login must query by email globally)
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { globalPrisma } from './db';

// ─── Models that carry a tenantId column ──────────────────────────────────────
// Any model NOT in this list is either a junction table or globally scoped.
const TENANT_MODELS = new Set([
    'user',
    'department',
    'contact',
    'ticket',
    'whatsAppConnection',
    'botFlow',
    'accountSettings',
    'hsmTemplate',
    'quickReply',
    'tag',
    'kanbanBoard',
    'webWidget',
    'internalRoom',
    'npsRating',
    'auditLog',
]);

/**
 * Creates a Prisma Client Extension that automatically injects
 * `where: { tenantId }` on all query operations for tenant-owned models.
 *
 * This is a **Row-Level Security** emulation at the application layer.
 */
export function createTenantPrisma(tenantId: string) {
    return globalPrisma.$extends({
        name: `tenant-scope:${tenantId}`,
        query: {
            $allModels: {
                // ── READ operations ──────────────────────────────────────────
                async findMany({ model, operation, args, query }: any) {
                    if (TENANT_MODELS.has(model)) {
                        args.where = { ...args.where, tenantId };
                    }
                    return query(args);
                },

                async findFirst({ model, args, query }: any) {
                    if (TENANT_MODELS.has(model)) {
                        args.where = { ...args.where, tenantId };
                    }
                    return query(args);
                },

                async findUnique({ model, args, query }: any) {
                    // findUnique cannot have arbitrary where clauses (compound key constraint)
                    // We fall back to findFirst with tenantId injected for safety
                    if (TENANT_MODELS.has(model)) {
                        const result = await (globalPrisma as any)[model].findFirst({
                            ...args,
                            where: { ...args.where, tenantId },
                        });
                        return result;
                    }
                    return query(args);
                },

                async count({ model, args, query }: any) {
                    if (TENANT_MODELS.has(model)) {
                        args.where = { ...args.where, tenantId };
                    }
                    return query(args);
                },

                async aggregate({ model, args, query }: any) {
                    if (TENANT_MODELS.has(model)) {
                        args.where = { ...args.where, tenantId };
                    }
                    return query(args);
                },

                // ── WRITE operations — inject tenantId into data ─────────────
                async create({ model, args, query }: any) {
                    if (TENANT_MODELS.has(model)) {
                        args.data = { ...args.data, tenantId };
                    }
                    return query(args);
                },

                async createMany({ model, args, query }: any) {
                    if (TENANT_MODELS.has(model) && Array.isArray(args.data)) {
                        args.data = args.data.map((d: any) => ({ ...d, tenantId }));
                    }
                    return query(args);
                },

                // ── UPDATE / DELETE — scope to tenant before mutating ────────
                async update({ model, args, query }: any) {
                    if (TENANT_MODELS.has(model)) {
                        // Scope the where clause so cross-tenant updates are impossible
                        args.where = { ...args.where, tenantId };
                    }
                    return query(args);
                },

                async updateMany({ model, args, query }: any) {
                    if (TENANT_MODELS.has(model)) {
                        args.where = { ...args.where, tenantId };
                    }
                    return query(args);
                },

                async delete({ model, args, query }: any) {
                    if (TENANT_MODELS.has(model)) {
                        args.where = { ...args.where, tenantId };
                    }
                    return query(args);
                },

                async deleteMany({ model, args, query }: any) {
                    if (TENANT_MODELS.has(model)) {
                        args.where = { ...args.where, tenantId };
                    }
                    return query(args);
                },

                async upsert({ model, args, query }: any) {
                    if (TENANT_MODELS.has(model)) {
                        args.where = { ...args.where, tenantId };
                        args.create = { ...args.create, tenantId };
                        args.update = { ...args.update };
                    }
                    return query(args);
                },
            },
        },
    });
}

/** Type alias for the tenant-scoped client (useful for typing service params) */
export type TenantPrismaClient = ReturnType<typeof createTenantPrisma>;
