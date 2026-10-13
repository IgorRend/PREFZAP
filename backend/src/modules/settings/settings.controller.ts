import { Router } from 'express';
import { SettingsService } from './settings.service';
import { requireAuth, requireAdmin, AuthRequest } from '../auth/auth.middleware';

const router = Router();

// GET /api/settings
router.get('/', requireAuth, async (req: AuthRequest, res) => {
    try {
        const settings = await SettingsService.get(req.tenantId);
        res.json(settings);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/settings — Admin only
router.put('/', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
        const {
            allowPaidTemplates, autoRenewWindowPrompt, enforce24hWindow,
            businessHoursMode, businessHoursJson, awayMessage, timezone,
            npsEnabled, npsMessage, npsExpirationHours,
            autoCloseMinutes, slaAlertMinutes, rejectCalls, rejectCallMessage,
            activeBotFlowId,
        } = req.body;

        const settings = await SettingsService.update(req.tenantId!, {
            allowPaidTemplates, autoRenewWindowPrompt, enforce24hWindow,
            businessHoursMode, businessHoursJson, awayMessage, timezone,
            npsEnabled, npsMessage, npsExpirationHours,
            autoCloseMinutes, slaAlertMinutes, rejectCalls, rejectCallMessage,
            activeBotFlowId,
        });
        res.json(settings);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

export default router;
