import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function connectSocket(token: string): Socket {
    if (socket?.connected) return socket;

    const socketUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';

    let tenantId: string | undefined;
    const managementContextStr = localStorage.getItem('managementContext');
    if (managementContextStr) {
        try {
            const context = JSON.parse(managementContextStr);
            if (context?.id) {
                tenantId = context.id;
            }
        } catch (e) {}
    }

    socket = io(socketUrl, {
        auth: { token, tenantId },
        transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
        console.log('🔌 Socket connected');
    });

    socket.on('disconnect', () => {
        console.log('🔌 Socket disconnected');
    });

    socket.on('connect_error', (err) => {
        console.error('Socket connection error:', err.message);
    });

    return socket;
}

export function getSocket(): Socket | null {
    return socket;
}

export function disconnectSocket() {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
}
