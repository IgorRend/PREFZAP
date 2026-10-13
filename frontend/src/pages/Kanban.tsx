import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import api from '../services/api';
import {
    Plus, Settings2, Trash2, Save, X, User, Clock,
    LayoutDashboard, RefreshCw, GripVertical, MessageSquare, ChevronDown, Loader2,
} from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

// ─── Types ────────────────────────────────────────────────
interface TicketCard {
    id: string; protocol: string; status: string; createdAt: string; updatedAt: string;
    kanbanColumnId?: string;
    contact: { id: string; name?: string; fullName?: string; phone: string; channel?: string };
    user?: { id: string; name: string };
    department?: { id: string; name: string };
    tags: { tag: { id: string; name: string; color: string } }[];
    messages: { body?: string; origin: string; createdAt: string }[];
}

interface Column {
    id: string; name: string; color: string; position: number;
    columnType: string; autoStatus?: string;
    tickets: TicketCard[];
}

interface Board {
    id: string; name: string; description?: string; isDefault: boolean;
    columns: Column[];
}

function relTime(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'agora';
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
}

/* ── Shared input style ────────────────────────────────── */
const inputBase: React.CSSProperties = {
    width: '100%',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 9,
    padding: '9px 12px',
    fontSize: 13,
    color: '#f4f4f5',
    outline: 'none',
    fontFamily: 'var(--font-sans)',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
};

/* ── Drag state ────────────────────────────────────────── */
let draggedTicketId: string | null = null;
let draggedFromColumnId: string | null = null;

/* ── Kanban Card ───────────────────────────────────────── */
function KanbanCard({ ticket, column, onMove, onClick }: {
    ticket: TicketCard; column: Column;
    onMove: (ticketId: string, fromColId: string, toColId: string) => void;
    onClick: (ticket: TicketCard) => void;
}) {
    const contactName = ticket.contact.fullName || ticket.contact.name || ticket.contact.phone;
    const lastMsg = ticket.messages[0];
    const [dragging, setDragging] = useState(false);

    return (
        <div
            draggable
            onDragStart={e => {
                draggedTicketId = ticket.id;
                draggedFromColumnId = column.id;
                e.dataTransfer.effectAllowed = 'move';
                setDragging(true);
            }}
            onDragEnd={() => setDragging(false)}
            onClick={() => onClick(ticket)}
            style={{
                background: dragging ? 'rgba(16,185,129,0.06)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${dragging ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 10,
                padding: '10px 12px',
                cursor: 'pointer',
                opacity: dragging ? 0.5 : 1,
                transition: 'all 0.12s',
                marginBottom: 8,
                userSelect: 'none',
            }}
            onMouseEnter={e => { if (!dragging) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'; }}
            onMouseLeave={e => { if (!dragging) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
        >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div
                        style={{
                            width: 30,
                            height: 30,
                            borderRadius: '50%',
                            background: 'rgba(16,185,129,0.1)',
                            border: '1px solid rgba(16,185,129,0.2)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#10b981',
                            flexShrink: 0,
                        }}
                    >
                        {contactName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: '#d4d4d8', lineHeight: 1.2 }}>{contactName}</div>
                        <div style={{ fontSize: 10.5, color: '#52525b', marginTop: 1 }}>
                            {ticket.contact.channel === 'web_widget' ? '🌐' : '📱'} #{ticket.protocol}
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#52525b', fontSize: 10.5, flexShrink: 0 }}>
                    <Clock size={10} />{relTime(ticket.updatedAt)}
                </div>
            </div>

            {/* Last message */}
            {lastMsg?.body && (
                <div
                    style={{
                        fontSize: 11.5,
                        color: '#71717a',
                        lineHeight: 1.45,
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        marginBottom: 8,
                    }}
                >
                    {lastMsg.origin === 'AGENT' ? '↩ ' : ''}{lastMsg.body}
                </div>
            )}

            {/* Footer */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                    {ticket.tags.slice(0, 2).map(t => (
                        <span
                            key={t.tag.id}
                            style={{
                                fontSize: 10,
                                fontWeight: 600,
                                padding: '2px 6px',
                                borderRadius: 5,
                                background: t.tag.color + '20',
                                color: t.tag.color,
                                border: `1px solid ${t.tag.color}30`,
                            }}
                        >
                            {t.tag.name}
                        </span>
                    ))}
                    {ticket.tags.length > 2 && (
                        <span style={{ fontSize: 10, color: '#52525b' }}>+{ticket.tags.length - 2}</span>
                    )}
                </div>
                {ticket.user && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#52525b', fontSize: 10.5, flexShrink: 0 }}>
                        <User size={10} />{ticket.user.name.split(' ')[0]}
                    </div>
                )}
            </div>
        </div>
    );
}

/* ── Column ────────────────────────────────────────────── */
function KanbanColumn({ column, onDrop, onTicketClick, isAdmin, onEdit, onDelete }: {
    column: Column;
    onDrop: (ticketId: string, fromColId: string, toColId: string) => void;
    onTicketClick: (ticket: TicketCard) => void;
    isAdmin: boolean;
    onEdit: (col: Column) => void;
    onDelete: (colId: string) => void;
}) {
    const [dragOver, setDragOver] = useState(false);

    return (
        <div
            style={{
                width: 280,
                minWidth: 280,
                display: 'flex',
                flexDirection: 'column',
                background: dragOver ? 'rgba(16,185,129,0.04)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${dragOver ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.07)'}`,
                borderRadius: 14,
                transition: 'all 0.15s',
                maxHeight: '100%',
                overflow: 'hidden',
            }}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
                e.preventDefault(); setDragOver(false);
                if (draggedTicketId && draggedFromColumnId && draggedFromColumnId !== column.id) {
                    onDrop(draggedTicketId, draggedFromColumnId, column.id);
                    draggedTicketId = null; draggedFromColumnId = null;
                }
            }}
        >
            {/* Column header */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    flexShrink: 0,
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 9, height: 9, borderRadius: '50%', background: column.color, flexShrink: 0, boxShadow: `0 0 8px ${column.color}60` }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#d4d4d8' }}>{column.name}</span>
                    <span
                        style={{
                            fontSize: 10,
                            fontWeight: 700,
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: 10,
                            padding: '1px 7px',
                            color: '#71717a',
                        }}
                    >
                        {column.tickets.length}
                    </span>
                </div>
                {isAdmin && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <button
                            onClick={() => onEdit(column)}
                            aria-label={`Configurar coluna ${column.name}`}
                            style={{ width: 26, height: 26, borderRadius: 6, background: 'transparent', border: 'none', color: '#52525b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.12s' }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#a1a1aa'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#52525b'; }}
                        >
                            <Settings2 size={13} />
                        </button>
                        <button
                            onClick={() => onDelete(column.id)}
                            aria-label={`Remover coluna ${column.name}`}
                            style={{ width: 26, height: 26, borderRadius: 6, background: 'transparent', border: 'none', color: '#52525b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.12s' }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.color = '#fca5a5'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#52525b'; }}
                        >
                            <Trash2 size={13} />
                        </button>
                    </div>
                )}
            </div>

            {/* Cards */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 10px' }}>
                {column.tickets.length === 0 ? (
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: 80,
                            borderRadius: 8,
                            border: '1px dashed rgba(255,255,255,0.06)',
                            color: '#3f3f46',
                            fontSize: 12,
                        }}
                    >
                        Arraste aqui
                    </div>
                ) : (
                    column.tickets.map(ticket => (
                        <KanbanCard
                            key={ticket.id}
                            ticket={ticket}
                            column={column}
                            onMove={onDrop}
                            onClick={onTicketClick}
                        />
                    ))
                )}
            </div>
        </div>
    );
}

/* ── Modal ─────────────────────────────────────────────── */
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
    return (
        <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9000 }}
            onClick={e => e.target === e.currentTarget && onClose()}
        >
            <div
                style={{
                    width: 420,
                    background: 'var(--z-850)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    borderRadius: 16,
                    boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
                    overflow: 'hidden',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#f4f4f5' }}>{title}</span>
                    <button
                        onClick={onClose}
                        aria-label="Fechar"
                        style={{ width: 28, height: 28, borderRadius: 7, background: 'transparent', border: 'none', color: '#52525b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#f4f4f5')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#52525b')}
                    >
                        <X size={16} />
                    </button>
                </div>
                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
            </div>
        </div>
    );
}

function ModalField({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#71717a', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{label}</label>
            {children}
        </div>
    );
}

function SelectField({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
    return (
        <div style={{ position: 'relative' }}>
            <select value={value} onChange={e => onChange(e.target.value)} style={{ ...inputBase, appearance: 'none', paddingRight: 28, cursor: 'pointer' }}>
                {children}
            </select>
            <ChevronDown size={13} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#52525b', pointerEvents: 'none' }} />
        </div>
    );
}

/* ── Main ──────────────────────────────────────────────── */
export default function Kanban() {
    const { user } = useAuthStore();
    const navigate = useNavigate();
    const isAdmin = user?.role === 'ADMIN';

    const [boards, setBoards] = useState<Board[]>([]);
    const [activeBoard, setActiveBoard] = useState<Board | null>(null);
    const [loading, setLoading] = useState(true);
    const [showBoardDrop, setShowBoardDrop] = useState(false);

    const [showBoardForm, setShowBoardForm] = useState(false);
    const [boardForm, setBoardForm] = useState({ name: '', description: '' });

    const [showColForm, setShowColForm] = useState(false);
    const [editingCol, setEditingCol] = useState<Column | null>(null);
    const [colForm, setColForm] = useState({ name: '', color: '#10b981', autoStatus: '', columnType: 'default' });

    const [selectedTicket, setSelectedTicket] = useState<TicketCard | null>(null);
    const [deleteBoardTarget, setDeleteBoardTarget] = useState<string | null>(null);
    const [deleteColTarget, setDeleteColTarget] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await api.get<Board[]>('/kanban/boards');
            setBoards(data);
            if (data.length > 0) {
                const def = data.find(b => b.isDefault) || data[0];
                const { data: full } = await api.get<Board>(`/kanban/boards/${def.id}`);
                setActiveBoard(full);
            } else {
                setActiveBoard(null);
            }
        } catch { } finally { setLoading(false); }
    }, []);

    const switchBoard = async (id: string) => {
        const { data } = await api.get<Board>(`/kanban/boards/${id}`);
        setActiveBoard(data);
    };

    useEffect(() => { load(); }, []);

    const handleCreateBoard = async () => {
        if (!boardForm.name.trim()) return;
        const { data } = await api.post<Board>('/kanban/boards', boardForm);
        setShowBoardForm(false); setBoardForm({ name: '', description: '' });
        await load(); switchBoard(data.id);
    };

    const handleDeleteBoard = (id: string) => setDeleteBoardTarget(id);
    const confirmDeleteBoard = async () => {
        if (!deleteBoardTarget) return;
        await api.delete(`/kanban/boards/${deleteBoardTarget}`);
        setDeleteBoardTarget(null);
        load();
    };

    const handleSaveCol = async () => {
        if (!activeBoard) return;
        if (editingCol) await api.put(`/kanban/columns/${editingCol.id}`, colForm);
        else await api.post(`/kanban/boards/${activeBoard.id}/columns`, colForm);
        setShowColForm(false); setEditingCol(null);
        const { data } = await api.get<Board>(`/kanban/boards/${activeBoard.id}`);
        setActiveBoard(data);
    };

    const handleDeleteColumn = (colId: string) => setDeleteColTarget(colId);
    const confirmDeleteColumn = async () => {
        if (!deleteColTarget) return;
        await api.delete(`/kanban/columns/${deleteColTarget}`);
        setDeleteColTarget(null);
        if (activeBoard) {
            const { data } = await api.get<Board>(`/kanban/boards/${activeBoard.id}`);
            setActiveBoard(data);
        }
    };

    const handleDrop = useCallback(async (ticketId: string, fromColId: string, toColId: string) => {
        if (!activeBoard) return;
        setActiveBoard(prev => {
            if (!prev) return prev;
            const fromCol = prev.columns.find(c => c.id === fromColId);
            const toCol = prev.columns.find(c => c.id === toColId);
            if (!fromCol || !toCol) return prev;
            const ticket = fromCol.tickets.find(t => t.id === ticketId);
            if (!ticket) return prev;
            return {
                ...prev,
                columns: prev.columns.map(c => {
                    if (c.id === fromColId) return { ...c, tickets: c.tickets.filter(t => t.id !== ticketId) };
                    if (c.id === toColId) return { ...c, tickets: [{ ...ticket, kanbanColumnId: toColId }, ...c.tickets] };
                    return c;
                }),
            };
        });
        try {
            await api.patch(`/kanban/tickets/${ticketId}/move`, { columnId: toColId });
        } catch { load(); }
    }, [activeBoard]);

    if (loading) {
        return (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--z-950)', color: '#3f3f46' }}>
                <Loader2 size={24} className="animate-spin" style={{ color: '#10b981' }} />
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--z-950)', overflow: 'hidden' }}>

            {/* ── Toolbar ───────────────────────────────── */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '0 16px',
                    height: 52,
                    flexShrink: 0,
                    background: 'var(--z-925)',
                    borderBottom: '1px solid rgba(255,255,255,0.07)',
                }}
            >
                {/* Title */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
                        <LayoutDashboard size={15} />
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#f4f4f5' }}>Kanban</span>
                </div>

                {/* Board selector */}
                {boards.length > 0 && (
                    <div style={{ position: 'relative', marginLeft: 4 }}>
                        <button
                            onClick={() => setShowBoardDrop(v => !v)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '6px 10px', borderRadius: 8,
                                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
                                color: '#a1a1aa', fontSize: 12.5, cursor: 'pointer',
                                fontFamily: 'var(--font-sans)',
                            }}
                        >
                            {activeBoard?.name || 'Selecionar board'}
                            {activeBoard?.isDefault && <span style={{ fontSize: 9, color: '#f59e0b' }}>★</span>}
                            <ChevronDown size={13} />
                        </button>
                        {showBoardDrop && (
                            <>
                                <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setShowBoardDrop(false)} />
                                <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, minWidth: 200, background: 'var(--z-850)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 10, boxShadow: '0 12px 40px rgba(0,0,0,0.6)', zIndex: 50, overflow: 'hidden', padding: 4 }}>
                                    {boards.map(b => (
                                        <button
                                            key={b.id}
                                            onClick={() => { switchBoard(b.id); setShowBoardDrop(false); }}
                                            style={{
                                                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                gap: 8, padding: '8px 10px', borderRadius: 7,
                                                background: activeBoard?.id === b.id ? 'rgba(255,255,255,0.05)' : 'transparent',
                                                border: 'none', color: activeBoard?.id === b.id ? '#f4f4f5' : '#a1a1aa',
                                                fontSize: 12.5, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)',
                                            }}
                                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                                            onMouseLeave={e => (e.currentTarget.style.background = activeBoard?.id === b.id ? 'rgba(255,255,255,0.05)' : 'transparent')}
                                        >
                                            <span>{b.name}</span>
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                {b.isDefault && <span style={{ fontSize: 9, color: '#f59e0b' }}>★</span>}
                                                {isAdmin && (
                                                    <button
                                                        onClick={e => { e.stopPropagation(); handleDeleteBoard(b.id); }}
                                                        aria-label={`Remover board ${b.name}`}
                                                        style={{ background: 'none', border: 'none', padding: 0, color: '#52525b', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                                        onMouseEnter={e => (e.currentTarget.style.color = '#fca5a5')}
                                                        onMouseLeave={e => (e.currentTarget.style.color = '#52525b')}
                                                    >
                                                        <Trash2 size={11} />
                                                    </button>
                                                )}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                )}

                <div style={{ flex: 1 }} />

                {/* Refresh */}
                <button
                    onClick={() => { if (activeBoard) api.get<Board>(`/kanban/boards/${activeBoard.id}`).then(r => setActiveBoard(r.data)); }}
                    aria-label="Atualizar board"
                    style={{ width: 32, height: 32, borderRadius: 8, background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: '#52525b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#a1a1aa'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = '#52525b'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
                >
                    <RefreshCw size={14} />
                </button>

                {isAdmin && activeBoard && (
                    <button
                        onClick={() => { setEditingCol(null); setColForm({ name: '', color: '#10b981', autoStatus: '', columnType: 'default' }); setShowColForm(true); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: '#a1a1aa', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
                    >
                        <Plus size={13} /> Coluna
                    </button>
                )}

                {isAdmin && (
                    <button
                        onClick={() => setShowBoardForm(true)}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, background: 'linear-gradient(135deg, var(--em-600), var(--em-500))', border: 'none', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', boxShadow: 'var(--shadow-em)', fontFamily: 'var(--font-sans)' }}
                    >
                        <Plus size={13} /> Novo Board
                    </button>
                )}
            </div>

            {/* ── Canvas ────────────────────────────────── */}
            <div style={{ flex: 1, overflow: 'auto', padding: '20px 20px' }}>
                {!activeBoard ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16 }}>
                        <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2a2a2e' }}>
                            <LayoutDashboard size={26} />
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#3f3f46' }}>Nenhum board criado</p>
                            {isAdmin && (
                                <button onClick={() => setShowBoardForm(true)} style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 9, background: 'linear-gradient(135deg, var(--em-600), var(--em-500))', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: 'var(--shadow-em)', fontFamily: 'var(--font-sans)' }}>
                                    <Plus size={14} /> Criar primeiro board
                                </button>
                            )}
                        </div>
                    </div>
                ) : (
                    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', height: '100%' }}>
                        {activeBoard.columns.map(col => (
                            <KanbanColumn
                                key={col.id}
                                column={col}
                                onDrop={handleDrop}
                                onTicketClick={t => setSelectedTicket(t)}
                                isAdmin={isAdmin}
                                onEdit={c => { setEditingCol(c); setColForm({ name: c.name, color: c.color, autoStatus: c.autoStatus || '', columnType: c.columnType }); setShowColForm(true); }}
                                onDelete={handleDeleteColumn}
                            />
                        ))}
                        {activeBoard.columns.length === 0 && isAdmin && (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', gap: 12, color: '#3f3f46' }}>
                                <p style={{ margin: 0, fontSize: 13 }}>Este board não tem colunas ainda.</p>
                                <button onClick={() => { setColForm({ name: '', color: '#10b981', autoStatus: '', columnType: 'default' }); setShowColForm(true); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, background: 'linear-gradient(135deg, var(--em-600), var(--em-500))', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: 'var(--shadow-em)', fontFamily: 'var(--font-sans)' }}>
                                    <Plus size={14} /> Adicionar Coluna
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── Board Modal ────────────────────────────── */}
            {showBoardForm && (
                <Modal title="Novo Board" onClose={() => setShowBoardForm(false)}>
                    <ModalField label="Nome do Board">
                        <input value={boardForm.name} onChange={e => setBoardForm({ ...boardForm, name: e.target.value })} placeholder="Ex: Atendimento Geral" style={inputBase} onFocus={e => (e.currentTarget.style.borderColor = 'rgba(16,185,129,0.35)')} onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)')} />
                    </ModalField>
                    <ModalField label="Descrição (opcional)">
                        <input value={boardForm.description} onChange={e => setBoardForm({ ...boardForm, description: e.target.value })} placeholder="Descrição..." style={inputBase} onFocus={e => (e.currentTarget.style.borderColor = 'rgba(16,185,129,0.35)')} onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)')} />
                    </ModalField>
                    <button onClick={handleCreateBoard} disabled={!boardForm.name.trim()} style={{ width: '100%', padding: '10px', borderRadius: 10, background: boardForm.name.trim() ? 'linear-gradient(135deg, var(--em-600), var(--em-500))' : 'rgba(255,255,255,0.05)', border: 'none', color: boardForm.name.trim() ? '#fff' : '#52525b', fontSize: 14, fontWeight: 700, cursor: boardForm.name.trim() ? 'pointer' : 'not-allowed', boxShadow: boardForm.name.trim() ? 'var(--shadow-em)' : 'none', fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                        <Save size={14} /> Criar Board
                    </button>
                </Modal>
            )}

            {/* ── Column Modal ───────────────────────────── */}
            {showColForm && (
                <Modal title={editingCol ? 'Editar Coluna' : 'Nova Coluna'} onClose={() => { setShowColForm(false); setEditingCol(null); }}>
                    <ModalField label="Nome">
                        <input value={colForm.name} onChange={e => setColForm({ ...colForm, name: e.target.value })} placeholder="Ex: Em revisão" style={inputBase} onFocus={e => (e.currentTarget.style.borderColor = 'rgba(16,185,129,0.35)')} onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)')} />
                    </ModalField>
                    <ModalField label="Cor">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <input type="color" value={colForm.color} onChange={e => setColForm({ ...colForm, color: e.target.value })} style={{ width: 40, height: 36, padding: 2, borderRadius: 8, border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.04)', cursor: 'pointer' }} />
                            <div style={{ width: 36, height: 36, borderRadius: 9, background: colForm.color, boxShadow: `0 0 16px ${colForm.color}60` }} />
                            <span style={{ fontSize: 12.5, color: '#71717a', fontFamily: 'monospace' }}>{colForm.color}</span>
                        </div>
                    </ModalField>
                    <ModalField label="Automação de Status">
                        <SelectField value={colForm.autoStatus} onChange={v => setColForm({ ...colForm, autoStatus: v })}>
                            <option value="">Nenhuma</option>
                            <option value="OPEN">Marcar como Aberto</option>
                            <option value="QUEUE">Mover para Fila</option>
                            <option value="CLOSED">Encerrar ticket</option>
                        </SelectField>
                        <p style={{ margin: '4px 0 0', fontSize: 11.5, color: '#52525b', lineHeight: 1.5 }}>Arrastar para esta coluna aplicará a mudança de status automaticamente.</p>
                    </ModalField>
                    <button onClick={handleSaveCol} disabled={!colForm.name.trim()} style={{ width: '100%', padding: '10px', borderRadius: 10, background: colForm.name.trim() ? 'linear-gradient(135deg, var(--em-600), var(--em-500))' : 'rgba(255,255,255,0.05)', border: 'none', color: colForm.name.trim() ? '#fff' : '#52525b', fontSize: 14, fontWeight: 700, cursor: colForm.name.trim() ? 'pointer' : 'not-allowed', boxShadow: colForm.name.trim() ? 'var(--shadow-em)' : 'none', fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                        <Save size={14} /> {editingCol ? 'Salvar' : 'Criar'}
                    </button>
                </Modal>
            )}

            {/* ── Confirm Dialogs ───────────────────────── */}
            <AlertDialog open={!!deleteBoardTarget} onOpenChange={open => !open && setDeleteBoardTarget(null)}>
                <AlertDialogContent style={{ background: 'var(--z-900)', border: '1px solid var(--border-md)', boxShadow: 'var(--shadow-xl)' }}>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-white">Remover board</AlertDialogTitle>
                        <AlertDialogDescription>Esta ação não pode ser desfeita. Os tickets serão desvinculados do board.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={confirmDeleteBoard}>Remover</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={!!deleteColTarget} onOpenChange={open => !open && setDeleteColTarget(null)}>
                <AlertDialogContent style={{ background: 'var(--z-900)', border: '1px solid var(--border-md)', boxShadow: 'var(--shadow-xl)' }}>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-white">Remover coluna</AlertDialogTitle>
                        <AlertDialogDescription>Esta ação não pode ser desfeita. Os tickets serão desvinculados da coluna.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={confirmDeleteColumn}>Remover</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* ── Ticket Sidebar ────────────────────────── */}
            {selectedTicket && (
                <div
                    style={{
                        position: 'fixed',
                        top: 0,
                        right: 0,
                        bottom: 0,
                        width: 340,
                        background: 'var(--z-900)',
                        borderLeft: '1px solid rgba(255,255,255,0.08)',
                        boxShadow: '-20px 0 60px rgba(0,0,0,0.5)',
                        display: 'flex',
                        flexDirection: 'column',
                        zIndex: 500,
                    }}
                >
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                        <div>
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#f4f4f5' }}>#{selectedTicket.protocol}</span>
                            <span style={{
                                marginLeft: 8, fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
                                background: selectedTicket.status === 'OPEN' ? 'rgba(16,185,129,0.12)' : selectedTicket.status === 'CLOSED' ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.06)',
                                color: selectedTicket.status === 'OPEN' ? '#34d399' : selectedTicket.status === 'CLOSED' ? '#fca5a5' : '#71717a',
                                border: `1px solid ${selectedTicket.status === 'OPEN' ? 'rgba(16,185,129,0.25)' : selectedTicket.status === 'CLOSED' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.08)'}`,
                            }}>
                                {selectedTicket.status}
                            </span>
                        </div>
                        <button onClick={() => setSelectedTicket(null)} aria-label="Fechar detalhes do ticket" style={{ width: 28, height: 28, borderRadius: 7, background: 'transparent', border: 'none', color: '#52525b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseEnter={e => (e.currentTarget.style.color = '#f4f4f5')} onMouseLeave={e => (e.currentTarget.style.color = '#52525b')}>
                            <X size={15} />
                        </button>
                    </div>

                    {/* Body */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                        {[
                            {
                                title: 'Contato', items: [
                                    ['Nome', selectedTicket.contact.fullName || selectedTicket.contact.name || '—'],
                                    ['Telefone', selectedTicket.contact.phone],
                                    ['Canal', selectedTicket.contact.channel === 'web_widget' ? '🌐 Web Widget' : '📱 WhatsApp'],
                                ],
                            },
                            {
                                title: 'Ticket', items: [
                                    ['Agente', selectedTicket.user?.name || '—'],
                                    ['Departamento', selectedTicket.department?.name || '—'],
                                    ['Criado', new Date(selectedTicket.createdAt).toLocaleDateString('pt-BR')],
                                ],
                            },
                        ].map(section => (
                            <div key={section.title} style={{ marginBottom: 16 }}>
                                <div style={{ fontSize: 10.5, fontWeight: 700, color: '#52525b', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>{section.title}</div>
                                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, overflow: 'hidden' }}>
                                    {section.items.map(([label, value], i) => (
                                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 12px', borderBottom: i < section.items.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                                            <span style={{ fontSize: 12, color: '#52525b' }}>{label}</span>
                                            <span style={{ fontSize: 12, color: '#d4d4d8', fontWeight: 500, textAlign: 'right' }}>{value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}

                        {selectedTicket.tags.length > 0 && (
                            <div style={{ marginBottom: 16 }}>
                                <div style={{ fontSize: 10.5, fontWeight: 700, color: '#52525b', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Tags</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                    {selectedTicket.tags.map(t => (
                                        <span key={t.tag.id} style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: t.tag.color + '20', color: t.tag.color, border: `1px solid ${t.tag.color}30` }}>
                                            {t.tag.name}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {selectedTicket.messages.length > 0 && (
                            <div>
                                <div style={{ fontSize: 10.5, fontWeight: 700, color: '#52525b', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Última Mensagem</div>
                                <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, fontSize: 12.5, color: '#71717a', lineHeight: 1.5 }}>
                                    {selectedTicket.messages[0].body || '[mídia]'}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div style={{ padding: '14px 16px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                        <button
                            onClick={() => { navigate('/chat'); setSelectedTicket(null); }}
                            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px', borderRadius: 10, background: 'linear-gradient(135deg, var(--em-600), var(--em-500))', border: 'none', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', boxShadow: 'var(--shadow-em)', fontFamily: 'var(--font-sans)' }}
                        >
                            <MessageSquare size={15} /> Abrir Chat
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
