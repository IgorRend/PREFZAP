import { prisma } from '../../server';

// ─── In-Memory Settings Cache ─────────────────────────────
// Prevents hammering SQLite on every cron tick.
// TTL: 60 seconds. Invalidated on settings update via invalidateSettingsCache().
// Cache is now per-tenant for proper multitenancy.

type SettingsRow = Awaited<ReturnType<typeof prisma.accountSettings.findFirst>>;

interface CachedSettings {
    data: NonNullable<SettingsRow>;
    expiresAt: number;
}

const cacheByTenant = new Map<string, CachedSettings>();
const SETTINGS_CACHE_TTL_MS = 60_000; // 60 seconds

async function _fetchSettings(tenantId: string) {
    let settings = await prisma.accountSettings.findFirst({
        where: { tenantId },
    });
    if (!settings) {
        settings = await prisma.accountSettings.create({
            data: { tenantId },
        });
    }
    return settings;
}

export class SettingsService {
    /**
     * Get account settings with 60-second in-memory cache.
     * Cache is per-tenant to avoid cross-tenant data leakage.
     * If no tenantId is provided, falls back to the first active tenant.
     */
    static async get(tenantId?: string) {
        // Resolve tenantId if not provided (used by cron jobs)
        if (!tenantId) {
            const defaultTenant = await prisma.tenant.findFirst({ where: { isActive: true } });
            tenantId = defaultTenant?.id || 'default-tenant';
        }

        const now = Date.now();
        const cached = cacheByTenant.get(tenantId);
        if (cached && now < cached.expiresAt) {
            return cached.data;
        }
        const data = await _fetchSettings(tenantId);
        cacheByTenant.set(tenantId, { data, expiresAt: now + SETTINGS_CACHE_TTL_MS });
        return data;
    }

    /**
     * Call this after any settings update so the next get() fetches fresh data.
     */
    static invalidateCache(tenantId?: string) {
        if (tenantId) {
            cacheByTenant.delete(tenantId);
        } else {
            cacheByTenant.clear();
        }
    }

    /**
     * Update account settings for a tenant (admin only). Invalidates cache.
     */
    static async update(tenantId: string, data: {
        allowPaidTemplates?: boolean;
        autoRenewWindowPrompt?: boolean;
        enforce24hWindow?: boolean;
        businessHoursMode?: string;
        businessHoursJson?: string;
        awayMessage?: string;
        timezone?: string;
        npsEnabled?: boolean;
        npsMessage?: string;
        npsExpirationHours?: number;
        autoCloseMinutes?: number;
        slaAlertMinutes?: number;
        rejectCalls?: boolean;
        rejectCallMessage?: string;
        activeBotFlowId?: string | null;
    }) {
        await this.get(tenantId); // Ensure row exists
        const settings = await prisma.accountSettings.findFirst({ where: { tenantId } });
        if (!settings) throw new Error('Configurações não encontradas para este tenant');

        const updated = await prisma.accountSettings.update({
            where: { id: settings.id },
            data,
        });
        this.invalidateCache(tenantId);
        return updated;
    }
}
