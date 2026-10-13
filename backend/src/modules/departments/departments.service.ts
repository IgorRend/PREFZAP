import { prisma } from '../../server';

export class DepartmentsService {
    static async findAll(tenantId?: string) {
        return prisma.department.findMany({
            where: tenantId ? { tenantId } : undefined,
            include: {
                users: {
                    include: { user: { select: { id: true, name: true, email: true, role: true, online: true } } },
                },
                _count: { select: { tickets: true } },
                tenant: { select: { id: true, name: true } }
            },
            orderBy: { name: 'asc' },
        });
    }

    static async findById(id: string) {
        return prisma.department.findUnique({
            where: { id },
            include: {
                users: {
                    include: { user: { select: { id: true, name: true, email: true, role: true, online: true } } },
                },
                _count: { select: { tickets: true } },
                tenant: { select: { id: true, name: true } }
            },
        });
    }

    static async create(data: { name: string; userIds?: string[]; tenantId: string }) {
        return prisma.department.create({
            data: {
                name: data.name,
                tenantId: data.tenantId,
                users: data.userIds
                    ? { create: data.userIds.map(uId => ({ userId: uId })) }
                    : undefined,
            },
            include: {
                users: {
                    include: { user: { select: { id: true, name: true, email: true } } },
                },
            },
        });
    }

    static async update(id: string, data: { name?: string; userIds?: string[] }) {
        if (data.userIds !== undefined) {
            await prisma.userDepartment.deleteMany({ where: { departmentId: id } });
            if (data.userIds.length > 0) {
                await prisma.userDepartment.createMany({
                    data: data.userIds.map(uId => ({ userId: uId, departmentId: id })),
                });
            }
        }

        return prisma.department.update({
            where: { id },
            data: data.name ? { name: data.name } : {},
            include: {
                users: {
                    include: { user: { select: { id: true, name: true, email: true } } },
                },
            },
        });
    }

    static async delete(id: string) {
        return prisma.department.delete({ where: { id } });
    }
}
