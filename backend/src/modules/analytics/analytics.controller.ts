import { Router, Request, Response } from 'express';
import { AnalyticsService } from './analytics.service';
import { requireAuth, requireAdmin, AuthRequest } from '../auth/auth.middleware';

const router = Router();

function parseDateParams(req: Request) {
    const from = req.query.from ? new Date(req.query.from as string) : undefined;
    const to = req.query.to ? new Date(req.query.to as string) : undefined;
    return { from, to };
}

// GET /api/analytics/summary — full dashboard data
router.get('/summary', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
        const { from, to } = parseDateParams(req);
        const summary = await AnalyticsService.getSummary(from, to, (req as AuthRequest).tenantId);
        res.json(summary);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/analytics/overview — ticket counts by status in period
router.get('/overview', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
        const { from, to } = parseDateParams(req);
        const data = await AnalyticsService.getOverview(from, to, (req as AuthRequest).tenantId);
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/analytics/department-volume — tickets grouped by secretaria
router.get('/department-volume', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
        const { from, to } = parseDateParams(req);
        const data = await AnalyticsService.getDepartmentVolume(from, to, (req as AuthRequest).tenantId);
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/analytics/nps-summary — overall NPS average + distribution
router.get('/nps-summary', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
        const { from, to } = parseDateParams(req);
        const data = await AnalyticsService.getNpsSummary(from, to, (req as AuthRequest).tenantId);
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/analytics/tmr
router.get('/tmr', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
        const { from, to } = parseDateParams(req);
        const data = await AnalyticsService.getAverageFirstResponseTime(from, to, (req as AuthRequest).tenantId);
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/analytics/tma
router.get('/tma', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
        const { from, to } = parseDateParams(req);
        const data = await AnalyticsService.getAverageHandleTime(from, to, (req as AuthRequest).tenantId);
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/analytics/agent-volume
router.get('/agent-volume', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
        const { from, to } = parseDateParams(req);
        const data = await AnalyticsService.getAgentVolume(from, to, (req as AuthRequest).tenantId);
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/analytics/daily-volume
router.get('/daily-volume', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
        const { from, to } = parseDateParams(req);
        const data = await AnalyticsService.getDailyVolume(from, to, (req as AuthRequest).tenantId);
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/analytics/export — CSV download of all tickets in period
router.get('/export', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
        const { from, to } = parseDateParams(req);
        const rows = await AnalyticsService.exportTickets(from, to, (req as AuthRequest).tenantId);

        if (rows.length === 0) {
            res.status(404).json({ error: 'Nenhum dado encontrado para exportação.' });
            return;
        }

        const headers = Object.keys(rows[0]);
        const csvLines = [
            headers.join(';'),
            ...rows.map(row =>
                headers.map(h => {
                    const val = (row as any)[h] ?? '';
                    const str = String(val).replace(/"/g, '""');
                    return str.includes(';') || str.includes('\n') ? `"${str}"` : str;
                }).join(';')
            ),
        ];
        const csv = '\uFEFF' + csvLines.join('\r\n'); // BOM for Excel UTF-8

        const filename = `relatorio_${new Date().toISOString().slice(0, 10)}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csv);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/analytics/contacts — paginated contacts with optional tag filter
router.get('/contacts', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const tagId = req.query.tagId as string | undefined;
        const data = await AnalyticsService.getContacts(page, limit, tagId, (req as AuthRequest).tenantId);
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/analytics/contacts-by-ddd — contacts grouped by DDD/state
router.get('/contacts-by-ddd', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
        const data = await AnalyticsService.getContactsByDDD((req as AuthRequest).tenantId);
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/analytics/nps-per-agent
router.get('/nps-per-agent', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
        const { from, to } = parseDateParams(req);
        const data = await AnalyticsService.getNpsPerAgent(from, to, (req as AuthRequest).tenantId);
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/analytics/nps-log — detailed NPS log
router.get('/nps-log', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
        const { from, to } = parseDateParams(req);
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const data = await AnalyticsService.getNpsLog(from, to, page, limit, (req as AuthRequest).tenantId);
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
