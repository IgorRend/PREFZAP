import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { getSocket } from '../services/socket';
import api from '../services/api';
import { toast } from 'sonner';
import {
    MessageSquare, Users, Plus, Send, Paperclip, Search,
    Hash, User as UserIcon, UsersRound, X, Loader2,
} from 'lucide-react';

interface ChatUser { id: string; name: string; email: string; online: boolean; role?: string; }
interface Participant { userId: string; role: string; user: ChatUser; }
interface RoomMessage {
    id: string; content?: string; attachmentUrl?: string; messageType: string; createdAt: string;
    sender: { id: string; name: string; email?: string };
    readReceipts?: { userId: string; readAt: string }[];
}
interface Room {
    id: string; name?: string; type: string; createdBy: string;
    participants: Participant[]; messages: RoomMessage[]; unreadCount?: number;
}

const initials = (name: string) => name.charAt(0).toUpperCase();
const isImage = (url: string) => /\.(jpg|jpeg|png|gif|webp)$/i.test(url);

/* ── Input style shared ─────────────────────────────── */
const inputBase: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 9,
    padding: '8px 12px',
    fontSize: 13,
    color: 'var(--z-100)',
    outline: 'none',
    fontFamily: 'var(--font-sans)',
    width: '100%',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
};

export default function TeamChat() {
    const { user } = useAuthStore();
    const socket = getSocket();

    const [users, setUsers] = useState<ChatUser[]>([]);
    const [rooms, setRooms] = useState<Room[]>([]);
    const [activeRoom, setActiveRoom] = useState<Room | null>(null);
    const [messages, setMessages] = useState<RoomMessage[]>([]);
    const [input, setInput] = useState('');
    const [search, setSearch] = useState('');
    const [tab, setTab] = useState<'rooms' | 'users'>('rooms');
    const [showGroupModal, setShowGroupModal] = useState(false);
    const [groupName, setGroupName] = useState('');
    const [groupMembers, setGroupMembers] = useState<string[]>([]);
    const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());
    const [uploading, setUploading] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const typingTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    const loadUsers = useCallback(async () => {
        try { const { data } = await api.get('/internal-chat/users'); setUsers(data); } catch { }
    }, []);

    const loadRooms = useCallback(async () => {
        try { const { data } = await api.get('/internal-chat/rooms'); setRooms(data); } catch { }
    }, []);

    const loadMessages = useCallback(async (roomId: string) => {
        try {
            const { data } = await api.get(`/internal-chat/rooms/${roomId}/messages`);
            setMessages(data);
            api.post(`/internal-chat/rooms/${roomId}/read`).catch(() => { });
        } catch { }
    }, []);

    useEffect(() => {
        loadUsers(); loadRooms();
        const interval = setInterval(loadRooms, 30000);
        return () => clearInterval(interval);
    }, [loadUsers, loadRooms]);

    useEffect(() => {
        if (!socket) return;
        const handleNewMessage = (msg: RoomMessage) => {
            setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
            loadRooms();
        };
        const handleUserStatus = (data: { userId: string; online: boolean }) => {
            setUsers(prev => prev.map(u => u.id === data.userId ? { ...u, online: data.online } : u));
        };
        const handleTyping = (data: { userId: string; userName: string; roomId: string }) => {
            if (data.userId === user?.id) return;
            setTypingUsers(prev => { const n = new Map(prev); n.set(data.userId, data.userName); return n; });
        };
        const handleStopTyping = (data: { userId: string }) => {
            setTypingUsers(prev => { const n = new Map(prev); n.delete(data.userId); return n; });
        };
        const handleRead = () => { if (activeRoom) loadMessages(activeRoom.id); };

        socket.on('internal:message', handleNewMessage);
        socket.on('internal:user-status', handleUserStatus);
        socket.on('internal:typing', handleTyping);
        socket.on('internal:stop-typing', handleStopTyping);
        socket.on('internal:read', handleRead);
        return () => {
            socket.off('internal:message', handleNewMessage);
            socket.off('internal:user-status', handleUserStatus);
            socket.off('internal:typing', handleTyping);
            socket.off('internal:stop-typing', handleStopTyping);
            socket.off('internal:read', handleRead);
        };
    }, [socket, user?.id, activeRoom, loadMessages, loadRooms]);

    const openRoom = useCallback(async (room: Room) => {
        if (activeRoom && socket) socket.emit('internal:leave', activeRoom.id);
        setActiveRoom(room); setTypingUsers(new Map());
        if (socket) socket.emit('internal:join', room.id);
        await loadMessages(room.id);
    }, [activeRoom, socket, loadMessages]);

    const startDirectChat = useCallback(async (targetUserId: string) => {
        try {
            const { data } = await api.post(`/internal-chat/rooms/direct/${targetUserId}`);
            await loadRooms(); openRoom(data); setTab('rooms');
        } catch { }
    }, [loadRooms, openRoom]);

    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || !activeRoom) return;
        try {
            await api.post(`/internal-chat/rooms/${activeRoom.id}/messages`, { content: input.trim(), messageType: 'text' });
            setInput('');
            if (socket) socket.emit('internal:stop-typing', { roomId: activeRoom.id });
        } catch { }
    };

    const handleInputChange = (val: string) => {
        setInput(val);
        if (!activeRoom || !socket) return;
        socket.emit('internal:typing', { roomId: activeRoom.id, userName: user?.name });
        if (typingTimeout.current) clearTimeout(typingTimeout.current);
        typingTimeout.current = setTimeout(() => socket.emit('internal:stop-typing', { roomId: activeRoom.id }), 2000);
    };

    const handleFileUpload = async (file: File) => {
        if (!activeRoom) return;
        if (file.size > 64 * 1024 * 1024) { toast.error('O arquivo excede o limite de 64 MB'); return; }
        setUploading(true);
        try {
            const formData = new FormData(); formData.append('file', file);
            const { data: upload } = await api.post('/internal-chat/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
            await api.post(`/internal-chat/rooms/${activeRoom.id}/messages`, { content: upload.originalName, attachmentUrl: upload.url, messageType: 'file' });
        } catch { toast.error('Erro ao enviar arquivo'); }
        setUploading(false);
    };

    const handleCreateGroup = async () => {
        if (!groupName.trim()) return;
        try {
            const { data } = await api.post('/internal-chat/rooms/group', { name: groupName.trim(), memberIds: groupMembers });
            setShowGroupModal(false); setGroupName(''); setGroupMembers([]);
            await loadRooms(); openRoom(data);
        } catch (err: any) { toast.error(err.response?.data?.error || 'Erro ao criar grupo'); }
    };

    const getRoomDisplayName = (room: Room) => {
        if (room.name) return room.name;
        const other = room.participants.find(p => p.userId !== user?.id);
        return other?.user.name || 'Chat Direto';
    };

    const getOtherUserOnline = (room: Room) => {
        if (room.type !== 'direct') return null;
        const other = room.participants.find(p => p.userId !== user?.id);
        return other?.user.online ?? false;
    };

    const formatTime = (d: string) => new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const formatDate = (d: string) => {
        const date = new Date(d), today = new Date();
        if (date.toDateString() === today.toDateString()) return 'Hoje';
        const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
        if (date.toDateString() === yesterday.toDateString()) return 'Ontem';
        return date.toLocaleDateString('pt-BR');
    };

    const filteredUsers = users.filter(u => u.id !== user?.id && (!search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())));
    const filteredRooms = rooms.filter(r => !search || getRoomDisplayName(r).toLowerCase().includes(search.toLowerCase()));

    return (
        <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: 'var(--z-950)' }}>

            {/* ── Left Sidebar ───────────────────────────── */}
            <div
                style={{
                    width: 280,
                    minWidth: 280,
                    display: 'flex',
                    flexDirection: 'column',
                    background: 'var(--z-925)',
                    borderRight: '1px solid rgba(255,255,255,0.07)',
                }}
            >
                {/* Header */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '14px 14px 12px',
                        borderBottom: '1px solid rgba(255,255,255,0.07)',
                        flexShrink: 0,
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <div
                            style={{
                                width: 30,
                                height: 30,
                                borderRadius: 8,
                                background: 'rgba(16,185,129,0.12)',
                                border: '1px solid rgba(16,185,129,0.2)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'var(--em-500)',
                                flexShrink: 0,
                            }}
                        >
                            <MessageSquare size={15} />
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--z-100)' }}>Chat Interno</span>
                    </div>
                    {user?.role === 'ADMIN' && (
                        <button
                            onClick={() => setShowGroupModal(true)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 5,
                                padding: '5px 9px',
                                borderRadius: 7,
                                background: 'rgba(16,185,129,0.1)',
                                border: '1px solid rgba(16,185,129,0.25)',
                                color: 'var(--em-500)',
                                fontSize: 11.5,
                                fontWeight: 600,
                                cursor: 'pointer',
                                fontFamily: 'var(--font-sans)',
                            }}
                        >
                            <Plus size={12} /> Grupo
                        </button>
                    )}
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
                    {([['rooms', <Hash size={12} />, 'Conversas'], ['users', <Users size={12} />, 'Equipe']] as const).map(([key, icon, label]) => (
                        <button
                            key={key}
                            onClick={() => setTab(key)}
                            style={{
                                flex: 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 5,
                                padding: '9px 0',
                                background: 'transparent',
                                border: 'none',
                                borderBottom: tab === key ? '2px solid #10b981' : '2px solid transparent',
                                color: tab === key ? 'var(--em-500)' : 'var(--z-500)',
                                fontSize: 12,
                                fontWeight: tab === key ? 600 : 500,
                                cursor: 'pointer',
                                transition: 'all 0.15s',
                                fontFamily: 'var(--font-sans)',
                            }}
                        >
                            {icon} {label}
                        </button>
                    ))}
                </div>

                {/* Search */}
                <div style={{ padding: '10px 12px', flexShrink: 0 }}>
                    <div style={{ position: 'relative' }}>
                        <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--z-500)', pointerEvents: 'none' }} />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar..."
                            style={{ ...inputBase, paddingLeft: 32, fontSize: 12.5 }}
                            onFocus={e => (e.currentTarget.style.borderColor = 'rgba(16,185,129,0.35)')}
                            onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)')}
                        />
                    </div>
                </div>

                {/* List */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {tab === 'rooms' ? (
                        filteredRooms.length === 0 ? (
                            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--z-400)', fontSize: 13 }}>
                                Nenhuma conversa ainda.<br />
                                <span style={{ color: 'var(--z-500)' }}>Vá em "Equipe" para começar.</span>
                            </div>
                        ) : filteredRooms.map(room => {
                            const isActive = activeRoom?.id === room.id;
                            const online = getOtherUserOnline(room);
                            return (
                                <div
                                    key={room.id}
                                    onClick={() => openRoom(room)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 10,
                                        padding: '10px 12px',
                                        cursor: 'pointer',
                                        background: isActive ? 'rgba(16,185,129,0.08)' : 'transparent',
                                        transition: 'background 0.12s',
                                    }}
                                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                                >
                                    {/* Avatar */}
                                    <div style={{ position: 'relative', flexShrink: 0 }}>
                                        <div
                                            style={{
                                                width: 36,
                                                height: 36,
                                                borderRadius: '50%',
                                                background: room.type === 'group' ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.06)',
                                                border: `1px solid ${room.type === 'group' ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.08)'}`,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                color: room.type === 'group' ? 'var(--em-500)' : 'var(--z-400)',
                                            }}
                                        >
                                            {room.type === 'group' ? <UsersRound size={16} /> : <UserIcon size={16} />}
                                        </div>
                                        {room.type === 'direct' && (
                                            <div
                                                style={{
                                                    position: 'absolute',
                                                    bottom: 0,
                                                    right: 0,
                                                    width: 10,
                                                    height: 10,
                                                    borderRadius: '50%',
                                                    background: online ? 'var(--em-500)' : 'var(--z-400)',
                                                    border: '2px solid var(--z-925)',
                                                }}
                                            />
                                        )}
                                    </div>
                                    {/* Info */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--z-200)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {getRoomDisplayName(room)}
                                            </span>
                                            {room.messages[0] && (
                                                <span style={{ fontSize: 10.5, color: 'var(--z-500)', flexShrink: 0, marginLeft: 4 }}>
                                                    {formatTime(room.messages[0].createdAt)}
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                                            <span style={{ fontSize: 11.5, color: 'var(--z-500)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {room.messages[0]?.content || 'Sem mensagens'}
                                            </span>
                                            {(room.unreadCount ?? 0) > 0 && (
                                                <span
                                                    style={{
                                                        fontSize: 10,
                                                        fontWeight: 700,
                                                        background: 'var(--em-500)',
                                                        color: '#fff',
                                                        borderRadius: 10,
                                                        padding: '1px 6px',
                                                        flexShrink: 0,
                                                        marginLeft: 4,
                                                    }}
                                                >
                                                    {room.unreadCount}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    ) : filteredUsers.map(u => (
                        <div
                            key={u.id}
                            onClick={() => startDirectChat(u.id)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                padding: '9px 12px',
                                cursor: 'pointer',
                                transition: 'background 0.12s',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                            <div style={{ position: 'relative', flexShrink: 0 }}>
                                <div
                                    style={{
                                        width: 34,
                                        height: 34,
                                        borderRadius: '50%',
                                        background: 'rgba(16,185,129,0.1)',
                                        border: '1px solid rgba(16,185,129,0.2)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: 13,
                                        fontWeight: 700,
                                        color: 'var(--em-500)',
                                    }}
                                >
                                    {initials(u.name)}
                                </div>
                                <div
                                    style={{
                                        position: 'absolute',
                                        bottom: 0,
                                        right: 0,
                                        width: 9,
                                        height: 9,
                                        borderRadius: '50%',
                                        background: u.online ? 'var(--em-500)' : 'var(--z-400)',
                                        border: '2px solid var(--z-925)',
                                    }}
                                />
                            </div>
                            <div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--z-200)' }}>{u.name}</div>
                                <div style={{ fontSize: 11, color: 'var(--z-500)' }}>{u.email}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Main Chat ──────────────────────────────── */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--z-950)' }}>
                {!activeRoom ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, color: 'var(--z-400)' }}>
                        <div
                            style={{
                                width: 52,
                                height: 52,
                                borderRadius: 16,
                                background: 'rgba(16,185,129,0.06)',
                                border: '1px solid rgba(16,185,129,0.12)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'var(--z-400)',
                            }}
                        >
                            <MessageSquare size={24} />
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--z-200)' }}>Selecione uma conversa</p>
                            <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--z-400)' }}>Escolha um colega ou grupo para começar</p>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Chat Header */}
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                padding: '10px 16px',
                                borderBottom: '1px solid rgba(255,255,255,0.07)',
                                background: 'var(--z-925)',
                                flexShrink: 0,
                            }}
                        >
                            <div
                                style={{
                                    width: 34,
                                    height: 34,
                                    borderRadius: '50%',
                                    background: activeRoom.type === 'group' ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.06)',
                                    border: `1px solid ${activeRoom.type === 'group' ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.08)'}`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: activeRoom.type === 'group' ? 'var(--em-500)' : 'var(--z-400)',
                                    flexShrink: 0,
                                }}
                            >
                                {activeRoom.type === 'group' ? <UsersRound size={16} /> : <UserIcon size={16} />}
                            </div>
                            <div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--z-100)' }}>{getRoomDisplayName(activeRoom)}</div>
                                <div style={{ fontSize: 11.5, color: 'var(--z-500)', marginTop: 1 }}>
                                    {activeRoom.type === 'group'
                                        ? `${activeRoom.participants.length} membros`
                                        : getOtherUserOnline(activeRoom) ? (
                                            <span style={{ color: 'var(--em-500)' }}>● Online</span>
                                        ) : 'Offline'}
                                </div>
                            </div>
                        </div>

                        {/* Messages */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {messages.map((msg, idx) => {
                                const isMe = msg.sender.id === user?.id;
                                const showDate = idx === 0 || formatDate(messages[idx - 1].createdAt) !== formatDate(msg.createdAt);
                                const showAvatar = !isMe && (idx === 0 || messages[idx - 1].sender.id !== msg.sender.id);
                                return (
                                    <div key={msg.id}>
                                        {showDate && (
                                            <div style={{ textAlign: 'center', margin: '12px 0 8px' }}>
                                                <span
                                                    style={{
                                                        background: 'rgba(255,255,255,0.05)',
                                                        border: '1px solid rgba(255,255,255,0.08)',
                                                        borderRadius: 20,
                                                        padding: '3px 12px',
                                                        fontSize: 11,
                                                        color: 'var(--z-500)',
                                                    }}
                                                >
                                                    {formatDate(msg.createdAt)}
                                                </span>
                                            </div>
                                        )}
                                        <div
                                            style={{
                                                display: 'flex',
                                                justifyContent: isMe ? 'flex-end' : 'flex-start',
                                                marginTop: showAvatar ? 8 : 1,
                                            }}
                                        >
                                            <div style={{ maxWidth: '72%' }}>
                                                {showAvatar && !isMe && activeRoom.type === 'group' && (
                                                    <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--em-400)', marginBottom: 3, marginLeft: 4 }}>
                                                        {msg.sender.name}
                                                    </div>
                                                )}
                                                <div
                                                    style={{
                                                        padding: '8px 12px',
                                                        borderRadius: isMe ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                                                        background: isMe
                                                            ? 'linear-gradient(135deg, var(--em-600), var(--em-500))'
                                                            : 'rgba(255,255,255,0.06)',
                                                        border: isMe ? 'none' : '1px solid rgba(255,255,255,0.08)',
                                                        fontSize: 13.5,
                                                        color: 'var(--z-100)',
                                                        lineHeight: 1.5,
                                                        boxShadow: isMe ? 'var(--shadow-em)' : 'none',
                                                    }}
                                                >
                                                    {msg.messageType === 'file' && msg.attachmentUrl ? (
                                                        <div>
                                                            {isImage(msg.attachmentUrl) ? (
                                                                <img src={msg.attachmentUrl} alt="attachment" style={{ maxWidth: '100%', maxHeight: 240, borderRadius: 8, marginBottom: 4 }} />
                                                            ) : (
                                                                <a
                                                                    href={msg.attachmentUrl}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    style={{
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: 8,
                                                                        padding: '8px 10px',
                                                                        background: 'rgba(255,255,255,0.08)',
                                                                        borderRadius: 8,
                                                                        color: 'var(--em-400)',
                                                                        textDecoration: 'none',
                                                                        fontSize: 13,
                                                                    }}
                                                                >
                                                                    <Paperclip size={14} /> {msg.content || 'Arquivo'}
                                                                </a>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.content}</div>
                                                    )}
                                                    <div style={{ fontSize: 10, color: isMe ? 'rgba(255,255,255,0.55)' : 'var(--z-400)', marginTop: 4, textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                                                        {formatTime(msg.createdAt)}
                                                        {isMe && (msg.readReceipts?.length ?? 0) > 0 && (
                                                            <span style={{ color: 'var(--em-400)' }}>✓✓</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            {typingUsers.size > 0 && (
                                <div style={{ fontSize: 12, color: 'var(--em-500)', fontStyle: 'italic', marginTop: 4, marginLeft: 4 }}>
                                    {Array.from(typingUsers.values()).join(', ')} está digitando...
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Bar */}
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                padding: '12px 16px',
                                borderTop: '1px solid rgba(255,255,255,0.07)',
                                background: 'var(--z-925)',
                                flexShrink: 0,
                            }}
                        >
                            <input type="file" ref={fileInputRef} hidden onChange={e => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); e.target.value = ''; }} />
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploading}
                                title="Enviar arquivo (máx 64MB)"
                                style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: 9,
                                    background: 'transparent',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    color: 'var(--z-500)',
                                    cursor: uploading ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                    transition: 'all 0.15s',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.color = 'var(--z-300)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; }}
                                onMouseLeave={e => { e.currentTarget.style.color = 'var(--z-500)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
                            >
                                {uploading ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={16} />}
                            </button>
                            <input
                                value={input}
                                onChange={e => handleInputChange(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
                                placeholder="Digite uma mensagem..."
                                style={{ ...inputBase, flex: 1 }}
                                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(16,185,129,0.35)')}
                                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)')}
                            />
                            <button
                                onClick={handleSend}
                                disabled={!input.trim() || uploading}
                                style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: 9,
                                    background: input.trim() ? 'linear-gradient(135deg, var(--em-600), var(--em-500))' : 'rgba(255,255,255,0.05)',
                                    border: 'none',
                                    color: input.trim() ? '#fff' : 'var(--z-500)',
                                    cursor: input.trim() ? 'pointer' : 'not-allowed',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                    boxShadow: input.trim() ? 'var(--shadow-em)' : 'none',
                                    transition: 'all 0.15s',
                                }}
                            >
                                <Send size={15} />
                            </button>
                        </div>
                    </>
                )}
            </div>

            {/* ── Group Modal ─────────────────────────────── */}
            {showGroupModal && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.7)',
                        backdropFilter: 'blur(8px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 9000,
                    }}
                    onClick={e => e.target === e.currentTarget && setShowGroupModal(false)}
                >
                    <div
                        style={{
                            width: 400,
                            background: 'var(--z-850)',
                            border: '1px solid rgba(255,255,255,0.10)',
                            borderRadius: 16,
                            boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
                            overflow: 'hidden',
                        }}
                    >
                        {/* Modal Header */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--z-100)' }}>Novo Grupo</span>
                            <button
                                onClick={() => setShowGroupModal(false)}
                                style={{ width: 28, height: 28, borderRadius: 7, background: 'transparent', border: 'none', color: 'var(--z-500)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                onMouseEnter={e => (e.currentTarget.style.color = 'var(--z-100)')}
                                onMouseLeave={e => (e.currentTarget.style.color = 'var(--z-500)')}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div>
                                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--z-400)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>
                                    Nome do Grupo
                                </label>
                                <input
                                    value={groupName}
                                    onChange={e => setGroupName(e.target.value)}
                                    placeholder="Ex: Equipe Vendas"
                                    style={inputBase}
                                    onFocus={e => (e.currentTarget.style.borderColor = 'rgba(16,185,129,0.35)')}
                                    onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)')}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--z-400)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>
                                    Membros ({groupMembers.length} selecionados)
                                </label>
                                <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
                                    {users.filter(u => u.id !== user?.id).map(u => {
                                        const checked = groupMembers.includes(u.id);
                                        return (
                                            <label
                                                key={u.id}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 10,
                                                    padding: '8px 10px',
                                                    borderRadius: 8,
                                                    cursor: 'pointer',
                                                    background: checked ? 'rgba(16,185,129,0.08)' : 'transparent',
                                                    border: `1px solid ${checked ? 'rgba(16,185,129,0.2)' : 'transparent'}`,
                                                    transition: 'all 0.12s',
                                                }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => setGroupMembers(prev => prev.includes(u.id) ? prev.filter(id => id !== u.id) : [...prev, u.id])}
                                                    style={{ accentColor: 'var(--em-500)', width: 15, height: 15, cursor: 'pointer' }}
                                                />
                                                <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--em-500)' }}>
                                                    {initials(u.name)}
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--z-200)' }}>{u.name}</div>
                                                    <div style={{ fontSize: 11, color: 'var(--z-500)' }}>{u.email}</div>
                                                </div>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>

                            <button
                                onClick={handleCreateGroup}
                                disabled={!groupName.trim()}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    borderRadius: 10,
                                    background: groupName.trim() ? 'linear-gradient(135deg, var(--em-600), var(--em-500))' : 'rgba(255,255,255,0.05)',
                                    border: 'none',
                                    color: groupName.trim() ? '#fff' : 'var(--z-500)',
                                    fontSize: 14,
                                    fontWeight: 700,
                                    cursor: groupName.trim() ? 'pointer' : 'not-allowed',
                                    boxShadow: groupName.trim() ? 'var(--shadow-em)' : 'none',
                                    fontFamily: 'var(--font-sans)',
                                    transition: 'all 0.15s',
                                }}
                            >
                                Criar Grupo
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
