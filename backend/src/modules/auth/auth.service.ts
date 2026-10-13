import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../server';
import { sendPasswordResetEmail } from '../../lib/mailer';

// Simple in-memory login rate limiter (per email, 5 attempts per 15 min)
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(email: string): void {
    const now = Date.now();
    const entry = loginAttempts.get(email);
    if (entry) {
        if (now < entry.resetAt) {
            if (entry.count >= 5) {
                throw new Error('Muitas tentativas de login. Aguarde 15 minutos.');
            }
            entry.count++;
        } else {
            loginAttempts.set(email, { count: 1, resetAt: now + 15 * 60 * 1000 });
        }
    } else {
        loginAttempts.set(email, { count: 1, resetAt: now + 15 * 60 * 1000 });
    }
}

function clearRateLimit(email: string): void {
    loginAttempts.delete(email);
}

export class AuthService {
    static async login(email: string, password: string) {
        checkRateLimit(email);
        const user = await prisma.user.findUnique({
            where: { email },
            include: {
                tenant: { select: { id: true, name: true, isActive: true, logoUrl: true } },
                departments: { include: { department: { select: { id: true, name: true } } } },
            },
        });
        if (!user) {
            throw new Error('Credenciais inválidas');
        }

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            throw new Error('Credenciais inválidas');
        }

        // Verify tenant is active
        if (!user.tenant.isActive) {
            throw new Error('Sua organização está desativada. Contate o administrador.');
        }

        const token = jwt.sign(
            {
                id: user.id,
                role: user.role,
                email: user.email,
                isSuperAdmin: user.isSuperAdmin,
                tenantId: user.tenantId,
            },
            process.env.JWT_SECRET!,
            { expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as any }
        );

        // Update online status
        await prisma.user.update({
            where: { id: user.id },
            data: { online: true },
        });

        clearRateLimit(email);

        return {
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                isSuperAdmin: user.isSuperAdmin,
                tenantId: user.tenantId,
                tenantName: user.tenant.name,
                tenantLogoUrl: user.tenant.logoUrl,
                departments: user.departments.map((ud) => ({
                    departmentId: ud.departmentId,
                    name: ud.department.name,
                })),
            },
        };
    }

    static async register(name: string, email: string, password: string, role: 'ADMIN' | 'AGENT' = 'AGENT', tenantId?: string) {
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
            throw new Error('E-mail já cadastrado');
        }

        // Resolve tenant — use provided or find default
        let resolvedTenantId = tenantId;
        if (!resolvedTenantId) {
            const defaultTenant = await prisma.tenant.findFirst({ where: { isActive: true } });
            if (!defaultTenant) throw new Error('Nenhum tenant ativo encontrado. Crie um tenant primeiro.');
            resolvedTenantId = defaultTenant.id;
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const user = await prisma.user.create({
            data: { name, email, password: hashedPassword, role, tenantId: resolvedTenantId },
        });

        return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            tenantId: user.tenantId,
        };
    }

    static async forgotPassword(email: string) {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            // Don't reveal whether user exists
            return { message: 'Se o e-mail existir, um link de recuperação será enviado' };
        }

        const token = uuidv4();
        const expiresAt = new Date(Date.now() + 3600000); // 1 hour

        await prisma.passwordResetToken.create({
            data: { token, userId: user.id, expiresAt },
        });

        try {
            await sendPasswordResetEmail(email, token);
        } catch (err) {
            console.error('Failed to send reset email:', err);
        }

        return { message: 'Se o e-mail existir, um link de recuperação será enviado' };
    }

    static async resetPassword(token: string, newPassword: string) {
        const resetToken = await prisma.passwordResetToken.findUnique({
            where: { token },
        });

        if (!resetToken || resetToken.used || resetToken.expiresAt < new Date()) {
            throw new Error('Token inválido ou expirado');
        }

        const hashedPassword = await bcrypt.hash(newPassword, 12);

        await prisma.user.update({
            where: { id: resetToken.userId },
            data: { password: hashedPassword },
        });

        await prisma.passwordResetToken.update({
            where: { id: resetToken.id },
            data: { used: true },
        });

        return { message: 'Senha redefinida com sucesso' };
    }

    static async logout(userId: string) {
        await prisma.user.update({
            where: { id: userId },
            data: { online: false },
        });
        return { message: 'Logout realizado' };
    }

    /**
     * Get user profile with tenant info — used by /me endpoint
     */
    static async getProfile(userId: string) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                tenant: { select: { id: true, name: true, logoUrl: true } },
                departments: { include: { department: { select: { id: true, name: true } } } },
            },
        });
        if (!user) return null;

        return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            online: user.online,
            isSuperAdmin: user.isSuperAdmin,
            tenantId: user.tenantId,
            tenantName: user.tenant.name,
            tenantLogoUrl: user.tenant.logoUrl,
            departments: user.departments.map((ud) => ({
                departmentId: ud.departmentId,
                name: ud.department.name,
            })),
        };
    }
}
