import { PrismaClient } from '@prisma/client';
import { AsyncLocalStorage } from 'async_hooks';

export const globalPrisma = new PrismaClient();
export const tenantStorage = new AsyncLocalStorage<{ tenantId: string; prisma: any }>();

export const prisma = new Proxy(globalPrisma, {
    get(target, prop) {
        const store = tenantStorage.getStore();
        if (store && store.prisma) {
            const val = (store.prisma as any)[prop];
            if (typeof val === 'function') {
                return val.bind(store.prisma);
            }
            return val;
        }
        const val = (target as any)[prop];
        if (typeof val === 'function') {
            return val.bind(target);
        }
        return val;
    }
}) as unknown as PrismaClient;
