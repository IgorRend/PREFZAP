import { prisma } from '../../server';

export class TemplatesService {
    /**
     * List all HSM templates (optionally filter by status)
     */
    static async findAll(status?: string) {
        return prisma.hsmTemplate.findMany({
            where: status ? { status } : undefined,
            orderBy: { name: 'asc' },
        });
    }

    /**
     * Get a single template by ID
     */
    static async findById(id: string) {
        return prisma.hsmTemplate.findUnique({ where: { id } });
    }

    /**
     * Get a single template by name
     */
    static async findByName(name: string, tenantId?: string) {
        return prisma.hsmTemplate.findFirst({ where: { name, ...(tenantId ? { tenantId } : {}) } });
    }

    /**
     * Create a template manually
     */
    static async create(data: {
        name: string;
        namespace?: string;
        language?: string;
        category?: string;
        components?: any[];
        status?: string;
        tenantId: string;
    }) {
        return prisma.hsmTemplate.create({
            data: {
                name: data.name,
                namespace: data.namespace,
                language: data.language || 'pt_BR',
                category: data.category,
                components: JSON.stringify(data.components || []),
                status: data.status || 'APPROVED',
                tenantId: data.tenantId,
            },
        });
    }

    /**
     * Update a template
     */
    static async update(id: string, data: {
        name?: string;
        namespace?: string;
        language?: string;
        category?: string;
        components?: any[];
        status?: string;
    }) {
        const updateData: any = { ...data };
        if (data.components) {
            updateData.components = JSON.stringify(data.components);
        }
        return prisma.hsmTemplate.update({ where: { id }, data: updateData });
    }

    /**
     * Delete a template
     */
    static async delete(id: string) {
        return prisma.hsmTemplate.delete({ where: { id } });
    }

    /**
     * Sync templates from Meta WhatsApp Business API
     * GET /{WABA_ID}/message_templates
     */
    static async syncFromMeta() {
        const token = process.env.WHATSAPP_TOKEN;
        const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;

        if (!token || !wabaId) {
            throw new Error('WHATSAPP_TOKEN and WHATSAPP_BUSINESS_ACCOUNT_ID are required for sync');
        }

        const axios = (await import('axios')).default;
        const apiVersion = process.env.WHATSAPP_API_VERSION || 'v21.0';
        const url = `https://graph.facebook.com/${apiVersion}/${wabaId}/message_templates`;

        const response = await axios.get(url, {
            headers: { Authorization: `Bearer ${token}` },
            params: { limit: 100 },
        });

        const templates = response.data?.data || [];
        const synced: string[] = [];

        for (const tpl of templates) {
            // Use findFirst + create/update instead of upsert since name is now compound unique
            const existing = await prisma.hsmTemplate.findFirst({ where: { name: tpl.name } });
            if (existing) {
                await prisma.hsmTemplate.update({
                    where: { id: existing.id },
                    data: {
                        namespace: tpl.id,
                        language: tpl.language || 'pt_BR',
                        category: tpl.category,
                        components: JSON.stringify(tpl.components || []),
                        status: tpl.status || 'APPROVED',
                    },
                });
            } else {
                // Get default tenant for Meta sync (admin-only operation)
                const defaultTenant = await prisma.tenant.findFirst({ where: { isActive: true } });
                await prisma.hsmTemplate.create({
                    data: {
                        name: tpl.name,
                        namespace: tpl.id,
                        language: tpl.language || 'pt_BR',
                        category: tpl.category,
                        components: JSON.stringify(tpl.components || []),
                        status: tpl.status || 'APPROVED',
                        tenantId: defaultTenant?.id || 'default-tenant',
                    },
                });
            }
            synced.push(tpl.name);
        }

        return { synced: synced.length, templates: synced };
    }
}
