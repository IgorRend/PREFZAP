import { create } from 'zustand';
import api from '../services/api';
import { getSocket } from '../services/socket';

interface Contact {
    id: string;
    name: string;
    phone: string;
    profilePicUrl?: string;
    avatarUrl?: string;
}

interface Message {
    id: string;
    body?: string;
    mediaUrl?: string;
    mediaType?: string;
    origin: 'AGENT' | 'BOT' | 'CONTACT' | 'SYSTEM';
    isInternal?: boolean;
    createdAt: string;
    ticketId: string;
    whatsappMessageId?: string;
    emoji?: string;
}

interface Ticket {
    id: string;
    protocol: string;
    status: 'BOT' | 'QUEUE' | 'OPEN' | 'CLOSED' | 'PENDING_NPS';
    contact: Contact;
    department?: { id: string; name: string };
    user?: { id: string; name: string };
    messages?: Message[];
    _count?: { messages: number };
    createdAt: string;
    updatedAt: string;
}

interface WindowStatus {
    withinWindow: boolean;
    allowTemplates: boolean;
    minutesRemaining: number;
}

interface TicketState {
    tickets: Ticket[];
    selectedTicket: Ticket | null;
    messages: Message[];
    isLoading: boolean;
    windowStatus: WindowStatus | null;
    windowLoading: boolean;
    slaBreachedIds: string[];
    fetchTickets: (filters?: Record<string, string>) => Promise<void>;
    selectTicket: (ticket: Ticket | null) => Promise<void>;
    fetchMessages: (ticketId: string) => Promise<void>;
    sendMessage: (ticketId: string, body: string) => Promise<void>;
    assignTicket: (ticketId: string, userId?: string) => Promise<void>;
    closeTicket: (ticketId: string) => Promise<void>;
    transferTicket: (ticketId: string, departmentId: string) => Promise<void>;
    fetchWindowStatus: (ticketId: string) => Promise<void>;
    setupSocketListeners: () => void;
}

// Track whether socket listeners have been registered to prevent duplication.
// Zustand stores are singletons, but setupSocketListeners can be called from
// multiple components. Using a module-level flag avoids adding socket.off()
// overhead and keeps the handler set stable.
let listenersRegistered = false;

export const useTicketStore = create<TicketState>((set, get) => ({
    tickets: [],
    selectedTicket: null,
    messages: [],
    isLoading: false,
    windowStatus: null,
    windowLoading: false,
    slaBreachedIds: [],

    fetchTickets: async (filters) => {
        set({ isLoading: true });
        try {
            const params = new URLSearchParams(filters);
            const { data } = await api.get(`/tickets?${params}`);
            const tickets = Array.isArray(data) ? data : (data.tickets ?? []);
            set({ tickets, isLoading: false });
        } catch {
            set({ isLoading: false });
        }
    },

    selectTicket: async (ticket) => {
        set({ selectedTicket: ticket, messages: [], windowStatus: null, windowLoading: !!ticket });
        if (ticket) {
            const socket = getSocket();
            socket?.emit('join:ticket', ticket.id);
            // Capture the ticket id at call time so the fetch result is
            // discarded if the user switches tickets before it resolves.
            const ticketId = ticket.id;
            const [messagesData] = await Promise.all([
                api.get(`/messages/${ticketId}`).then(r => r.data).catch(() => null),
                get().fetchWindowStatus(ticketId),
            ]);
            if (messagesData !== null) {
                // Only commit if the user hasn't switched to a different ticket
                // while the request was in flight.
                set((state) => {
                    if (state.selectedTicket?.id !== ticketId) return state;
                    // Merge: keep any socket messages that arrived during the fetch
                    const fetched: Message[] = messagesData;
                    const fetchedIds = new Set(fetched.map((m: Message) => m.id));
                    const socketOnly = state.messages.filter(m => !fetchedIds.has(m.id));
                    return { messages: [...fetched, ...socketOnly] };
                });
            }
        }
    },

    fetchMessages: async (ticketId) => {
        try {
            const { data } = await api.get(`/messages/${ticketId}`);
            set({ messages: data });
        } catch { }
    },

    sendMessage: async (ticketId, body) => {
        try {
            await api.post(`/messages/${ticketId}`, { body });
        } catch (err) {
            console.error('Failed to send message:', err);
            throw err; // re-throw so Chat.tsx can show a toast
        }
    },

    assignTicket: async (ticketId, userId) => {
        try {
            await api.put(`/tickets/${ticketId}/assign`, { userId });
            await get().fetchTickets();
        } catch { }
    },

    closeTicket: async (ticketId) => {
        try {
            await api.put(`/tickets/${ticketId}/close`);
            set({ selectedTicket: null, messages: [] });
            await get().fetchTickets();
        } catch { }
    },

    transferTicket: async (ticketId, departmentId) => {
        try {
            await api.put(`/tickets/${ticketId}/transfer`, { departmentId });
            await get().fetchTickets();
        } catch { }
    },

    fetchWindowStatus: async (ticketId) => {
        set({ windowLoading: true });
        try {
            const { data } = await api.get(`/messages/${ticketId}/window-status`);
            set({ windowStatus: data, windowLoading: false });
        } catch {
            set({ windowStatus: { withinWindow: false, allowTemplates: false, minutesRemaining: 0 }, windowLoading: false });
        }
    },

    setupSocketListeners: () => {
        if (listenersRegistered) return;
        const socket = getSocket();
        if (!socket) return;
        listenersRegistered = true;

        socket.on('ticket:new', (ticket: Ticket) => {
            set((state) => {
                const index = state.tickets.findIndex((t) => t.id === ticket.id);
                if (index > -1) {
                    const newTickets = [...state.tickets];
                    newTickets[index] = ticket;
                    return { tickets: newTickets };
                }
                return { tickets: [ticket, ...state.tickets] };
            });
        });

        socket.on('ticket:updated', (updated: Ticket) => {
            set((state) => ({
                tickets: state.tickets.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)),
                selectedTicket: state.selectedTicket?.id === updated.id
                    ? { ...state.selectedTicket, ...updated }
                    : state.selectedTicket,
            }));
        });

        socket.on('message:new', (message: Message) => {
            // Single atomic update: append to messages (if viewing this ticket)
            // and bump the ticket's updatedAt in the list — both in one set call.
            set((state) => {
                const isCurrentTicket = state.selectedTicket?.id === message.ticketId;
                let nextMessages = state.messages;

                if (isCurrentTicket) {
                    const exists = state.messages.find(m => m.id === message.id);
                    nextMessages = exists
                        ? state.messages.map(m => m.id === message.id ? { ...m, ...message } : m)
                        : [...state.messages, message];
                }

                return {
                    messages: nextMessages,
                    tickets: state.tickets.map((t) =>
                        t.id === message.ticketId ? { ...t, updatedAt: message.createdAt } : t
                    ),
                };
            });
        });

        socket.on('message_reaction', (reaction: {
            targetMessageId: string;
            emoji: string;
            internalMessageId?: string;
        }) => {
            set((state) => ({
                messages: state.messages.map(m =>
                    (m.id === reaction.internalMessageId || m.whatsappMessageId === reaction.targetMessageId)
                        ? { ...m, emoji: reaction.emoji || undefined }
                        : m
                ),
            }));
        });

        socket.on('message:delete', (deletedMessageId: string) => {
            set((state) => ({
                messages: state.messages.filter(m => m.id !== deletedMessageId),
            }));
        });

        socket.on('ticket:sla-breach', (ids: string[]) => {
            set({ slaBreachedIds: ids });
        });

        // Reset flag if socket reconnects so listeners are re-registered on the new socket
        socket.on('disconnect', () => { listenersRegistered = false; });
    },
}));
