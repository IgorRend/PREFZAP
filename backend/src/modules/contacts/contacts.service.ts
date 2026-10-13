import { prisma } from '../../server';

// ─── CPF Validation ───────────────────────────────────────
function isValidCpf(cpf: string): boolean {
    const digits = cpf.replace(/\D/g, '');
    if (digits.length !== 11 || /^(\d)\1+$/.test(digits)) return false;
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
    let r = (sum * 10) % 11;
    if (r === 10 || r === 11) r = 0;
    if (r !== parseInt(digits[9])) return false;
    sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
    r = (sum * 10) % 11;
    if (r === 10 || r === 11) r = 0;
    return r === parseInt(digits[10]);
}

function formatCpf(cpf: string): string {
    return cpf.replace(/\D/g, '');
}

export class ContactsService {

    // ─── Search ───────────────────────────────────────────
    static async search(query: string, limit = 20, tenantId?: string) {
        const q = query.trim();
        if (!q) {
            // If query is empty, return the latest contacts instead of an empty array
            return prisma.contact.findMany({
                where: {
                    mergedIntoId: null, // never return ghost contacts
                    ...(tenantId ? { tenantId } : {}),
                },
                include: {
                    _count: { select: { tickets: true } },
                },
                orderBy: { updatedAt: 'desc' },
                take: limit,
            });
        }

        // SQLite: use string-contains (LIKE) on all searchable fields
        return prisma.contact.findMany({
            where: {
                mergedIntoId: null, // never return ghost contacts
                ...(tenantId ? { tenantId } : {}),
                OR: [
                    { name: { contains: q } },
                    { fullName: { contains: q } },
                    { phone: { contains: q } },
                    { cpf: { contains: q } },
                    { email: { contains: q } },
                ],
            },
            include: {
                _count: { select: { tickets: true } },
            },
            orderBy: { updatedAt: 'desc' },
            take: limit,
        });
    }

    // ─── Paginated List ───────────────────────────────────
    /**
     * Paginated contact list for the Contacts screen. Unlike `search` (a single
     * capped fetch used by pickers), this returns page metadata so the UI can
     * load thousands of contacts via infinite scroll. `total`/`identifiedTotal`
     * reflect the WHOLE filtered set, not just the current page.
     */
    static async list(opts: { tenantId?: string; page?: number; pageSize?: number; q?: string }) {
        const page = Math.max(1, opts.page || 1);
        const pageSize = Math.min(100, Math.max(1, opts.pageSize || 60));
        const q = (opts.q || '').trim();

        const where: any = {
            mergedIntoId: null, // never list ghost (merged) contacts
            ...(opts.tenantId ? { tenantId: opts.tenantId } : {}),
            ...(q
                ? {
                    OR: [
                        { name: { contains: q } },
                        { fullName: { contains: q } },
                        { phone: { contains: q } },
                        { cpf: { contains: q } },
                        { email: { contains: q } },
                    ],
                }
                : {}),
        };

        const [total, identifiedTotal, contacts] = await Promise.all([
            prisma.contact.count({ where }),
            prisma.contact.count({ where: { ...where, name: { not: null } } }),
            prisma.contact.findMany({
                where,
                include: { _count: { select: { tickets: true } } },
                orderBy: { updatedAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
        ]);

        return { total, identifiedTotal, page, pageSize, contacts };
    }

    // ─── Find by ID ───────────────────────────────────────
    static async findById(id: string, tenantId?: string): Promise<any> {
        const contact = await prisma.contact.findFirst({
            where: { id, ...(tenantId ? { tenantId } : {}) },
            include: {
                tickets: {
                    orderBy: { createdAt: 'desc' },
                    include: {
                        department: { select: { id: true, name: true } },
                        user: { select: { id: true, name: true } },
                        _count: { select: { messages: true } },
                    },
                },
                _count: { select: { tickets: true } },
                mergedFrom: {
                    select: { id: true, name: true, phone: true, channel: true },
                },
            },
        });

        if (!contact) return null;

        // If this contact was merged, follow the pointer to canonical
        if (contact.mergedIntoId) {
            return this.findById(contact.mergedIntoId);
        }

        return contact;
    }

    // ─── Update CRM Profile ───────────────────────────────
    static async update(id: string, data: {
        fullName?: string;
        cpf?: string;
        email?: string;
        avatarUrl?: string;
    }) {
        // Validate CPF format if provided
        if (data.cpf) {
            const cleaned = formatCpf(data.cpf);
            if (!isValidCpf(cleaned)) {
                throw new Error('CPF inválido. Verifique os dígitos e tente novamente.');
            }
            data.cpf = cleaned;

            // Check uniqueness (excluding self)
            const existing = await prisma.contact.findFirst({
                where: { cpf: cleaned, id: { not: id } },
            });
            if (existing) {
                throw new Error(`CPF já cadastrado para o contato: ${existing.name || existing.phone}`);
            }
        }

        return prisma.contact.update({
            where: { id },
            data,
        });
    }

    // ─── Get Timeline (all messages across all tickets for a contact) ──
    /**
     * Returns messages flattened across all tickets of a contact,
     * ordered chronologically (ASC). Paginated: newest page first
     * (page=1 = most recent 'limit' messages; scroll up = page=2, etc.)
     *
     * Response shape:
     * {
     *   messages: (Message & { ticket: { id, protocol, status, closedAt } })[],
     *   total: number,
     *   page: number,
     *   hasMore: boolean,
     * }
     */
    static async getTimeline(contactId: string, page = 1, limit = 50) {
        // Resolve merged contact
        const contact = await prisma.contact.findUnique({ where: { id: contactId } });
        if (!contact) throw new Error('Contato não encontrado');
        const resolvedId = contact.mergedIntoId ?? contactId;

        // Also include ghost contacts that were merged into this one
        const allContactIds = await this.getContactFamilyIds(resolvedId);

        const total = await prisma.message.count({
            where: { ticket: { contactId: { in: allContactIds } } },
        });

        const skip = Math.max(0, total - page * limit);
        const take = Math.min(limit, total - (page - 1) * limit);

        if (take <= 0) {
            return { messages: [], total, page, hasMore: false };
        }

        const messages = await prisma.message.findMany({
            where: { ticket: { contactId: { in: allContactIds } } },
            include: {
                ticket: {
                    select: { id: true, protocol: true, status: true, closedAt: true },
                },
                user: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'asc' },
            skip,
            take,
        });

        return {
            messages,
            total,
            page,
            hasMore: skip > 0,
        };
    }

    // ─── Contact Merge ───────────────────────────────────
    /**
     * Merges sourceContact into targetContact.
     * - All tickets from source are re-assigned to target
     * - Source is marked with mergedIntoId = targetId (becomes ghost)
     * - A merge log entry is created for auditing
     * - Automatic merge is triggered when CPF/email matches on update
     */
    static async merge(sourceId: string, targetId: string, triggeredByUserId?: string, mergeReason = 'manual') {
        if (sourceId === targetId) throw new Error('Não é possível fundir um contato com ele mesmo.');

        const [source, target] = await Promise.all([
            prisma.contact.findUnique({ where: { id: sourceId } }),
            prisma.contact.findUnique({ where: { id: targetId } }),
        ]);

        if (!source) throw new Error('Contato de origem não encontrado');
        if (!target) throw new Error('Contato de destino não encontrado');
        if (source.mergedIntoId) throw new Error('Contato de origem já foi fundido anteriormente.');

        // Re-assign all tickets from source → target
        await prisma.ticket.updateMany({
            where: { contactId: sourceId },
            data: { contactId: targetId },
        });

        // Re-assign web widget sessions
        await prisma.webWidgetSession.updateMany({
            where: { contactId: sourceId },
            data: { contactId: targetId },
        });

        // Mark source as merged (ghost)
        await prisma.contact.update({
            where: { id: sourceId },
            data: { mergedIntoId: targetId },
        });

        // Merge CRM fields: fill target blanks from source data
        const mergedData: any = {};
        if (!target.fullName && source.fullName) mergedData.fullName = source.fullName;
        if (!target.cpf && source.cpf) mergedData.cpf = source.cpf;
        if (!target.email && source.email) mergedData.email = source.email;
        if (Object.keys(mergedData).length > 0) {
            await prisma.contact.update({ where: { id: targetId }, data: mergedData });
        }

        // Audit log
        await prisma.contactMergeLog.create({
            data: {
                sourceContactId: sourceId,
                targetContactId: targetId,
                triggeredByUserId: triggeredByUserId ?? null,
                mergeReason,
            },
        });

        // Return the enriched target
        return this.findById(targetId);
    }

    // ─── Auto-merge by CPF ────────────────────────────────
    /**
     * Called after updating a contact's CPF.
     * If another contact (different id, not merged) shares the same CPF,
     * auto-merge the OLDER one INTO the NEWER one.
     */
    static async autoMergeByCpf(updatedContactId: string, cpf: string) {
        const duplicate = await prisma.contact.findFirst({
            where: {
                cpf,
                id: { not: updatedContactId },
                mergedIntoId: null,
            },
            orderBy: { createdAt: 'asc' }, // older contact is the "source"
        });

        if (!duplicate) return null;

        // Merge the older (duplicate) into the newer (updatedContactId)
        return this.merge(duplicate.id, updatedContactId, undefined, 'cpf');
    }

    // ─── Merge History for a Contact ─────────────────────
    static async getMergeHistory(contactId: string) {
        return prisma.contactMergeLog.findMany({
            where: {
                OR: [
                    { sourceContactId: contactId },
                    { targetContactId: contactId },
                ],
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    // ─── Helpers ──────────────────────────────────────────
    /** Returns the IDs of the canonical contact AND all ghost contacts merged into it. */
    private static async getContactFamilyIds(canonicalId: string): Promise<string[]> {
        const ghosts = await prisma.contact.findMany({
            where: { mergedIntoId: canonicalId },
            select: { id: true },
        });
        return [canonicalId, ...ghosts.map(g => g.id)];
    }

    // ─── Sync Device Contacts ─────────────────────────────
    static async syncDeviceContacts(tenantId: string) {
        // Find an active WhatsApp connection for this tenant
        const conn = await prisma.whatsAppConnection.findFirst({
            where: { tenantId, isConnected: true },
        });

        if (!conn) {
            throw new Error('Nenhuma conexão ativa do WhatsApp encontrada para este tenant.');
        }

        const path = await import('path');
        const fs = await import('fs');
        const Database = await import('better-sqlite3');

        const dbPath = path.resolve(process.cwd(), 'prisma', 'zapo_sessions', `zapo_${conn.id}.sqlite`);
        if (!fs.existsSync(dbPath)) {
            throw new Error('Banco de dados da sessão Zapo não encontrado.');
        }

        let rawContacts: any[] = [];
        try {
            const db = new Database.default(dbPath, { readonly: true });
            rawContacts = db.prepare(`
                SELECT jid, display_name AS displayName, push_name AS pushName, phone_number AS phoneNumber 
                FROM mailbox_contacts 
                WHERE session_id = ?
            `).all(conn.id);
            db.close();
        } catch (err: any) {
            throw new Error('Falha ao ler contatos do banco Zapo: ' + err.message);
        }

        let syncedCount = 0;

        for (const item of rawContacts) {
            const jid = item?.jid;
            if (!jid) continue;

            // Filter out WhatsApp Groups or Broadcast lists
            if (jid.includes('-') || jid.includes('@g.us') || jid.includes('@broadcast')) {
                continue;
            }

            // Extract pure phone number
            const phone = item.phoneNumber || jid.split('@')[0];
            // Prefer native name over pushName if available
            const nativeName = item.displayName || item.pushName || null;

            // Upsert contact
            const existing = await prisma.contact.findUnique({
                where: {
                    tenantId_phone: {
                        tenantId,
                        phone,
                    }
                }
            });

            if (existing) {
                // If it exists but has no name, update it with the native device contact name
                if (!existing.name && nativeName) {
                    await prisma.contact.update({
                        where: { id: existing.id },
                        data: { name: nativeName }
                    });
                    syncedCount++;
                }
            } else {
                // Create new contact strictly assigned to this tenantId
                await prisma.contact.create({
                    data: {
                        tenantId,
                        phone,
                        name: nativeName,
                    }
                });
                syncedCount++;
            }
        }

        return { syncedCount, totalProcessed: rawContacts.length };
    }
}
