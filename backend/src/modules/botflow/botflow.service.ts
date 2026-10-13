import { prisma } from '../../server';
import { tenantStorage } from '../../lib/db';

function currentTenantId(): string | undefined {
    try { return tenantStorage.getStore()?.tenantId; } catch { return undefined; }
}

export class BotFlowService {
    static async findAll() {
        const tenantId = currentTenantId();
        const flows = await prisma.botFlow.findMany({
            where: tenantId ? { tenantId } : undefined,
            orderBy: { updatedAt: 'desc' },
        });
        return flows.map(this.parseFlow);
    }

    static async findById(id: string) {
        const tenantId = currentTenantId();
        const flow = await prisma.botFlow.findFirst({
            where: tenantId ? { id, tenantId } : { id },
        });
        return flow ? this.parseFlow(flow) : null;
    }

    static async findActive(tenantId?: string) {
        const tid = tenantId ?? currentTenantId();
        const flow = await prisma.botFlow.findFirst({
            where: { isActive: true, ...(tid ? { tenantId: tid } : {}) },
        });
        return flow ? this.parseFlow(flow) : null;
    }

    static async create(data: { name: string; nodes?: any; edges?: any; globalConfig?: any; tenantId: string }) {
        // Pre-initialize with Start Node + Welcome Message if no nodes provided
        const defaultNodes = [
            {
                id: 'start-1',
                type: 'start',
                position: { x: 250, y: 50 },
                data: { label: 'Início', isStart: true },
            },
            {
                id: 'msg-welcome',
                type: 'message',
                position: { x: 250, y: 200 },
                data: { label: 'Mensagem de Boas-Vindas', message: '' },
            },
        ];
        const defaultEdges = [
            {
                id: 'edge-start-welcome',
                source: 'start-1',
                target: 'msg-welcome',
                type: 'smoothstep',
            },
        ];

        const nodes = data.nodes && data.nodes.length > 0 ? data.nodes : defaultNodes;
        const edges = data.edges && data.edges.length > 0 ? data.edges : defaultEdges;

        const flow = await prisma.botFlow.create({
            data: {
                name: data.name,
                nodes: JSON.stringify(nodes),
                edges: JSON.stringify(edges),
                globalConfig: JSON.stringify(data.globalConfig || {}),
                tenantId: data.tenantId,
            },
        });
        return this.parseFlow(flow);
    }

    static async update(id: string, data: { name?: string; nodes?: any; edges?: any; globalConfig?: any; isActive?: boolean }) {
        // If activating, deactivate all others first
        if (data.isActive) {
            await prisma.botFlow.updateMany({
                where: { isActive: true },
                data: { isActive: false },
            });
        }

        const updateData: any = {};
        if (data.name !== undefined) updateData.name = data.name;
        if (data.isActive !== undefined) updateData.isActive = data.isActive;
        if (data.nodes !== undefined) updateData.nodes = JSON.stringify(data.nodes);
        if (data.edges !== undefined) updateData.edges = JSON.stringify(data.edges);
        if (data.globalConfig !== undefined) updateData.globalConfig = JSON.stringify(data.globalConfig);

        const flow = await prisma.botFlow.update({
            where: { id },
            data: updateData,
        });
        return this.parseFlow(flow);
    }

    static async delete(id: string) {
        return prisma.botFlow.delete({ where: { id } });
    }

    /** Parse JSON string fields back into objects */
    private static parseFlow(flow: any) {
        return {
            ...flow,
            nodes: typeof flow.nodes === 'string' ? JSON.parse(flow.nodes) : flow.nodes,
            edges: typeof flow.edges === 'string' ? JSON.parse(flow.edges) : flow.edges,
            globalConfig: typeof flow.globalConfig === 'string' ? JSON.parse(flow.globalConfig) : flow.globalConfig,
        };
    }
}
