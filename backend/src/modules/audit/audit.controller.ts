import { Router } from 'express';
import { AuditService } from './audit.service';
import { requireAuth, requireAdmin } from '../auth/auth.middleware';

const router = Router();

// GET /api/audit — Paginated list, admin only
router.get('/', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { entity, action, userId, from, to, page, limit } = req.query;
        const result = await AuditService.findAll({
            entity: entity as string | undefined,
            action: action as string | undefined,
            userId: userId as string | undefined,
            from: from as string | undefined,
            to: to as string | undefined,
            page: page ? parseInt(page as string) : 1,
            limit: limit ? parseInt(limit as string) : 50,
        });
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
