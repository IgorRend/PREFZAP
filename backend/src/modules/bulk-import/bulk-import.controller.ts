import { Router } from 'express';
import multer from 'multer';
import { BulkImportService } from './bulk-import.service';
import { requireAuth, requireAdmin, AuthRequest } from '../auth/auth.middleware';

const router = Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max for CSV
    fileFilter: (_req, file, cb) => {
        const allowed = ['.csv', '.txt'];
        const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
        if (allowed.includes(ext) || file.mimetype === 'text/csv' || file.mimetype === 'text/plain') {
            cb(null, true);
        } else {
            cb(new Error('Apenas arquivos CSV são permitidos'));
        }
    },
});

// GET /api/bulk-import/template — Download CSV template
router.get('/template', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
        const csv = BulkImportService.generateTemplate(req.isSuperAdmin);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="template_importacao.csv"');
        // Add BOM for Excel compatibility
        res.send('\uFEFF' + csv);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/bulk-import/upload — Process CSV import
router.post('/upload', requireAuth, requireAdmin, upload.single('file'), async (req: AuthRequest, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

        const contextTenantId = req.isSuperAdmin ? (req.body.tenantId || undefined) : req.tenantId!;
        const result = await BulkImportService.processImport(req.file.buffer, contextTenantId, req.isSuperAdmin || false);
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

export default router;
