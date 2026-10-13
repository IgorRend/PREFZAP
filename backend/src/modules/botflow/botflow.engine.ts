import { prisma } from '../../server';
import { MessagesService } from '../messages/messages.service';
import { TicketsService } from '../tickets/tickets.service';
import { RoutingService } from '../routing/routing.service';

// ─── BotNode data: extend with new message type fields ───────────
// Message nodes can now set:
//   nodeType: 'message' | 'httpRequest'
//   messageType: 'text' | 'media' | 'link' | 'reaction'
//   For media: mediaType, mediaUrl, filename, caption
//   For link: linkUrl, linkTitle, linkDescription, linkImg
//   For reaction: reactionEmoji (requires targetMessageId from variables)

type AutoDistribute = 'NONE' | 'BALANCE' | 'RANDOM';

interface BotNode {
    id: string;
    type: string;
    position: { x: number; y: number };
    data: {
        label: string;
        message?: string;
        isStart?: boolean;
        conditions?: BotCondition[];
        // HTTP node fields
        nodeType?: 'message' | 'httpRequest';
        // Extended message type: 'text' | 'media' | 'link' | 'reaction' | 'buttons' | 'list' (default 'text')
        messageType?: 'text' | 'media' | 'link' | 'reaction' | 'buttons' | 'list';
        // Media fields
        mediaType?: 'document' | 'image' | 'video' | 'audio';
        mediaUrl?: string;
        filename?: string;
        caption?: string;
        // Link fields
        linkUrl?: string;
        linkTitle?: string;
        linkDescription?: string;
        linkImg?: string;
        // Reaction field
        reactionEmoji?: string;
        // Target message ID for reaction (can use {{variable}})
        targetMessageId?: string;
        // Buttons / List fields
        buttons?: Array<{ id: string; text: string; type?: 'quick_reply' | 'url'; url?: string }>;
        buttonText?: string;
        listSections?: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>;
        httpMethod?: string;     // GET | POST | PUT | PATCH | DELETE
        httpUrl?: string;        // supports {{variable}} placeholders
        httpHeaders?: string;    // JSON string: {"Authorization": "Bearer {{token}}"}
        httpBody?: string;       // JSON string or text body (POST/PUT)
        httpVariableMap?: string; // JSON: {"contactVar": "response.path"} — maps JSON paths from response to contact variables
        httpSuccessMessage?: string; // message sent after successful call (can use {{variable}})
        httpErrorMessage?: string;   // message sent on failure
    };
}

interface BotCondition {
    id: string;
    matchType: 'specific' | 'any' | 'mask';
    values?: string; // comma-separated for specific, regex for mask
    action: 'step' | 'department' | 'user' | 'flow';
    targetId: string; // node ID, department ID, user ID, or flow ID
}

interface BotEdge {
    id: string;
    source: string;
    target: string;
}

interface GlobalConfig {
    greetingMessage?: string;
    invalidResponseMessage?: string;
    timeoutMinutes?: number;
    timeoutAction?: 'close' | 'route';
    timeoutTargetType?: 'department' | 'user';
    timeoutTargetId?: string;
    maxRetries?: number;
    maxRetriesAction?: 'route';
    maxRetriesTargetType?: 'department' | 'user';
    maxRetriesTargetId?: string;
    autoDistribute?: AutoDistribute;
}

// Track retry counts in memory (per ticket)
const retryCountMap = new Map<string, number>();

export class BotFlowEngine {
    /**
     * Process an incoming message through the bot flow.
     * Returns true if the bot handled the message, false if no active flow.
     */
    static async processMessage(ticketId: string, incomingText: string, buttonId?: string): Promise<boolean> {
        const ticket = await prisma.ticket.findUnique({
            where: { id: ticketId },
        });

        if (!ticket || ticket.status !== 'BOT' || !ticket.botFlowId) {
            return false;
        }

        const botFlow = await prisma.botFlow.findUnique({
            where: { id: ticket.botFlowId },
        });

        if (!botFlow) return false;

        const nodes = (typeof botFlow.nodes === 'string' ? JSON.parse(botFlow.nodes) : botFlow.nodes) as BotNode[];
        const edges = (typeof botFlow.edges === 'string' ? JSON.parse(botFlow.edges) : botFlow.edges) as BotEdge[];
        const globalConfig = (typeof botFlow.globalConfig === 'string' ? JSON.parse(botFlow.globalConfig) : botFlow.globalConfig) as GlobalConfig;

        // Find current node
        const currentNode = nodes.find(n => n.id === ticket.currentNodeId);
        if (!currentNode) {
            // No current node, start from first
            const startNode = nodes.find(n => n.data?.isStart) || nodes[0];
            if (startNode) {
                await this.executeNode(ticketId, startNode, globalConfig, edges, nodes);
            }
            return true;
        }

        // We're at a node that already sent its message. Now evaluate conditions against the user's response.
        const conditions = currentNode.data?.conditions || [];

        if (conditions.length === 0) {
            // No conditions, just look for next connected node via edges
            const nextEdge = edges.find(e => e.source === currentNode.id);
            if (nextEdge) {
                const nextNode = nodes.find(n => n.id === nextEdge.target);
                if (nextNode) {
                    await this.executeNode(ticketId, nextNode, globalConfig, edges, nodes);
                    return true;
                }
            }
            // No next node, end bot
            await this.endBot(ticketId, globalConfig);
            return true;
        }

        // Evaluate conditions
        for (const condition of conditions) {
            const matched = this.matchCondition(condition, incomingText, buttonId);
            if (matched) {
                // Reset retry counter
                retryCountMap.delete(ticketId);

                await this.executeAction(ticketId, condition, nodes, edges, globalConfig);
                return true;
            }
        }

        // No condition matched - handle invalid response
        const retries = (retryCountMap.get(ticketId) || 0) + 1;
        retryCountMap.set(ticketId, retries);

        const maxRetries = globalConfig.maxRetries || 3;

        if (retries >= maxRetries) {
            // Max retries exceeded
            retryCountMap.delete(ticketId);

            if (globalConfig.maxRetriesTargetType && globalConfig.maxRetriesTargetId) {
                await this.routeOut(
                    ticketId,
                    globalConfig.maxRetriesTargetType,
                    globalConfig.maxRetriesTargetId,
                    globalConfig
                );
            } else {
                await this.endBot(ticketId, globalConfig);
            }
            return true;
        }

        // Send invalid response message
        const invalidMsg = globalConfig.invalidResponseMessage || 'Desculpe, não entendi sua resposta. Tente novamente.';
        await MessagesService.sendBotMessage(ticketId, invalidMsg);
        return true;
    }

    /**
     * Execute a node: send its message, then wait for reply.
     * For httpRequest nodes: call external URL, map variables, auto-advance.
     */
    static async executeNode(ticketId: string, node: BotNode, globalConfig: GlobalConfig, edges?: BotEdge[], allNodes?: BotNode[]) {
        // ─── HTTP Request Node ────────────────────────────────
        if (node.data?.nodeType === 'httpRequest') {
            await this.executeHttpNode(ticketId, node, globalConfig, edges || [], allNodes || []);
            return;
        }

        // ─── Standard Message Node ────────────────────────────
        const msgType = node.data?.messageType || 'text';

        if (node.data?.message || msgType === 'buttons' || msgType === 'list') {
            const contact = await prisma.contact.findFirst({
                where: { tickets: { some: { id: ticketId } } },
            });
            const interpolate = (str: string) => {
                if (!contact) return str;
                let vars: Record<string, string> = {};
                try { vars = JSON.parse(contact.variables || '{}'); } catch {}
                return str.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
            };

            switch (msgType) {
                case 'text':
                    await MessagesService.sendBotMessage(ticketId, node.data.message || '');
                    break;

                case 'media':
                    await MessagesService.sendMessage({
                        ticketId,
                        type: 'media',
                        mediaType: node.data.mediaType || 'image',
                        urlOrBase64: interpolate(node.data.mediaUrl || node.data.message || ''),
                        filename: node.data.filename || 'file',
                        caption: node.data.caption ? interpolate(node.data.caption) : undefined,
                        origin: 'BOT',
                    });
                    break;

                case 'link':
                    await MessagesService.sendMessage({
                        ticketId,
                        type: 'link',
                        url: interpolate(node.data.linkUrl || ''),
                        text: interpolate(node.data.message || ''),
                        title: interpolate(node.data.linkTitle || ''),
                        description: interpolate(node.data.linkDescription || ''),
                        imgUrl: node.data.linkImg ? interpolate(node.data.linkImg) : undefined,
                        origin: 'BOT',
                    });
                    break;

                case 'reaction': {
                    const targetMsgId = interpolate(node.data.targetMessageId || '');
                    if (targetMsgId) {
                        await MessagesService.sendMessage({
                            ticketId,
                            type: 'reaction',
                            messageId: targetMsgId,
                            emoji: node.data.reactionEmoji || '👍',
                        });
                    }
                    break;
                }

                case 'buttons': {
                    let buttonsList: Array<{ id: string; text: string; type?: 'quick_reply' | 'url'; url?: string }> = [];
                    if (Array.isArray((node.data as any).buttons)) {
                        buttonsList = (node.data as any).buttons.map((btn: any) => ({
                            id: interpolate(btn.id || btn.text || ''),
                            text: interpolate(btn.text || btn.id || ''),
                            type: btn.type || 'quick_reply',
                            url: btn.url ? interpolate(btn.url) : undefined
                        }));
                    } else if (typeof (node.data as any).buttons === 'string') {
                        try {
                            const parsed = JSON.parse((node.data as any).buttons);
                            if (Array.isArray(parsed)) {
                                buttonsList = parsed.map((btn: any) => ({
                                    id: interpolate(btn.id || btn.text || ''),
                                    text: interpolate(btn.text || btn.id || ''),
                                    type: btn.type || 'quick_reply',
                                    url: btn.url ? interpolate(btn.url) : undefined
                                }));
                            }
                        } catch {
                            const items = ((node.data as any).buttons as string).split(',').map(s => s.trim()).filter(Boolean);
                            buttonsList = items.map((item, idx) => ({
                                id: `btn-${idx}`,
                                text: interpolate(item),
                                type: 'quick_reply'
                            }));
                        }
                    }

                    await MessagesService.sendMessage({
                        ticketId,
                        type: 'buttons',
                        body: interpolate(node.data.message || ''),
                        buttons: buttonsList,
                        title: (node.data as any).title ? interpolate((node.data as any).title) : undefined,
                        footer: (node.data as any).footer ? interpolate((node.data as any).footer) : undefined,
                        origin: 'BOT'
                    });
                    break;
                }

                case 'list': {
                    let sectionsList: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }> = [];
                    if (Array.isArray((node.data as any).listSections)) {
                        sectionsList = (node.data as any).listSections.map((sec: any) => ({
                            title: interpolate(sec.title || ''),
                            rows: Array.isArray(sec.rows) ? sec.rows.map((row: any) => ({
                                id: interpolate(row.id || row.title || ''),
                                title: interpolate(row.title || row.id || ''),
                                description: row.description ? interpolate(row.description) : undefined
                            })) : []
                        }));
                    } else if (typeof (node.data as any).listSections === 'string') {
                        try {
                            const parsed = JSON.parse((node.data as any).listSections);
                            if (Array.isArray(parsed)) {
                                sectionsList = parsed.map((sec: any) => ({
                                    title: interpolate(sec.title || ''),
                                    rows: Array.isArray(sec.rows) ? sec.rows.map((row: any) => ({
                                        id: interpolate(row.id || row.title || ''),
                                        title: interpolate(row.title || row.id || ''),
                                        description: row.description ? interpolate(row.description) : undefined
                                    })) : []
                                }));
                            }
                        } catch {}
                    }

                    if (sectionsList.length === 0) {
                        sectionsList = [{
                            title: 'Opções',
                            rows: []
                        }];
                    }

                    await MessagesService.sendMessage({
                        ticketId,
                        type: 'list',
                        body: interpolate(node.data.message || ''),
                        buttonText: (node.data as any).buttonText ? interpolate((node.data as any).buttonText) : 'Opções',
                        sections: sectionsList,
                        title: (node.data as any).title ? interpolate((node.data as any).title) : undefined,
                        footer: (node.data as any).footer ? interpolate((node.data as any).footer) : undefined,
                        origin: 'BOT'
                    });
                    break;
                }
            }
        }
        await TicketsService.updateBotPosition(ticketId, node.id);
    }

    /**
     * Execute an HTTP Request node:
     * 1. Interpolate {{variable}} placeholders from contact.variables
     * 2. Make the HTTP call
     * 3. Map response fields to contact.variables (httpVariableMap)
     * 4. Send success/error message
     * 5. Auto-advance to the next node via edges (no user input needed)
     */
    static async executeHttpNode(ticketId: string, node: BotNode, globalConfig: GlobalConfig, edges: BotEdge[], allNodes: BotNode[]) {
        // Load contact variables for interpolation
        const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, include: { contact: true } });
        if (!ticket) return;

        let contactVars: Record<string, string> = {};
        try { contactVars = JSON.parse(ticket.contact.variables || '{}'); } catch { }

        const interpolate = (str: string) =>
            str.replace(/\{\{(\w+)\}\}/g, (_, key) => contactVars[key] ?? '');

        const url = interpolate(node.data.httpUrl || '');
        const method = (node.data.httpMethod || 'GET').toUpperCase();

        let headers: Record<string, string> = { 'Content-Type': 'application/json' };
        try { headers = { ...headers, ...JSON.parse(interpolate(node.data.httpHeaders || '{}')) }; } catch { }

        let body: string | undefined;
        if (['POST', 'PUT', 'PATCH'].includes(method) && node.data.httpBody) {
            body = interpolate(node.data.httpBody);
        }

        let responseData: any = null;
        let success = false;

        try {
            if (!url) throw new Error('URL não configurada');

            const nativeFetch = globalThis.fetch ?? (await import('https' as any).then(() => fetch));
            const resp = await nativeFetch(url, {
                method,
                headers,
                body,
                signal: AbortSignal.timeout(15000), // 15s timeout
            } as any);

            const text = await resp.text();
            try { responseData = JSON.parse(text); } catch { responseData = { _raw: text }; }

            success = resp.ok;
            console.log(`[BotFlow HTTP] ${method} ${url} → ${resp.status}`);
        } catch (err: any) {
            console.error(`[BotFlow HTTP] Request failed:`, err.message);
        }

        // ─── Map response to contact variables ────────────────
        if (responseData) {
            let varMap: Record<string, string> = {};
            try { varMap = JSON.parse(node.data.httpVariableMap || '{}'); } catch { }

            const getNestedValue = (obj: any, path: string): string => {
                if (!path) return '';
                return path.split('.').reduce((acc, key) => acc?.[key], obj) ?? '';
            };

            const updatedVars = { ...contactVars };
            for (const [contactKey, responsePath] of Object.entries(varMap)) {
                updatedVars[contactKey] = String(getNestedValue(responseData, responsePath));
            }

            if (JSON.stringify(updatedVars) !== JSON.stringify(contactVars)) {
                await prisma.contact.update({
                    where: { id: ticket.contactId },
                    data: { variables: JSON.stringify(updatedVars) },
                });
                contactVars = updatedVars;
            }
        }

        // ─── Send outcome message ─────────────────────────────
        const msgTemplate = success
            ? (node.data.httpSuccessMessage || '')
            : (node.data.httpErrorMessage || 'Erro ao consultar serviço externo.');

        if (msgTemplate) {
            await MessagesService.sendBotMessage(ticketId, msgTemplate.replace(/\{\{(\w+)\}\}/g, (_, k) => contactVars[k] ?? ''));
        }

        // ─── Auto-advance: find next node via edge ────────────
        await TicketsService.updateBotPosition(ticketId, node.id);

        if (success) {
            const nextEdge = edges.find(e => e.source === node.id);
            const nextNode = nextEdge ? allNodes.find(n => n.id === nextEdge.target) : null;
            if (nextNode) {
                await this.executeNode(ticketId, nextNode, globalConfig, edges, allNodes);
            }
        }
    }

    /**
     * Match a condition against user input.
     */
    static matchCondition(condition: BotCondition, input: string, buttonId?: string): boolean {
        const normalizedInput = input.trim().toLowerCase();
        const normalizedButtonId = buttonId?.trim().toLowerCase();

        switch (condition.matchType) {
            case 'specific': {
                if (!condition.values) return false;
                const options = condition.values.split(',').map(v => v.trim().toLowerCase());
                return options.includes(normalizedInput) || (!!normalizedButtonId && options.includes(normalizedButtonId));
            }
            case 'any':
                return true;
            case 'mask': {
                if (!condition.values) return false;
                try {
                    const regex = new RegExp(condition.values, 'i');
                    return regex.test(input) || (!!buttonId && regex.test(buttonId));
                } catch {
                    return false;
                }
            }
            default:
                return false;
        }
    }

    /**
     * Execute the routing action of a matched condition.
     */
    static async executeAction(
        ticketId: string,
        condition: BotCondition,
        nodes: BotNode[],
        edges: BotEdge[],
        globalConfig: GlobalConfig
    ) {
        switch (condition.action) {
            case 'step': {
                const nextNode = nodes.find(n => n.id === condition.targetId);
                if (nextNode) {
                    await this.executeNode(ticketId, nextNode, globalConfig, edges, nodes);
                } else {
                    await this.endBot(ticketId, globalConfig);
                }
                break;
            }
            case 'department':
                await this.routeOut(ticketId, 'department', condition.targetId, globalConfig);
                break;
            case 'user':
                await this.routeOut(ticketId, 'user', condition.targetId, globalConfig);
                break;
            case 'flow':
                // Future: switch to another bot flow
                await MessagesService.createSystemMessage(ticketId, 'Redirecionamento para outro fluxo (em desenvolvimento).');
                break;
        }
    }

    /**
     * Route out of bot to a department or user.
     */
    static async routeOut(
        ticketId: string,
        targetType: string,
        targetId: string,
        globalConfig: GlobalConfig
    ) {
        // Send greeting message
        if (globalConfig.greetingMessage) {
            await MessagesService.sendBotMessage(ticketId, globalConfig.greetingMessage);
        }

        // Clear bot state
        await prisma.ticket.update({
            where: { id: ticketId },
            data: { currentNodeId: null, botFlowId: null },
        });

        if (targetType === 'department') {
            const autoDistribute = globalConfig.autoDistribute || 'NONE';
            await RoutingService.routeToDepartment(ticketId, targetId, autoDistribute as AutoDistribute);
        } else if (targetType === 'user') {
            await RoutingService.routeToUser(ticketId, targetId);
        }
    }

    /**
     * End the bot flow (no routing, just close or queue).
     */
    static async endBot(ticketId: string, globalConfig: GlobalConfig) {
        if (globalConfig.greetingMessage) {
            await MessagesService.sendBotMessage(ticketId, globalConfig.greetingMessage);
        }

        // Default: close the ticket
        await prisma.ticket.update({
            where: { id: ticketId },
            data: { status: 'CLOSED', currentNodeId: null, botFlowId: null, closedAt: new Date() },
        });

        await MessagesService.createSystemMessage(ticketId, 'Atendimento encerrado pelo bot.');
    }

    /**
     * Start a bot flow for a new ticket.
     */
    static async startFlow(ticketId: string, botFlowId: string) {
        const botFlow = await prisma.botFlow.findUnique({ where: { id: botFlowId } });
        if (!botFlow) return;

        const nodes = (typeof botFlow.nodes === 'string' ? JSON.parse(botFlow.nodes) : botFlow.nodes) as BotNode[];
        const edges = (typeof botFlow.edges === 'string' ? JSON.parse(botFlow.edges) : botFlow.edges) as BotEdge[];
        const globalConfig = (typeof botFlow.globalConfig === 'string' ? JSON.parse(botFlow.globalConfig) : botFlow.globalConfig) as GlobalConfig;

        const startNode = nodes.find(n => n.data?.isStart) || nodes[0];
        if (startNode) {
            await this.executeNode(ticketId, startNode, globalConfig, edges, nodes);
        }
    }
}
