import { prisma } from '../../server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { sendWelcomeEmail } from '../../lib/mailer';

export class UsersService {
    static async findAll(tenantId?: string) {
        return prisma.user.findMany({
            where: tenantId ? { tenantId } : undefined,
            select: {
                id: true, name: true, email: true, role: true, online: true,
                createdAt: true, updatedAt: true,
                departments: {
                    include: { department: { select: { id: true, name: true } } },
                },
                tenant: { select: { id: true, name: true } }
            },
            orderBy: { name: 'asc' },
        });
    }

    static async findById(id: string) {
        return prisma.user.findUnique({
            where: { id },
            select: {
                id: true, name: true, email: true, role: true, online: true,
                createdAt: true, updatedAt: true,
                departments: {
                    include: { department: { select: { id: true, name: true } } },
                },
                tenant: { select: { id: true, name: true } }
            },
        });
    }

    static generateRandomPassword(length = 12): string {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
        const bytes = crypto.randomBytes(length);
        return Array.from(bytes, (b) => chars[b % chars.length]).join('');
    }

    static async create(data: { name: string; email: string; password?: string; role?: 'ADMIN' | 'AGENT'; departmentIds?: string[]; tenantId: string }) {
        // Generate random password if not provided or empty
        const rawPassword = data.password?.trim() || this.generateRandomPassword();
        const wasGenerated = !data.password?.trim();

        const hashedPassword = await bcrypt.hash(rawPassword, 12);
        const user = await prisma.user.create({
            data: {
                name: data.name,
                email: data.email,
                password: hashedPassword,
                role: data.role || 'AGENT',
                tenantId: data.tenantId,
                departments: data.departmentIds
                    ? { create: data.departmentIds.map(dId => ({ departmentId: dId })) }
                    : undefined,
            },
            select: {
                id: true, name: true, email: true, role: true, online: true,
                departments: {
                    include: { department: { select: { id: true, name: true } } },
                },
            },
        });

        // Send welcome email with credentials
        try {
            await sendWelcomeEmail(data.email, data.name, rawPassword, wasGenerated);
        } catch (err) {
            console.error('Failed to send welcome email:', err);
        }

        return user;
    }

    static async update(id: string, data: { name?: string; email?: string; password?: string; role?: 'ADMIN' | 'AGENT'; departmentIds?: string[] }) {
        const updateData: any = {};
        if (data.name) updateData.name = data.name;
        if (data.email) updateData.email = data.email;
        if (data.role) updateData.role = data.role;
        if (data.password) updateData.password = await bcrypt.hash(data.password, 12);

        // Update departments if provided
        if (data.departmentIds !== undefined) {
            // Delete existing relations
            await prisma.userDepartment.deleteMany({ where: { userId: id } });
            // Create new ones
            if (data.departmentIds.length > 0) {
                await prisma.userDepartment.createMany({
                    data: data.departmentIds.map(dId => ({ userId: id, departmentId: dId })),
                });
            }
        }

        return prisma.user.update({
            where: { id },
            data: updateData,
            select: {
                id: true, name: true, email: true, role: true, online: true,
                departments: {
                    include: { department: { select: { id: true, name: true } } },
                },
            },
        });
    }

    static async delete(id: string) {
        return prisma.user.delete({ where: { id } });
    }
}
