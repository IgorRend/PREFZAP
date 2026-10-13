import { prisma } from '../../server';
import { DDD_TO_STATE, STATE_NAMES, extractDDD } from '../../lib/ddd-mapping';

export class AnalyticsService {
    /** TMR — Tempo Médio de Resposta (Average First Response Time) */
    static async getAverageFirstResponseTime(from?: Date, to?: Date, tenantId?: string) {
        const dateFilter: any = {};
        if (from) dateFilter.gte = from;
        if (to) dateFilter.lte = to;

        const tickets = await prisma.ticket.findMany({
            where: {
                status: { in: ['OPEN', 'CLOSED'] },
                excludeFromReports: false,
                ...(from || to ? { createdAt: dateFilter } : {}),
                ...(tenantId ? { tenantId } : {}),
            },
            select: { id: true },
        });

        if (tickets.length === 0) return { tmr: 0, count: 0 };

        let totalMs = 0;
        let validCount = 0;

        for (const ticket of tickets) {
            const firstContact = await prisma.message.findFirst({
                where: { ticketId: ticket.id, origin: 'CONTACT' },
                orderBy: { createdAt: 'asc' },
                select: { createdAt: true },
            });

            const firstAgent = await prisma.message.findFirst({
                where: { ticketId: ticket.id, origin: 'AGENT', isInternal: false },
                orderBy: { createdAt: 'asc' },
                select: { createdAt: true },
            });

            if (firstContact && firstAgent) {
                const diff = new Date(firstAgent.createdAt).getTime() - new Date(firstContact.createdAt).getTime();
                if (diff > 0) {
                    totalMs += diff;
                    validCount++;
                }
            }
        }

        return {
            tmr: validCount > 0 ? Math.round(totalMs / validCount / 1000) : 0,
            count: validCount,
        };
    }

    /** TMA — Tempo Médio de Atendimento (Average Handle Time) */
    static async getAverageHandleTime(from?: Date, to?: Date, tenantId?: string) {
        const dateFilter: any = {};
        if (from) dateFilter.gte = from;
        if (to) dateFilter.lte = to;

        const closedTickets = await prisma.ticket.findMany({
            where: {
                status: 'CLOSED',
                closedAt: { not: null },
                excludeFromReports: false,
                ...(from || to ? { createdAt: dateFilter } : {}),
                ...(tenantId ? { tenantId } : {}),
            },
            select: { createdAt: true, closedAt: true },
        });

        if (closedTickets.length === 0) return { tma: 0, count: 0 };

        let totalMs = 0;
        for (const t of closedTickets) {
            totalMs += new Date(t.closedAt!).getTime() - new Date(t.createdAt).getTime();
        }

        return {
            tma: Math.round(totalMs / closedTickets.length / 1000),
            count: closedTickets.length,
        };
    }

    /** Volume per Agent */
    static async getAgentVolume(from?: Date, to?: Date, tenantId?: string) {
        const dateFilter: any = {};
        if (from) dateFilter.gte = from;
        if (to) dateFilter.lte = to;

        const agents = await prisma.user.findMany({
            where: { role: { in: ['AGENT', 'ADMIN'] } },
            select: { id: true, name: true },
        });

        const result = await Promise.all(
            agents.map(async (agent) => {
                const closed = await prisma.ticket.count({
                    where: {
                        userId: agent.id,
                        status: 'CLOSED',
                        excludeFromReports: false,
                        ...(from || to ? { closedAt: dateFilter } : {}),
                        ...(tenantId ? { tenantId } : {}),
                    },
                });
                const open = await prisma.ticket.count({
                    where: {
                        userId: agent.id,
                        status: 'OPEN',
                        excludeFromReports: false,
                        ...(tenantId ? { tenantId } : {}),
                    },
                });
                return { agentId: agent.id, name: agent.name, closed, open };
            })
        );

        return result.filter(r => r.closed > 0 || r.open > 0);
    }

    /** Daily Volume */
    static async getDailyVolume(from?: Date, to?: Date, tenantId?: string) {
        const dateFilter: any = {};
        if (from) dateFilter.gte = from;
        if (to) dateFilter.lte = to;

        const tickets = await prisma.ticket.findMany({
            where: {
                excludeFromReports: false,
                ...(from || to ? { createdAt: dateFilter } : {}),
                ...(tenantId ? { tenantId } : {}),
            },
            select: { createdAt: true, status: true },
            orderBy: { createdAt: 'asc' },
        });

        const dailyMap: Record<string, { total: number; closed: number; open: number }> = {};

        for (const t of tickets) {
            const day = new Date(t.createdAt).toISOString().slice(0, 10);
            if (!dailyMap[day]) dailyMap[day] = { total: 0, closed: 0, open: 0 };
            dailyMap[day].total++;
            if (t.status === 'CLOSED') dailyMap[day].closed++;
            if (t.status === 'OPEN') dailyMap[day].open++;
        }

        return Object.entries(dailyMap).map(([date, counts]) => ({ date, ...counts }));
    }

    /** Summary — all key metrics in one call */
    static async getSummary(from?: Date, to?: Date, tenantId?: string) {
        const [tmrData, tmaData, agentVolume, dailyVolume] = await Promise.all([
            this.getAverageFirstResponseTime(from, to, tenantId),
            this.getAverageHandleTime(from, to, tenantId),
            this.getAgentVolume(from, to, tenantId),
            this.getDailyVolume(from, to, tenantId),
        ]);

        const dateFilter: any = {};
        if (from) dateFilter.gte = from;
        if (to) dateFilter.lte = to;

        const tenantFilter = tenantId ? { tenantId } : {};

        const [totalTickets, openTickets, queueTickets, onlineAgents] = await Promise.all([
            prisma.ticket.count({ where: { excludeFromReports: false, ...(from || to ? { createdAt: dateFilter } : {}), ...tenantFilter } }),
            prisma.ticket.count({ where: { status: 'OPEN', excludeFromReports: false, ...tenantFilter } }),
            prisma.ticket.count({ where: { status: 'QUEUE', excludeFromReports: false, ...tenantFilter } }),
            prisma.user.count({ where: { online: true } }),
        ]);

        return {
            tmr: tmrData.tmr,
            tma: tmaData.tma,
            totalTickets,
            openTickets,
            queueTickets,
            onlineAgents,
            agentVolume,
            dailyVolume,
        };
    }

    // ─── Extended Reports ─────────────────────────────────────

    /** Ticket volume grouped by Department */
    static async getDepartmentVolume(from?: Date, to?: Date, tenantId?: string) {
        const dateFilter: any = {};
        if (from) dateFilter.gte = from;
        if (to) dateFilter.lte = to;

        const groups = await prisma.ticket.groupBy({
            by: ['departmentId'],
            where: {
                excludeFromReports: false,
                ...(from || to ? { createdAt: dateFilter } : {}),
                ...(tenantId ? { tenantId } : {}),
            },
            _count: { _all: true },
        });

        const results = await Promise.all(
            groups.map(async (g) => {
                const dept = g.departmentId
                    ? await prisma.department.findUnique({ where: { id: g.departmentId }, select: { name: true } })
                    : null;
                return {
                    departmentId: g.departmentId || 'sem-setor',
                    name: dept?.name || 'Sem Secretaria',
                    count: g._count._all,
                };
            })
        );

        return results.sort((a, b) => b.count - a.count);
    }

    /** NPS overall summary: avg + distribution [1..10] */
    static async getNpsSummary(from?: Date, to?: Date, tenantId?: string) {
        const dateFilter: any = {};
        if (from) dateFilter.gte = from;
        if (to) dateFilter.lte = to;

        const ratings = await prisma.npsRating.findMany({
            where: {
                ...(from || to ? { createdAt: dateFilter } : {}),
                ...(tenantId ? { tenantId } : {}),
            },
            select: { score: true },
        });

        const total = ratings.length;
        const avg = total > 0
            ? Math.round((ratings.reduce((s, r) => s + r.score, 0) / total) * 10) / 10
            : null;

        const distribution: Record<number, number> = {};
        for (let i = 1; i <= 10; i++) distribution[i] = 0;
        for (const r of ratings) distribution[r.score] = (distribution[r.score] || 0) + 1;

        const promoters = (distribution[9] || 0) + (distribution[10] || 0);
        const detractors = [1, 2, 3, 4, 5, 6].reduce((s, n) => s + (distribution[n] || 0), 0);
        const npsScore = total > 0 ? Math.round(((promoters - detractors) / total) * 100) : null;

        return {
            total,
            avg,
            npsScore,
            distribution: Object.entries(distribution).map(([score, count]) => ({ score: Number(score), count })),
        };
    }

    /** Overview — ticket counts by status in the period */
    static async getOverview(from?: Date, to?: Date, tenantId?: string) {
        const dateFilter: any = {};
        if (from) dateFilter.gte = from;
        if (to) dateFilter.lte = to;
        const filter = {
            excludeFromReports: false,
            ...(from || to ? { createdAt: dateFilter } : {}),
            ...(tenantId ? { tenantId } : {}),
        };

        const [total, resolved, open, queue, bot] = await Promise.all([
            prisma.ticket.count({ where: filter }),
            prisma.ticket.count({ where: { ...filter, status: 'CLOSED' } }),
            prisma.ticket.count({ where: { ...filter, status: 'OPEN' } }),
            prisma.ticket.count({ where: { ...filter, status: 'QUEUE' } }),
            prisma.ticket.count({ where: { ...filter, status: 'BOT' } }),
        ]);

        return { total, resolved, open, queue, bot };
    }

    /** Export: raw ticket list for CSV download */
    static async exportTickets(from?: Date, to?: Date, tenantId?: string) {
        const dateFilter: any = {};
        if (from) dateFilter.gte = from;
        if (to) dateFilter.lte = to;

        const tickets = await prisma.ticket.findMany({
            where: {
                excludeFromReports: false,
                ...(from || to ? { createdAt: dateFilter } : {}),
                ...(tenantId ? { tenantId } : {}),
            },
            orderBy: { createdAt: 'desc' },
            select: {
                protocol: true,
                status: true,
                createdAt: true,
                closedAt: true,
                channel: true,
                contact: { select: { fullName: true, name: true, phone: true, cpf: true, email: true } },
                department: { select: { name: true } },
                user: { select: { name: true } },
                tags: { select: { tag: { select: { name: true } } } },
            },
        });

        return tickets.map((t) => ({
            'Protocolo': t.protocol,
            'Status': t.status,
            'Canal': t.channel,
            'Cidadão': t.contact?.fullName || t.contact?.name || 'Desconhecido',
            'CPF': t.contact?.cpf || '',
            'Telefone': t.contact?.phone || '',
            'Email': t.contact?.email || '',
            'Secretaria': t.department?.name || 'Sem Secretaria',
            'Atendente': t.user?.name || 'Sem Atendente',
            'Tags': t.tags?.map((tt: any) => tt.tag?.name).filter(Boolean).join(', ') || '',
            'Data Abertura': t.createdAt ? new Date(t.createdAt).toLocaleDateString('pt-BR') : '',
            'Data Fechamento': t.closedAt ? new Date(t.closedAt).toLocaleDateString('pt-BR') : '',
        }));
    }

    /** Contacts with pagination and optional tag filter */
    static async getContacts(page: number = 1, limit: number = 50, tagId?: string, tenantId?: string) {
        const skip = (page - 1) * limit;

        let contactIds: string[] | undefined;
        if (tagId) {
            const ticketTags = await prisma.ticketTag.findMany({
                where: { tagId },
                select: { ticket: { select: { contactId: true } } },
            });
            contactIds = [...new Set(ticketTags.map(tt => tt.ticket.contactId))];
        }

        const where = {
            ...(contactIds ? { id: { in: contactIds } } : {}),
            ...(tenantId ? { tenantId } : {}),
        };

        const [contacts, total] = await Promise.all([
            prisma.contact.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    _count: { select: { tickets: true } },
                },
            }),
            prisma.contact.count({ where }),
        ]);

        return { contacts, total, page, limit, totalPages: Math.ceil(total / limit) };
    }

    /** Contacts grouped by DDD → Brazilian state */
    static async getContactsByDDD(tenantId?: string) {
        const contacts = await prisma.contact.findMany({
            where: {
                ...(tenantId ? { tenantId } : {}),
            },
            select: { phone: true },
        });

        const stateCount: Record<string, number> = {};

        for (const c of contacts) {
            const ddd = extractDDD(c.phone);
            if (ddd) {
                const state = DDD_TO_STATE[ddd] || 'Outros';
                stateCount[state] = (stateCount[state] || 0) + 1;
            } else {
                stateCount['Outros'] = (stateCount['Outros'] || 0) + 1;
            }
        }

        return Object.entries(stateCount)
            .map(([state, count]) => ({
                state,
                stateName: STATE_NAMES[state] || state,
                count,
            }))
            .sort((a, b) => b.count - a.count);
    }

    /** NPS average per agent */
    static async getNpsPerAgent(from?: Date, to?: Date, tenantId?: string) {
        const dateFilter: any = {};
        if (from) dateFilter.gte = from;
        if (to) dateFilter.lte = to;

        const agents = await prisma.user.findMany({
            where: { role: { in: ['AGENT', 'ADMIN'] } },
            select: { id: true, name: true },
        });

        const result = await Promise.all(
            agents.map(async (agent) => {
                const ratings = await prisma.npsRating.findMany({
                    where: {
                        agentId: agent.id,
                        ...(from || to ? { createdAt: dateFilter } : {}),
                        ...(tenantId ? { tenantId } : {}),
                    },
                    select: { score: true },
                });

                const avg = ratings.length > 0
                    ? Math.round((ratings.reduce((sum, r) => sum + r.score, 0) / ratings.length) * 10) / 10
                    : null;

                return { agentId: agent.id, name: agent.name, avgScore: avg, totalRatings: ratings.length };
            })
        );

        return result.filter(r => r.totalRatings > 0);
    }

    /** NPS detailed log with pagination */
    static async getNpsLog(from?: Date, to?: Date, page: number = 1, limit: number = 50, tenantId?: string) {
        const skip = (page - 1) * limit;
        const dateFilter: any = {};
        if (from) dateFilter.gte = from;
        if (to) dateFilter.lte = to;

        const where = {
            ...(from || to ? { createdAt: dateFilter } : {}),
            ...(tenantId ? { tenantId } : {}),
        };

        const [ratings, total] = await Promise.all([
            prisma.npsRating.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
            }),
            prisma.npsRating.count({ where }),
        ]);

        const enriched = await Promise.all(
            ratings.map(async (r) => {
                const [contact, agent] = await Promise.all([
                    prisma.contact.findUnique({ where: { id: r.contactId }, select: { name: true, phone: true } }),
                    r.agentId ? prisma.user.findUnique({ where: { id: r.agentId }, select: { name: true } }) : null,
                ]);
                return {
                    ...r,
                    contactName: contact?.name || contact?.phone || 'Desconhecido',
                    agentName: agent?.name || 'N/A',
                };
            })
        );

        return { ratings: enriched, total, page, limit, totalPages: Math.ceil(total / limit) };
    }
}
