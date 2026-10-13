import { Router } from 'express';
import { AuthService } from './auth.service';
import { requireAuth, AuthRequest } from './auth.middleware';
import { AuditService } from '../audit/audit.service';


const router = Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'E-mail e senha são obrigatórios' });
        }
        const result = await AuthService.login(email, password);
        // Audit successful login
        AuditService.log({
            userId: result.user.id,
            userName: result.user.name,
            action: 'LOGIN',
            entity: 'User',
            entityId: result.user.id,
            req,
        });
        res.json(result);
    } catch (error: any) {
        // Audit failed login attempt
        AuditService.log({
            action: 'LOGIN_FAILED',
            entity: 'User',
            newValue: { email: req.body.email },
            req,
        });
        res.status(401).json({ error: error.message });
    }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios' });
        }
        const user = await AuthService.register(name, email, password, role);
        res.status(201).json(user);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ error: 'E-mail é obrigatório' });
        }
        const result = await AuthService.forgotPassword(email);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: 'Erro interno' });
    }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
    try {
        const { token, password } = req.body;
        if (!token || !password) {
            return res.status(400).json({ error: 'Token e nova senha são obrigatórios' });
        }
        const result = await AuthService.resetPassword(token, password);
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// POST /api/auth/logout
router.post('/logout', requireAuth, async (req: AuthRequest, res) => {
    try {
        await AuthService.logout(req.userId!);
        AuditService.log({ userId: req.userId, action: 'LOGOUT', entity: 'User', entityId: req.userId, req });
        res.json({ message: 'Logout realizado' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req: AuthRequest, res) => {
    try {
        const profile = await AuthService.getProfile(req.userId!);
        if (!profile) return res.status(404).json({ error: 'Usuário não encontrado' });
        res.json(profile);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
