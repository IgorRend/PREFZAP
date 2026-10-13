/**
 * widget.gateway.ts
 *
 * Dedicated Socket.IO namespace for the embeddable web widget.
 * Path: /widget
 *
 * Flow:
 *  1. Visitor SDK connects to /widget with { token, visitorId, visitorName }
 *  2. Gateway validates the widgetToken, resolves/creates session + ticket
 *  3. Visitor joins room `ticket:<ticketId>` — same room used by agent dashboard
 *  4. Visitor sends 'widget:message' → message saved via MessagesService → emitted to ticket room
 *  5. Agent replies via normal dashboard → message:new emitted to ticket room → visitor receives it
 */

import { Server as SocketIOServer, Namespace, Socket } from 'socket.io';
import { WidgetService } from './widget.service';
import { MessagesService } from '../messages/messages.service';
import { BotFlowEngine } from '../botflow/botflow.engine';

interface WidgetSocket extends Socket {
    widgetId?: string;
    sessionId?: string;
    ticketId?: string;
    visitorId?: string;
}

export function initWidgetGateway(io: SocketIOServer): Namespace {
    const ns = io.of('/widget');

    ns.on('connection', async (socket: WidgetSocket) => {
        const { token, visitorId, visitorName } = socket.handshake.auth;

        if (!token || !visitorId) {
            socket.emit('widget:error', { message: 'token e visitorId são obrigatórios' });
            socket.disconnect();
            return;
        }

        try {
            // ─── Validate token & resolve session ───────────
            const widget = await WidgetService.findByToken(token);
            if (!widget || !widget.isActive) {
                socket.emit('widget:error', { message: 'Widget inativo ou token inválido' });
                socket.disconnect();
                return;
            }

            const { tenantStorage } = require('../../lib/db');
            const { createTenantPrisma } = require('../../lib/prisma-tenant');
            const tenantPrisma = createTenantPrisma(widget.tenantId);

            const { session, ticket } = await tenantStorage.run(
                { tenantId: widget.tenantId, prisma: tenantPrisma },
                async () => {
                    return WidgetService.findOrCreateSession(
                        widget.id, String(visitorId), visitorName ? String(visitorName) : undefined
                    );
                }
            );

            socket.widgetId = widget.id;
            socket.sessionId = session.id;
            socket.ticketId = ticket.id;
            socket.visitorId = String(visitorId);

            // Join the same ticket room the agents use
            socket.join(`ticket:${ticket.id}`);
            socket.join(`visitor:${visitorId}`);

            // Confirm connection to visitor
            socket.emit('widget:ready', {
                sessionId: session.id,
                ticketId: ticket.id,
                widget: {
                    name: widget.name,
                    primaryColor: widget.primaryColor,
                    welcomeMessage: widget.welcomeMessage,
                    agentName: widget.agentName,
                },
            });

            console.log(`🌐 Widget visitor connected: ${visitorId} → ticket:${ticket.id}`);

            // ─── Incoming message from visitor ─────────────
            socket.on('widget:message', async (data: { body: string }) => {
                if (!data.body?.trim() || !socket.ticketId) return;

                const { tenantStorage } = require('../../lib/db');
                const { createTenantPrisma } = require('../../lib/prisma-tenant');

                await tenantStorage.run({ tenantId: widget.tenantId, prisma: createTenantPrisma(widget.tenantId) }, async () => {
                    try {
                        // Save message as CONTACT origin
                        await MessagesService.create({
                            ticketId: socket.ticketId!,
                            body: data.body.trim(),
                            origin: 'CONTACT',
                        });

                        // Update lastContactMessageAt for 24h window
                        const { prisma } = await import('../../server');
                        await prisma.ticket.update({
                            where: { id: socket.ticketId },
                            data: { lastContactMessageAt: new Date() },
                        });

                        // If ticket is in BOT status, route through bot engine
                        const ticket = await prisma.ticket.findUnique({ where: { id: socket.ticketId } });
                        if (ticket?.status === 'BOT') {
                            if (!ticket.currentNodeId && ticket.botFlowId) {
                                // Fresh ticket: send welcome message first
                                await BotFlowEngine.startFlow(socket.ticketId!, ticket.botFlowId);
                            } else {
                                await BotFlowEngine.processMessage(socket.ticketId!, data.body.trim());
                            }
                        }
                    } catch (e) {
                        console.error('[WidgetGateway] Failed to save message:', e);
                        socket.emit('widget:error', { message: 'Erro ao enviar mensagem' });
                    }
                });
            });

            // ─── Visitor typing indicator ────────────────────
            socket.on('widget:typing', () => {
                if (!socket.ticketId) return;
                // Broadcast to agents watching this ticket (in main namespace)
                io.to(`ticket:${socket.ticketId}`).emit('visitor:typing', { ticketId: socket.ticketId });
            });

            socket.on('widget:stop-typing', () => {
                if (!socket.ticketId) return;
                io.to(`ticket:${socket.ticketId}`).emit('visitor:stop-typing', { ticketId: socket.ticketId });
            });

            // ─── Disconnect ──────────────────────────────────
            socket.on('disconnect', () => {
                console.log(`🌐 Widget visitor disconnected: ${visitorId}`);
            });

        } catch (e) {
            console.error('[WidgetGateway] Connection error:', e);
            socket.emit('widget:error', { message: 'Erro interno' });
            socket.disconnect();
        }
    });

    // Agent → Widget: when agent sends a message, the main namespace
    // emits to ticket:<ticketId>. The visitor is also in that room on the
    // /widget namespace — but Socket.IO namespaces are isolated.
    // Solution: relay `message:new` from main namespace into /widget namespace.
    // This is called from socket.ts when a message is created.

    return ns;
}

/**
 * Relay a message to the widget namespace.
 * Called by emitToTicket() in socket.ts after saving an agent message.
 */
let widgetNs: Namespace | null = null;

export function setWidgetNamespace(ns: Namespace) { widgetNs = ns; }

export function emitToWidgetTicket(ticketId: string, event: string, data: any) {
    widgetNs?.to(`ticket:${ticketId}`).emit(event, data);
}
