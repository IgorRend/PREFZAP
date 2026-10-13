import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { useTicketStore } from '../store/ticketStore';
import { useAuthStore } from '../store/authStore';
import api from '../services/api';
import {
    Search, Send, X, ChevronDown, UserPlus, XCircle, ArrowRightLeft,
    MessageSquare, AlertTriangle, StickyNote, Lock, Tag, Plus, FileText, Paperclip,
    Smile, Trash2, MoreVertical, Archive, Pin, BellOff, Slash,
    BarChart2, MapPin, User, List, Clock, MoreHorizontal, Bot
} from 'lucide-react';
import TemplateSelector from '../components/TemplateSelector';
import ContactProfileDrawer from '../components/ContactProfileDrawer';
import MergeContactModal from '../components/MergeContactModal';
import AudioPlayer from '../components/AudioPlayer';
import Avatar from '../components/Avatar';
import { ChatSkeleton } from '../components/ChatSkeleton';
import { getSocket } from '../services/socket';
import { useToast } from '../hooks/useToast';
import { useDictionary } from '../contexts/DictionaryContext';

const MAX_FILE_BYTES = 64 * 1024 * 1024; // 64 MB

// ─── Types ───────────────────────────────────────────────
interface TimelineMessage {
    id: string;
    body?: string;
    mediaUrl?: string;
    mediaType?: string;
    origin: 'AGENT' | 'BOT' | 'CONTACT' | 'SYSTEM';
    isInternal?: boolean;
    senderName?: string;
    userId?: string;
    createdAt: string;
    ticketId: string;
    whatsappMessageId?: string;
    emoji?: string;
    ticket?: { id: string; protocol: string; status: string; closedAt?: string };
    user?: { id: string; name: string };
}

interface QuickReply { id: string; shortcut: string; message: string; }
interface TagData { id: string; name: string; color: string; }

const statusLabels: Record<string, { label: string; class: string }> = {
    BOT: { label: 'Bot', class: 'badge-blue' },
    QUEUE: { label: 'Fila', class: 'badge-yellow' },
    OPEN: { label: 'Aberto', class: 'badge-green' },
    CLOSED: { label: 'Fechado', class: 'badge-gray' },
    PENDING_NPS: { label: 'NPS', class: 'badge-yellow' },
};

// ─── Ticket Divider ───────────────────────────────────────
function TicketDivider({ protocol, closedAt, status }: { protocol: string; closedAt?: string; status: string }) {
    const label = status === 'CLOSED' && closedAt
        ? `Protocolo #${protocol} · Encerrado em ${new Date(closedAt).toLocaleDateString('pt-BR')}`
        : `Protocolo #${protocol} · ${status}`;
    return (
        <div className="flex items-center gap-2.5 my-4 px-2.5">
            <div className="flex-1 h-px bg-[var(--border)]" />
            <span className="text-[10px] font-semibold text-[var(--text-secondary)] whitespace-nowrap px-2.5 py-0.5 bg-[var(--bg-secondary)] rounded-full border border-[var(--border)]">
                {label}
            </span>
            <div className="flex-1 h-px bg-[var(--border)]" />
        </div>
    );
}

// ─── Message Bubble ───────────────────────────────────────
const MessageBubble = React.memo(function MessageBubble({ msg, agentLabel }: { msg: TimelineMessage; agentLabel: string }) {
    const [isHovered, setIsHovered] = useState(false);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [pickerPos, setPickerPos] = useState({ top: 0, right: 0, left: 0, anchor: 'left' as 'left' | 'right' });
    const emojiButtonRef = useRef<HTMLButtonElement>(null);

    const isInternal = msg.isInternal;
    const isOutgoing = msg.origin === 'AGENT' || msg.origin === 'BOT';
    const isSystem = msg.origin === 'SYSTEM';

    const justify = isSystem ? 'center' : isOutgoing ? 'flex-end' : 'flex-start';
    const bg = isInternal ? 'rgba(251,191,36,0.15)'
        : isSystem ? 'var(--bg-bubble-system)'
            : isOutgoing ? (msg.origin === 'BOT' ? 'var(--bg-bubble-bot)' : 'var(--bg-bubble-outgoing)')
                : 'var(--bg-bubble-incoming)';

    const senderLabel = msg.senderName || (msg.origin === 'BOT' ? '🤖 Bot' : agentLabel);

    // ── Media renderer ──────────────────────────────────
    const renderMedia = () => {
        if (!msg.mediaUrl) return null;
        const mt = msg.mediaType || '';
        if (mt === 'audio') {
            return <AudioPlayer src={msg.mediaUrl} isOutgoing={isOutgoing} />;
        }
        if (mt === 'image') {
            return (
                <a href={msg.mediaUrl} target="_blank" rel="noreferrer">
                    <img src={msg.mediaUrl} alt="imagem" style={{ maxWidth: '100%', borderRadius: 8, marginBottom: 4, display: 'block', maxHeight: 240, objectFit: 'cover', cursor: 'pointer' }} />
                </a>
            );
        }
        if (mt === 'video') {
            return <video src={msg.mediaUrl} controls style={{ maxWidth: '100%', borderRadius: 8, marginBottom: 4, maxHeight: 200 }} />;
        }
        if (mt === 'sticker') {
            return (
                <img src={msg.mediaUrl} alt="figurinha" style={{ width: 120, height: 120, objectFit: 'contain', display: 'block', marginBottom: 4 }} />
            );
        }
        // document / other
        return (
            <a href={msg.mediaUrl} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: 'rgba(0,0,0,0.08)', borderRadius: 8, fontSize: 12, color: 'var(--accent)', textDecoration: 'none', marginBottom: 4 }}>
                <FileText size={16} /> {msg.body || 'Arquivo'}
            </a>
        );
    };

    // ── Interactive message renderers ────────────────────
    const renderButtonsMessage = (body: string) => {
        const lines = body.split('\n');
        const text = lines[0].replace(/^\[Botões\]\s*/i, '');
        const btnLine = lines.slice(1).join('\n');
        const btnLabels = Array.from(btnLine.matchAll(/\[([^\]]+)\]/g)).map(m => m[1]);
        return (
            <div>
                {text && <div style={{ overflowWrap: 'break-word', whiteSpace: 'pre-wrap', marginBottom: btnLabels.length ? 10 : 0 }}>{text}</div>}
                {btnLabels.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {btnLabels.map((label, i) => (
                            <div key={i} style={{
                                padding: '7px 12px', borderRadius: 8, fontSize: 13, fontWeight: 500, textAlign: 'center',
                                background: isOutgoing ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.07)',
                                border: '1px solid rgba(99,102,241,0.35)', color: '#818cf8', cursor: 'default',
                            }}>
                                {label}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    const renderListMessage = (body: string) => {
        const lines = body.split('\n');
        const text = lines[0].replace(/^\[Lista\]\s*/i, '');
        const meta = lines.slice(1).join(' ');
        return (
            <div>
                {text && <div style={{ overflowWrap: 'break-word', whiteSpace: 'pre-wrap', marginBottom: 8 }}>{text}</div>}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    padding: '7px 12px', borderRadius: 8, fontSize: 13, fontWeight: 500,
                    background: isOutgoing ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.07)',
                    border: '1px solid rgba(251,146,60,0.35)', color: '#fb923c',
                }}>
                    <List size={14} />
                    {meta || 'Ver opções'}
                </div>
            </div>
        );
    };

    const renderPollMessage = (body: string) => {
        const lines = body.replace(/^\[Enquete\]\s*/i, '').split('\n');
        const question = lines[0] || '';
        const options = lines.slice(1).filter(l => /^\d+\./.test(l));
        return (
            <div>
                <div style={{ fontWeight: 600, marginBottom: 8, overflowWrap: 'break-word' }}>{question}</div>
                {options.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {options.map((opt, i) => (
                            <div key={i} style={{
                                padding: '6px 10px', borderRadius: 8, fontSize: 12.5,
                                background: isOutgoing ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                                border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-primary)',
                            }}>
                                {opt}
                            </div>
                        ))}
                    </div>
                )}
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>Enquete · toque para votar</div>
            </div>
        );
    };

    const renderLocationMessage = (body: string) => {
        const text = body.replace(/^📍\s*/u, '');
        const parts = text.split(':');
        const name = parts[0]?.trim() || 'Localização';
        const coords = parts[1]?.trim() || '';
        return (
            <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <MapPin size={14} color="#ef4444" />
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{name}</span>
                </div>
                {coords && <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginBottom: 6 }}>{coords}</div>}
                <a href={`https://maps.google.com/?q=${encodeURIComponent(coords || name)}`} target="_blank" rel="noreferrer"
                    style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>
                    Abrir no Mapa →
                </a>
            </div>
        );
    };

    const renderContactMessage = (body: string) => {
        const text = body.replace(/^👤\s*Contato:\s*/u, '');
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <User size={18} color="#818cf8" />
                </div>
                <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{text}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Contato compartilhado</div>
                </div>
            </div>
        );
    };

    // ── Body content selector ────────────────────────────
    const mt = msg.mediaType || '';
    const renderBody = () => {
        if (mt === 'buttons' && msg.body) return renderButtonsMessage(msg.body);
        if (mt === 'list' && msg.body) return renderListMessage(msg.body);
        if (mt === 'poll' && msg.body) return renderPollMessage(msg.body);
        if (mt === 'location' && msg.body) return renderLocationMessage(msg.body);
        if (mt === 'contact' && msg.body) return renderContactMessage(msg.body);
        // Show text for plain messages, audio, and as a caption under image/video.
        // Documents render their filename inside their own bubble, so skip here.
        if (msg.body && (!msg.mediaUrl || mt === 'audio' || mt === 'image' || mt === 'video')) {
            return <div style={{ overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }}>{msg.body}</div>;
        }
        return null;
    };

    return (
        <div className="animate-fadeIn"
            style={{ display: 'flex', justifyContent: justify, marginBottom: 6, minWidth: 'fit-content' }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => { setIsHovered(false); setShowEmojiPicker(false); }}
        >
            <div style={{
                position: 'relative',
                maxWidth: isSystem ? '80%' : '65%',
                padding: isSystem ? '5px 16px' : '8px 14px 6px',
                borderRadius: isSystem ? 8 : 10,
                background: bg, fontSize: isSystem ? 11 : 13.5, lineHeight: 1.45,
                color: isSystem ? 'var(--text-secondary)' : 'var(--text-primary)',
                fontStyle: isSystem ? 'italic' : 'normal',
                border: isInternal ? '1px solid rgba(251,191,36,0.3)'
                    : (isOutgoing && !isSystem) ? '1px solid var(--bg-bubble-outgoing-border)'
                    : 'none',
            }}>
                {/* sender label row */}
                {!isSystem && (
                    <div style={{ fontSize: 10, fontWeight: 600, marginBottom: 2 }}>
                        {isInternal ? (
                            <span style={{ color: '#d97706', display: 'flex', alignItems: 'center', gap: 3 }}>
                                <Lock size={9} /> Nota Interna {msg.senderName ? `· ${msg.senderName}` : ''}
                            </span>
                        ) : msg.origin === 'CONTACT' ? null : (
                            <span style={{ color: msg.origin === 'BOT' ? '#34d399' : 'var(--accent)' }}>
                                {senderLabel}
                            </span>
                        )}
                    </div>
                )}
                {/* Media (images, video, audio, documents) */}
                {renderMedia()}
                {/* Structured / text body */}
                {renderBody()}
                {!isSystem && (
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', textAlign: 'right', marginTop: 2 }}>
                        {new Date(msg.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                )}
                {/* Reaction badge */}
                {msg.emoji && (
                    <div style={{
                        position: 'absolute', bottom: -8, right: isOutgoing ? 0 : -8, left: isOutgoing ? -8 : 'auto',
                        background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: '2px 4px',
                        fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)', zIndex: 2
                    }}>
                        {msg.emoji}
                    </div>
                )}
            </div>

            {/* Hover Actions */}
            {!isSystem && isHovered && msg.whatsappMessageId && (
                <div style={{ 
                    display: 'flex', gap: 4, alignItems: 'center', 
                    marginLeft: isOutgoing ? 0 : 8, marginRight: isOutgoing ? 8 : 0,
                    order: isOutgoing ? -1 : 1, alignSelf: 'center'
                }}>
                    <div>
                        <button ref={emojiButtonRef} className="btn-ghost" style={{ padding: 6, borderRadius: '50%', background: 'var(--bg-secondary)', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }} onClick={() => {
                            if (!showEmojiPicker && emojiButtonRef.current) {
                                const rect = emojiButtonRef.current.getBoundingClientRect();
                                setPickerPos({ top: rect.top, left: rect.left, right: window.innerWidth - rect.right, anchor: isOutgoing ? 'right' : 'left' });
                            }
                            setShowEmojiPicker(prev => !prev);
                        }}>
                            <Smile size={14} color="var(--text-secondary)" />
                        </button>
                        {showEmojiPicker && createPortal(
                            <>
                            <div style={{ position: 'fixed', inset: 0, zIndex: 199 }} onClick={() => setShowEmojiPicker(false)} />
                            <div style={{ position: 'fixed', top: pickerPos.top, ...(pickerPos.anchor === 'right' ? { right: pickerPos.right } : { left: pickerPos.left }), transform: 'translateY(-100%) translateY(-8px)', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 20, padding: '4px 8px', display: 'flex', gap: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 200 }}>
                                {['👍','❤️','😂','😮','😢','🙏'].map(emoji => (
                                    <span key={emoji} style={{ cursor: 'pointer', fontSize: 16, transition: 'transform 0.1s' }}
                                        onClick={async () => {
                                            setShowEmojiPicker(false);
                                            try { await api.post(`/messages/${msg.ticketId}/send`, { type: 'reaction', messageId: msg.whatsappMessageId, emoji }); } catch {}
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.2)'}
                                        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                                    >{emoji}</span>
                                ))}
                            </div>
                            </>,
                            document.body
                        )}
                    </div>
                    {isOutgoing && (
                        showDeleteConfirm ? (
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                <button className="btn btn-danger btn-sm" style={{ fontSize: 11, padding: '4px 8px' }} onClick={async () => {
                                    setShowDeleteConfirm(false);
                                    try { await api.delete(`/messages/${msg.id}`); } catch {}
                                }}>Excluir</button>
                                <button className="btn-ghost" style={{ padding: 4 }} onClick={() => setShowDeleteConfirm(false)}>
                                    <X size={12} />
                                </button>
                            </div>
                        ) : (
                            <button className="btn-ghost" style={{ padding: 6, borderRadius: '50%', background: 'var(--bg-secondary)', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}
                                onClick={() => setShowDeleteConfirm(true)}>
                                <Trash2 size={14} color="#ef4444" />
                            </button>
                        )
                    )}
                </div>
            )}
        </div>
    );
});

// ─── Main Chat Component ─────────────────────────────────
export default function Chat() {
    const { tickets, selectedTicket, messages, fetchTickets, selectTicket, sendMessage,
        assignTicket, closeTicket, transferTicket, fetchWindowStatus, windowStatus, windowLoading,
        setupSocketListeners, slaBreachedIds } = useTicketStore();
    const user = useAuthStore(s => s.user);
    const { t } = useDictionary();
    const { showToast, ToastContainer } = useToast(2000);

    const [msgInput, setMsgInput] = useState('');
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('ACTIVE');
    const [mineOnly, setMineOnly] = useState(false);
    const [departments, setDepartments] = useState<any[]>([]);
    const [showTransfer, setShowTransfer] = useState(false);
    const [showChatMenu, setShowChatMenu] = useState(false);
    const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
    const [showQuickReplies, setShowQuickReplies] = useState(false);
    const [qrFilter, setQrFilter] = useState('');
    const [noteMode, setNoteMode] = useState(false);
    const [allTags, setAllTags] = useState<TagData[]>([]);
    const [ticketTags, setTicketTags] = useState<TagData[]>([]);
    const [showTagPicker, setShowTagPicker] = useState(false);
    const [searchParams, setSearchParams] = useSearchParams();

    // ─── Character limit ───────────────────────────────────
    // WhatsApp text messages are limited to 4096 chars server-side;
    // We use 1024 as a practical UX guardrail for quality messaging.
    const WHATSAPP_MAX_CHARS = 1024;
    const charCount = msgInput.length;
    const isOverLimit = charCount > WHATSAPP_MAX_CHARS;

    // ─── Timeline state ───────────────────────────────────
    const [timeline, setTimeline] = useState<TimelineMessage[]>([]);
    const [timelinePage, setTimelinePage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const topSentinelRef = useRef<HTMLDivElement>(null);
    const chatAreaRef = useRef<HTMLDivElement>(null);

    // ─── Merge modal state ────────────────────────────────
    const [showMerge, setShowMerge] = useState(false);
    const [contactVersion, setContactVersion] = useState(0); // bump to reload drawer

    // ─── File Upload (paste / drag-drop) state ──────────
    const [pendingFiles, setPendingFiles] = useState<File[]>([]);
    const [previewUrls, setPreviewUrls] = useState<(string | null)[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const chatInputAreaRef = useRef<HTMLDivElement>(null);

    // Cleanup on unmount: clear pending files and dragging state
    useEffect(() => {
        return () => {
            setPendingFiles([]);
            setIsDragging(false);
        };
    }, []);

    // Create object URLs only when pendingFiles changes, revoke on every change and on unmount.
    // Without this, URL.createObjectURL() inside a render-time map creates a new URL on every
    // re-render (including every keystroke) and never releases them, leaking memory across a shift.
    useEffect(() => {
        const urls = pendingFiles.map(file =>
            file.type.startsWith('image/') ? URL.createObjectURL(file) : null
        );
        setPreviewUrls(urls);
        return () => {
            urls.forEach(url => { if (url) URL.revokeObjectURL(url); });
        };
    }, [pendingFiles]);

    // ─── Interactive Message Modals & Action Menu ────────
    const [showActionMenu, setShowActionMenu] = useState(false);
    const [showBlockConfirm, setShowBlockConfirm] = useState(false);
    const [showPollModal, setShowPollModal] = useState(false);
    const [showLocationModal, setShowLocationModal] = useState(false);
    const [showContactModal, setShowContactModal] = useState(false);

    // Poll modal states
    const [pollQuestion, setPollQuestion] = useState('');
    const [pollOptions, setPollOptions] = useState<{ id: string; text: string }[]>([
        { id: 'po-1', text: '' }, { id: 'po-2', text: '' },
    ]);

    // Location modal states
    const [locLatitude, setLocLatitude] = useState('');
    const [locLongitude, setLocLongitude] = useState('');
    const [locName, setLocName] = useState('');
    const [locAddress, setLocAddress] = useState('');

    // Contact modal states
    const [contactFullName, setContactFullName] = useState('');
    const [contactPhone, setContactPhone] = useState('');

    // ─── Smart Scroll ───────────────────────────────────────
    // isAtBottomRef: true when user is within 80px of the bottom.
    // Auto-scroll only fires when user is already at the bottom —
    // prevents the chat from "jumping" while the agent reads history.
    const isAtBottomRef = useRef(true);
    const [unreadBelow, setUnreadBelow] = useState(0); // badge count while scrolled up

    useEffect(() => {
        const el = chatAreaRef.current;
        if (!el) return;
        const onScroll = () => {
            const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            isAtBottomRef.current = atBottom;
            if (atBottom) setUnreadBelow(0); // clear badge when scrolling down
        };
        el.addEventListener('scroll', onScroll, { passive: true });
        return () => el.removeEventListener('scroll', onScroll);
    }, [selectedTicket?.id]);

    // ─── Typing Indicator ──────────────────────────────────
    // Listens to socket events 'contact:typing' (backend) and
    // 'typing_on' (raw Meta webhook) for the currently open ticket.
    // Auto-clears after 3 seconds of silence.
    const [contactTyping, setContactTyping] = useState(false);
    const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const socket = getSocket();
        if (!socket || !selectedTicket) return;

        const showTyping = (data: { ticketId?: string }) => {
            if (data?.ticketId && data.ticketId !== selectedTicket.id) return;
            setContactTyping(true);
            if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
            typingTimerRef.current = setTimeout(() => setContactTyping(false), 3000);
        };
        const hideTyping = (data: { ticketId?: string }) => {
            if (data?.ticketId && data.ticketId !== selectedTicket.id) return;
            setContactTyping(false);
            if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        };

        socket.on('contact:typing', showTyping);
        socket.on('typing_on', showTyping);         // Meta webhook raw event
        socket.on('contact:stop-typing', hideTyping);
        socket.on('typing_off', hideTyping);
        
        const reloadTags = (data: { ticketId: string }) => {
            if (data.ticketId === selectedTicket.id) {
                api.get(`/tags/ticket/${selectedTicket.id}`).then(r => setTicketTags(r.data)).catch(() => {});
            }
        };
        socket.on('tag:updated', reloadTags);

        return () => {
            socket.off('contact:typing', showTyping);
            socket.off('typing_on', showTyping);
            socket.off('contact:stop-typing', hideTyping);
            socket.off('typing_off', hideTyping);
            socket.off('tag:updated', reloadTags);
            if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
            setContactTyping(false);
        };
    }, [selectedTicket?.id]);

    // Busca no backend ao montar e sempre que o filtro de status muda,
    // para que os 50 tickets carregados sejam os do filtro (ex.: só Ativos).
    useEffect(() => {
        fetchTickets(statusFilter ? { status: statusFilter } : {});
    }, [statusFilter]);

    useEffect(() => {
        setupSocketListeners();
        api.get('/departments').then(r => setDepartments(r.data)).catch(() => { });
        api.get('/quick-replies').then(r => setQuickReplies(r.data)).catch(() => { });
        api.get('/tags').then(r => setAllTags(r.data)).catch(() => { });

        // ─── Ctrl+Shift+N ───────────────────────────────────
        // Global keyboard shortcut: toggle note mode without mouse.
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'N') {
                e.preventDefault();
                setNoteMode(prev => !prev);
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, []);

    // ─── Draft persistence ────────────────────────────────
    const prevTicketIdRef = useRef<string | null>(null);
    const [hasDraft, setHasDraft] = useState(false);

    // Save draft to localStorage on every keystroke
    useEffect(() => {
        if (!selectedTicket) return;
        const key = `draft:${selectedTicket.id}`;
        if (msgInput) {
            localStorage.setItem(key, msgInput);
            setHasDraft(true);
        } else {
            localStorage.removeItem(key);
            setHasDraft(false);
        }
    }, [msgInput, selectedTicket?.id]);

    // Restore draft when ticket changes
    useEffect(() => {
        const prevId = prevTicketIdRef.current;
        const currId = selectedTicket?.id || null;
        if (prevId === currId) return;
        prevTicketIdRef.current = currId;
        if (currId) {
            const saved = localStorage.getItem(`draft:${currId}`) || '';
            setMsgInput(saved);
            setHasDraft(!!saved);
        } else {
            setMsgInput('');
            setHasDraft(false);
        }
    }, [selectedTicket?.id]);

    // Auto-select ticket from ?ticketId= URL param (from Command Palette)
    useEffect(() => {
        const targetId = searchParams.get('ticketId');
        if (!targetId || tickets.length === 0) return;
        const found = tickets.find(t => t.id === targetId);
        if (found) {
            selectTicket(found);
            setSearchParams({}, { replace: true });
        }
    }, [searchParams, tickets]);

    // ─── Smart auto-scroll on new timeline messages ─────
    // Only scrolls if user is already at the bottom. When they're
    // reading history, new arrivals increment unreadBelow instead.
    const prevTimelineLengthRef = useRef(0);
    useEffect(() => {
        const prev = prevTimelineLengthRef.current;
        const curr = timeline.length;
        prevTimelineLengthRef.current = curr;

        if (curr <= prev) return; // history prepend — don't scroll

        if (isAtBottomRef.current) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            setUnreadBelow(0);
        } else {
            // New messages arrived while user is reading history
            const newCount = curr - prev;
            setUnreadBelow(n => n + newCount);
        }
    }, [timeline.length]);


    // ─── File validation helper ────────────────────────
    const addFiles = useCallback((files: FileList | File[]) => {
        const arr = Array.from(files);
        const oversized = arr.find(f => f.size > MAX_FILE_BYTES);
        if (oversized) {
            setUploadError(`O arquivo "${oversized.name}" excede o limite máximo de 64MB.`);
            setTimeout(() => setUploadError(null), 4000);
            return;
        }
        setPendingFiles(prev => [...prev, ...arr]);
    }, []);

    // ─── Paste listener ────────────────────────────────
    const handlePaste = useCallback((e: ClipboardEvent) => {
        if (!selectedTicket || selectedTicket.status === 'CLOSED') return;
        const files = e.clipboardData?.files;
        if (files && files.length > 0) {
            e.preventDefault();
            addFiles(files);
        }
    }, [selectedTicket, addFiles]);

    useEffect(() => {
        document.addEventListener('paste', handlePaste);
        return () => document.removeEventListener('paste', handlePaste);
    }, [handlePaste]);

    // ─── File upload sender ────────────────────────────
    const handleUploadFiles = useCallback(async () => {
        if (!selectedTicket || pendingFiles.length === 0) return;
        setUploading(true);
        // The text box doubles as the caption. Like WhatsApp, the caption goes on
        // the first attachment only; the rest are sent without a caption.
        const caption = msgInput.trim();
        for (let i = 0; i < pendingFiles.length; i++) {
            const file = pendingFiles[i];
            const form = new FormData();
            if (i === 0 && caption) form.append('caption', caption);
            form.append('file', file);
            try {
                await api.post(`/messages/${selectedTicket.id}/media`, form, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
            } catch (err: any) {
                const msg = err?.response?.data?.error || 'Erro ao enviar arquivo.';
                setUploadError(msg);
                setTimeout(() => setUploadError(null), 4000);
            }
        }
        // Clear the caption we just sent, along with any saved draft.
        if (caption) {
            setMsgInput('');
            setHasDraft(false);
            localStorage.removeItem(`draft:${selectedTicket.id}`);
        }
        setPendingFiles([]);
        setUploading(false);
    }, [selectedTicket, pendingFiles, msgInput]);

    // Live message appending from socket
    const prevMessagesLenRef = useRef(0);
    useEffect(() => {
        const prev = prevMessagesLenRef.current;
        const curr = messages.length;
        prevMessagesLenRef.current = curr;
        // Only append when a new message actually arrives (length grew), not on ticket switch reset
        if (curr <= prev || !selectedTicket) return;
        const lastMsg = messages[curr - 1];
        setTimeline(tl => {
            if (tl.find(m => m.id === lastMsg.id)) return tl;
            return [...tl, lastMsg as unknown as TimelineMessage];
        });
    }, [messages.length]);

    // Load tags when ticket changes
    useEffect(() => {
        if (selectedTicket) {
            api.get(`/tags/ticket/${selectedTicket.id}`).then(r => setTicketTags(r.data)).catch(() => setTicketTags([]));
        } else {
            setTicketTags([]); setTimeline([]); setTimelinePage(1); setHasMore(false);
        }
    }, [selectedTicket?.id]);

    // Load timeline when ticket selected
    useEffect(() => {
        if (selectedTicket?.contact?.id) {
            loadTimeline(1);
        }
    }, [selectedTicket?.id]);

    // Auto-refresh window status every 60s
    useEffect(() => {
        if (!selectedTicket) return;
        const interval = setInterval(() => {
            fetchWindowStatus(selectedTicket.id);
        }, 60_000);
        return () => clearInterval(interval);
    }, [selectedTicket?.id]);

    // Upward infinite scroll observer
    useEffect(() => {
        if (!topSentinelRef.current) return;
        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting && hasMore && !loadingMore) {
                loadMore();
            }
        }, { threshold: 0.1 });
        observer.observe(topSentinelRef.current);
        return () => observer.disconnect();
    }, [hasMore, loadingMore, timelinePage, selectedTicket?.id]);

    // Quick replies autocomplete
    useEffect(() => {
        if (msgInput.startsWith('/') && !noteMode) {
            setQrFilter(msgInput.slice(1).toLowerCase());
            setShowQuickReplies(true);
        } else {
            setShowQuickReplies(false);
        }
    }, [msgInput, noteMode]);

    async function loadTimeline(page: number) {
        if (!selectedTicket?.contact?.id) return;
        // Capture the ticket identity at the moment the request is issued.
        // If the user switches tickets before the response arrives, we discard
        // the stale result rather than overwriting the new ticket's timeline.
        const requestedContactId = selectedTicket.contact.id;
        const requestedTicketId = selectedTicket.id;
        setLoadingMore(true);
        try {
            const { data } = await api.get(`/contacts/${requestedContactId}/timeline?page=${page}&limit=50`);
            // Discard if the user has already switched to a different ticket.
            if (selectedTicket?.id !== requestedTicketId) return;
            if (page === 1) {
                setTimeline(data.messages);
                setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'auto' }), 100);
            } else {
                const prevScrollHeight = chatAreaRef.current?.scrollHeight || 0;
                setTimeline(prev => [...data.messages, ...prev]);
                setTimeout(() => {
                    if (chatAreaRef.current) {
                        const newScrollHeight = chatAreaRef.current.scrollHeight;
                        chatAreaRef.current.scrollTop = newScrollHeight - prevScrollHeight;
                    }
                }, 50);
            }
            setHasMore(data.hasMore);
            setTimelinePage(page);
        } catch { }
        finally { setLoadingMore(false); }
    }

    const loadMore = useCallback(() => {
        if (!loadingMore && hasMore) loadTimeline(timelinePage + 1);
    }, [loadingMore, hasMore, timelinePage, selectedTicket?.id]);

    // ─── Render timeline with dividers ────────────────────
    // Memoized so the element array is only rebuilt when the timeline data or
    // translation function changes — not on every keystroke or unrelated state update.
    const renderedTimeline = useMemo(() => {
        const items: React.ReactElement[] = [];
        let lastTicketId: string | null = null;

        timeline.forEach(msg => {
            const tid = msg.ticket?.id || msg.ticketId;
            if (tid !== lastTicketId) {
                if (lastTicketId !== null && msg.ticket) {
                    const prevMsg = timeline.find(m => (m.ticket?.id || m.ticketId) === lastTicketId);
                    if (prevMsg?.ticket) {
                        items.push(
                            <TicketDivider
                                key={`div-${lastTicketId}`}
                                protocol={prevMsg.ticket.protocol}
                                closedAt={prevMsg.ticket.closedAt}
                                status={prevMsg.ticket.status}
                            />
                        );
                    }
                }
                lastTicketId = tid;
            }
            items.push(
                <MessageBubble key={msg.id} msg={msg} agentLabel={t('AGENT_LABEL')} />
            );
        });

        return items;
    }, [timeline, t]);

    const filteredQR = useMemo(() =>
        quickReplies.filter(qr =>
            qr.shortcut.toLowerCase().includes(qrFilter) || qr.message.toLowerCase().includes(qrFilter)
        )
    , [quickReplies, qrFilter]);

    const selectQuickReply = (qr: QuickReply) => { setMsgInput(qr.message); setShowQuickReplies(false); };

    const handleSend = async () => {
        if (!msgInput.trim() || !selectedTicket || isOverLimit) return;
        const draft = msgInput.trim();
        const draftKey = `draft:${selectedTicket.id}`;

        // Optimistically clear the input for zero-friction UX
        setMsgInput('');
        setHasDraft(false);

        if (noteMode) {
            try {
                await api.post(`/messages/${selectedTicket.id}/note`, { body: draft });
                localStorage.removeItem(draftKey);
                showToast('Nota interna salva ✓', 'info');
                // No optimistic push here; we rely on the 'message:new' socket event
            } catch (err) {
                console.error('Note failed:', err);
                showToast('Falha ao salvar nota', 'error');
                setMsgInput(draft); // restore on failure
            }
        } else {
            try {
                await sendMessage(selectedTicket.id, draft);
                localStorage.removeItem(draftKey);
                showToast('Mensagem enviada ✓', 'success');
                // No optimistic push here; we rely on the 'message:new' socket event
            } catch (err) {
                console.error('Send failed:', err);
                showToast('Falha no envio. Tente novamente.', 'error');
                setMsgInput(draft); // restore on failure
            }
        }
    };

    const handleSendPoll = async () => {
        if (!selectedTicket || !pollQuestion.trim()) return;
        const validOptions = pollOptions.map(o => o.text.trim()).filter(o => o !== '');
        if (validOptions.length < 2) {
            showToast('Enquetes precisam de pelo menos 2 opções válidas', 'error');
            return;
        }

        try {
            await api.post(`/messages/${selectedTicket.id}/send`, {
                type: 'poll',
                question: pollQuestion.trim(),
                options: validOptions,
                selectableCount: 1
            });
            showToast('Enquete enviada ✓', 'success');
            setShowPollModal(false);
            setPollQuestion('');
            setPollOptions([{ id: 'po-1', text: '' }, { id: 'po-2', text: '' }]);
        } catch (err) {
            console.error('Send poll failed:', err);
            showToast('Erro ao enviar enquete', 'error');
        }
    };

    const handleSendLocation = async () => {
        if (!selectedTicket || !locLatitude || !locLongitude) return;
        const lat = parseFloat(locLatitude);
        const lng = parseFloat(locLongitude);
        if (isNaN(lat) || isNaN(lng)) {
            showToast('Latitude e longitude devem ser números válidos', 'error');
            return;
        }

        try {
            await api.post(`/messages/${selectedTicket.id}/send`, {
                type: 'location',
                latitude: lat,
                longitude: lng,
                name: locName.trim() || undefined,
                address: locAddress.trim() || undefined
            });
            showToast('Localização enviada ✓', 'success');
            setShowLocationModal(false);
            setLocLatitude('');
            setLocLongitude('');
            setLocName('');
            setLocAddress('');
        } catch (err) {
            console.error('Send location failed:', err);
            showToast('Erro ao enviar localização', 'error');
        }
    };

    const handleSendContact = async () => {
        if (!selectedTicket || !contactFullName.trim() || !contactPhone.trim()) return;
        const phone = contactPhone.trim().replace(/\D/g, ''); // strip non-digits

        try {
            await api.post(`/messages/${selectedTicket.id}/send`, {
                type: 'contact',
                contacts: [{
                    fullName: contactFullName.trim(),
                    phoneNumber: phone,
                    wuid: `${phone}@c.us`
                }]
            });
            showToast('Contato enviado ✓', 'success');
            setShowContactModal(false);
            setContactFullName('');
            setContactPhone('');
        } catch (err) {
            console.error('Send contact failed:', err);
            showToast('Erro ao enviar contato', 'error');
        }
    };

    const handleTagAssign = async (tagId: string) => {
        if (!selectedTicket) return;
        try {
            await api.post(`/tags/ticket/${selectedTicket.id}`, { tagId });
            const { data } = await api.get(`/tags/ticket/${selectedTicket.id}`);
            setTicketTags(data); setShowTagPicker(false);
        } catch { }
    };

    const handleTagRemove = async (tagId: string) => {
        if (!selectedTicket) return;
        try {
            await api.delete(`/tags/ticket/${selectedTicket.id}/${tagId}`);
            setTicketTags(prev => prev.filter(t => t.id !== tagId));
        } catch { }
    };

    const filteredTickets = useMemo(() => tickets.filter(t => {
        // Contextual Routing
        if (user && user.role !== 'ADMIN' && !user.isSuperAdmin) {
            // Agent sees their own tickets AND every ticket in their departments —
            // including those assigned to a colleague (active or closed). Visibility
            // is team-wide within the sector; reply access is gated separately.
            const agentDeptIds = (user.departments ?? []).map((d) => d.departmentId);

            const isMine = t.user?.id === user.id;
            const inMyDept = t.department?.id ? agentDeptIds.includes(t.department.id) : true;

            if (!isMine && !inMyDept) {
                return false;
            }
        }

        if (mineOnly && t.user?.id !== user?.id) return false;
        if (statusFilter === 'ACTIVE') {
            if (!['OPEN', 'QUEUE', 'BOT'].includes(t.status)) return false;
        } else if (statusFilter && t.status !== statusFilter) return false;
        if (search) {
            const q = search.toLowerCase();
            return t.contact.name?.toLowerCase().includes(q) || t.contact.phone.includes(q) || t.protocol.includes(q);
        }
        return true;
    }), [tickets, search, statusFilter, mineOnly, user]);

    const formatTime = (d: string) => new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const firstName = (name?: string | null) => (name || '').trim().split(/\s+/)[0] || 'atendente';
    const availableTags = allTags.filter(t => !ticketTags.find(tt => tt.id === t.id));

    // View-only guard: an OPEN ticket assigned to a different agent is read-only for
    // non-admins. They can read the conversation but must "Assumir" to reply, which
    // prevents two agents answering the same chat at once.
    const isViewerOnly = !!selectedTicket?.user
        && selectedTicket.user.id !== user?.id
        && user?.role !== 'ADMIN' && !user?.isSuperAdmin
        && selectedTicket.status === 'OPEN';

    // Bot-handled guard: while the bot is driving the conversation the composer is
    // hidden — the agent must "Assumir" to reply, so agent and bot don't answer at once.
    const isBotHandled = selectedTicket?.status === 'BOT';

    return (
        <div className="chat-container">
            {/* ─── Ticket List ─────────────────────────── */}
            <div className="chat-list-panel">
                <div className="px-4 py-3 border-b border-[var(--border)]">
                    <h2 className="text-lg font-bold mb-3">{t('TICKET_LABEL')}</h2>
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none" />
                            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('SEARCH_CONTACT')}
                                aria-label="Buscar atendimento por nome, telefone ou protocolo"
                                className="pl-8 w-full text-sm" style={{ padding: '8px 10px 8px 32px' }} />
                        </div>
                        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label="Filtrar por status" className="w-[100px] text-xs" style={{ padding: '8px' }}>
                            <option value="ACTIVE">Ativos</option>
                            <option value="OPEN">Abertos</option>
                            <option value="QUEUE">Fila</option>
                            <option value="BOT">Bot</option>
                            <option value="CLOSED">Fechados</option>
                            <option value="">Todos</option>
                        </select>
                    </div>
                    <button
                        onClick={() => setMineOnly(v => !v)}
                        aria-pressed={mineOnly}
                        title="Mostrar apenas os meus atendimentos"
                        className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg transition-colors"
                        style={{
                            padding: '5px 10px',
                            background: mineOnly ? 'var(--em-subtle)' : 'transparent',
                            color: mineOnly ? 'var(--em-400)' : 'var(--text-secondary)',
                            border: `1px solid ${mineOnly ? 'var(--border-em)' : 'var(--border)'}`,
                        }}
                    >
                        <User size={13} /> Meus
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {filteredTickets.length === 0 && (
                        <div className="p-8 text-center text-[var(--text-secondary)] text-sm">
                            {t('NO_CONTACT_FOUND')}
                        </div>
                    )}
                    {filteredTickets.map(ticket => {
                        const isSlaBreach = slaBreachedIds.includes(ticket.id);
                        const isSelected = selectedTicket?.id === ticket.id;
                        const isMineTicket = !!ticket.user && ticket.user.id === user?.id;
                        const inAttendance = ticket.status === 'OPEN' && !!ticket.user;
                        return (
                            <div key={ticket.id}
                                role="button"
                                tabIndex={0}
                                aria-pressed={isSelected}
                                aria-label={`${ticket.contact.name || ticket.contact.phone} — ${statusLabels[ticket.status]?.label ?? ticket.status}${isSlaBreach ? ' — SLA vencido' : ''}`}
                                onClick={() => selectTicket(ticket)}
                                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectTicket(ticket); } }}
                                style={{
                                    padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
                                    background: isSelected ? 'var(--bg-hover)' : isSlaBreach ? 'rgba(239,68,68,0.06)' : 'transparent',
                                    boxShadow: isMineTicket ? 'inset 3px 0 0 var(--em-500)' : undefined,
                                    transition: 'background 0.15s',
                                    outline: 'none',
                                }}
                                onFocus={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                                onBlur={e => { if (!isSelected) e.currentTarget.style.background = isSlaBreach ? 'rgba(239,68,68,0.06)' : 'transparent'; }}
                                onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-hover)'; }}
                                onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = isSlaBreach ? 'rgba(239,68,68,0.06)' : 'transparent'; }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <Avatar 
                                            phone={ticket.contact.phone} 
                                            name={ticket.contact.name} 
                                            url={(ticket.contact as any).avatarUrl ?? (ticket.contact as any).profilePicUrl} 
                                            size={40} 
                                        />
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: 14 }}>{ticket.contact.name || ticket.contact.phone}</div>
                                            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{ticket.contact.phone}</div>
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{formatTime(ticket.updatedAt)}</div>
                                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                            {isSlaBreach && (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 9999, fontSize: 10, fontWeight: 700, background: 'rgba(239,68,68,0.12)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.25)', letterSpacing: '0.04em' }}>
                                                    SLA
                                                </span>
                                            )}
                                            <span className={`badge ${statusLabels[ticket.status]?.class}`}>
                                                {statusLabels[ticket.status]?.label}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                {(inAttendance || (isMineTicket && !inAttendance)) && (
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 50, marginBottom: 2, flexWrap: 'wrap' }}>
                                        {inAttendance && (
                                            <span title={`Em atendimento por ${ticket.user!.name}`} style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 9999, fontSize: 10, fontWeight: 700, background: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.25)' }}>
                                                {isMineTicket ? 'Em atend.: Você' : `Em atend.: ${firstName(ticket.user!.name)}`}
                                            </span>
                                        )}
                                        {isMineTicket && !inAttendance && (
                                            <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 9999, fontSize: 10, fontWeight: 700, background: 'var(--em-subtle)', color: 'var(--em-400)', border: '1px solid var(--border-em)' }}>
                                                Você
                                            </span>
                                        )}
                                    </div>
                                )}
                                {ticket.messages?.[0] && (
                                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 50, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {ticket.messages[0].body || '[mídia]'}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ─── Chat Area + CRM Panel ─────────────────────────── */}
            {selectedTicket ? (
                <>
                <div className="chat-area">
                    {/* Header */}
                    <div className="chat-header">
                        <div className="flex items-center gap-3">
                            <Avatar 
                                phone={selectedTicket.contact.phone} 
                                name={selectedTicket.contact.name} 
                                url={(selectedTicket.contact as any).avatarUrl ?? (selectedTicket.contact as any).profilePicUrl} 
                                size={40} 
                            />
                            <div>
                                <div className="font-semibold text-[15px]">{selectedTicket.contact.name}</div>
                                <div className="text-xs text-[var(--text-secondary)]">
                                    {selectedTicket.contact.phone} · #{selectedTicket.protocol}
                                </div>
                                {selectedTicket.status === 'OPEN' && selectedTicket.user && (
                                    <span title={`Em atendimento por ${selectedTicket.user.name}`} style={{ display: 'inline-flex', alignItems: 'center', marginTop: 4, padding: '2px 8px', borderRadius: 9999, fontSize: 10, fontWeight: 700, background: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.25)', whiteSpace: 'nowrap' }}>
                                        {selectedTicket.user.id === user?.id ? 'Em atend.: Você' : `Em atend.: ${firstName(selectedTicket.user.name)}`}
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="flex gap-1 items-center">
                            {(selectedTicket.status === 'QUEUE' || selectedTicket.status === 'BOT') && (
                                <button className="btn btn-primary btn-sm" onClick={() => assignTicket(selectedTicket.id)}>
                                    <UserPlus size={14} /> Assumir
                                </button>
                            )}
                            {(selectedTicket.status === 'OPEN' || selectedTicket.status === 'QUEUE' || selectedTicket.status === 'BOT') && (
                                <>
                                    <button className="btn btn-secondary btn-sm" onClick={() => setShowTransfer(!showTransfer)}>
                                        <ArrowRightLeft size={14} /> Transferir
                                    </button>
                                    <button className="btn btn-danger btn-sm" onClick={() => closeTicket(selectedTicket.id)}>
                                        <XCircle size={14} /> Encerrar
                                    </button>
                                </>
                            )}
                            {/* Chat Management Menu */}
                            <div style={{ position: 'relative', marginLeft: 8 }}>
                                <button className="btn-ghost" style={{ padding: 6, borderRadius: '50%' }}
                                    onClick={() => { setShowChatMenu(prev => !prev); setShowBlockConfirm(false); }}
                                    aria-label="Opções do atendimento"
                                    aria-expanded={showChatMenu}
                                    aria-haspopup="true"
                                >
                                    <MoreVertical size={18} />
                                </button>
                                {showChatMenu && (
                                    <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', minWidth: 160, zIndex: 50, overflow: 'hidden' }}>
                                        <button className="menu-item btn-ghost" style={{ width: '100%', justifyContent: 'flex-start', padding: '10px 16px', borderRadius: 0 }} 
                                            onClick={async () => { setShowChatMenu(false); try { await api.post(`/tickets/${selectedTicket.id}/chat/archive`); } catch {} }}>
                                            <Archive size={14} style={{ marginRight: 8 }} /> Arquivar Chat
                                        </button>
                                        <button className="menu-item btn-ghost" style={{ width: '100%', justifyContent: 'flex-start', padding: '10px 16px', borderRadius: 0 }} 
                                            onClick={async () => { setShowChatMenu(false); try { await api.post(`/tickets/${selectedTicket.id}/chat/pin`); } catch {} }}>
                                            <Pin size={14} style={{ marginRight: 8 }} /> Fixar Chat
                                        </button>
                                        <button className="menu-item btn-ghost" style={{ width: '100%', justifyContent: 'flex-start', padding: '10px 16px', borderRadius: 0 }} 
                                            onClick={async () => { setShowChatMenu(false); try { await api.post(`/tickets/${selectedTicket.id}/chat/mute`); } catch {} }}>
                                            <BellOff size={14} style={{ marginRight: 8 }} /> Silenciar Notificações
                                        </button>
                                        <div style={{ height: 1, background: 'var(--border)' }} />
                                        {!showBlockConfirm ? (
                                            <button className="menu-item btn-ghost" style={{ width: '100%', justifyContent: 'flex-start', padding: '10px 16px', borderRadius: 0, color: '#ef4444' }}
                                                onClick={() => setShowBlockConfirm(true)}>
                                                <Slash size={14} style={{ marginRight: 8 }} /> Bloquear Contato
                                            </button>
                                        ) : (
                                            <div style={{ padding: '10px 16px', background: 'rgba(239,68,68,0.08)' }}>
                                                <div style={{ fontSize: 12, color: '#fca5a5', marginBottom: 8 }}>Bloquear {selectedTicket.contact.name}?</div>
                                                <div style={{ display: 'flex', gap: 6 }}>
                                                    <button className="btn btn-danger btn-sm" onClick={async () => {
                                                        setShowChatMenu(false); setShowBlockConfirm(false);
                                                        try { await api.post(`/tickets/${selectedTicket.id}/chat/block`); } catch {}
                                                    }}>Bloquear</button>
                                                    <button className="btn btn-secondary btn-sm" onClick={() => setShowBlockConfirm(false)}>Cancelar</button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Transfer bar */}
                    {showTransfer && (
                        <div style={{ padding: '8px 20px', background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Transferir para:</span>
                            {departments.map((d: any) => (
                                <button key={d.id} className="btn btn-secondary btn-sm" onClick={() => { transferTicket(selectedTicket.id, d.id); setShowTransfer(false); }}>
                                    {d.name}
                                </button>
                            ))}
                            <button className="btn-ghost btn-sm" onClick={() => setShowTransfer(false)}><X size={14} /></button>
                        </div>
                    )}

                    {/* Continuous Timeline */}
                    <div
                        ref={chatAreaRef}
                        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={e => {
                            e.preventDefault(); setIsDragging(false);
                            if (selectedTicket?.status !== 'CLOSED' && !isBotHandled && !isViewerOnly) addFiles(e.dataTransfer.files);
                        }}
                        role="log"
                        aria-label="Histórico da conversa"
                        aria-live="polite"
                        aria-relevant="additions"
                        className="chat-messages"
                        style={{ background: isDragging ? 'rgba(16,185,129,0.05)' : 'var(--bg-chat)' }}
                    >
                        {isDragging && (
                            <div style={{ position: 'absolute', inset: 0, border: '2px dashed var(--accent)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, pointerEvents: 'none', background: 'rgba(16,185,129,0.05)' }}>
                                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>Solte o arquivo aqui</div>
                            </div>
                        )}
                        {/* Top sentinel for infinite scroll */}
                        <div ref={topSentinelRef} style={{ height: 4 }}>
                            {loadingMore && (
                                <div style={{ textAlign: 'center', paddingBottom: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
                                    Carregando histórico...
                                </div>
                            )}
                        </div>

                        {/* ─ Skeleton while loading first page ─ */}
                        {loadingMore && timeline.length === 0 ? (
                            <ChatSkeleton />
                        ) : (
                            timeline.length === 0 && (
                                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13, paddingTop: 40 }}>
                                    Nenhuma mensagem ainda.
                                </div>
                            )
                        )}

                        {renderedTimeline}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* View-only banner: ticket is being handled by another agent */}
                    {isViewerOnly && (
                        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(113,113,122,0.15)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Lock size={15} color="var(--text-secondary)" />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Em atendimento por {selectedTicket.user?.name}</div>
                                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>Você pode visualizar a conversa. Para responder, assuma o atendimento.</div>
                            </div>
                            <button className="btn btn-primary btn-sm" style={{ flexShrink: 0 }} onClick={() => assignTicket(selectedTicket.id)}>
                                <UserPlus size={14} /> Assumir atendimento
                            </button>
                        </div>
                    )}

                    {/* Bot-handled banner: agent must capture the ticket to reply */}
                    {isBotHandled && (
                        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Bot size={16} color="#3b82f6" />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Atendimento conduzido pelo bot</div>
                                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>Assuma o atendimento para responder ou encerre a conversa.</div>
                            </div>
                            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                                <button className="btn btn-primary btn-sm" onClick={() => assignTicket(selectedTicket.id)}>
                                    <UserPlus size={14} /> Assumir
                                </button>
                                <button className="btn btn-danger btn-sm" onClick={() => closeTicket(selectedTicket.id)}>
                                    <XCircle size={14} /> Encerrar
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Input Area: blocked while window status is loading */}
                    {!isViewerOnly && !isBotHandled && selectedTicket.status !== 'CLOSED' && windowLoading && (
                        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid var(--border)', borderTopColor: 'var(--accent)', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Verificando janela de atendimento...</span>
                        </div>
                    )}

                    {!isViewerOnly && !isBotHandled && selectedTicket.status !== 'CLOSED' && !windowLoading && windowStatus && !windowStatus.withinWindow && windowStatus.allowTemplates && (
                        <TemplateSelector ticketId={selectedTicket.id} onSent={() => {
                            if (selectedTicket) fetchWindowStatus(selectedTicket.id);
                        }} />
                    )}

                    {!isViewerOnly && !isBotHandled && selectedTicket.status !== 'CLOSED' && !windowLoading && windowStatus && !windowStatus.withinWindow && !windowStatus.allowTemplates && (
                        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(113,113,122,0.15)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                                <Clock size={15} color="var(--text-secondary)" />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>Aguardando resposta do cidadão</div>
                                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                    A janela de 24h para troca de mensagens encerrou. Quando o cidadão enviar uma nova mensagem, o atendimento reabre automaticamente.
                                </div>
                            </div>
                        </div>
                    )}

                    {!isViewerOnly && !isBotHandled && selectedTicket.status !== 'CLOSED' && !windowLoading && (!windowStatus || windowStatus.withinWindow) && (
                        <>
                            {/* Unread-below jump badge */}
                            {unreadBelow > 0 && (
                                <div style={{ position: 'relative', zIndex: 10 }}>
                                    <button
                                        onClick={() => {
                                            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                                            setUnreadBelow(0);
                                        }}
                                        style={{
                                            position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
                                            display: 'flex', alignItems: 'center', gap: 6,
                                            padding: '6px 16px', borderRadius: 20, border: 'none', cursor: 'pointer',
                                            background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 700,
                                            boxShadow: '0 4px 12px rgba(0,0,0,0.25)', animation: 'fadeIn 0.2s ease',
                                        }}
                                    >
                                        <ChevronDown size={14} /> {unreadBelow} nova{unreadBelow !== 1 ? 's' : ''} mensagem{unreadBelow !== 1 ? 's' : ''}
                                    </button>
                                </div>
                            )}

                            {/* Typing Indicator — role="status" announces to screen readers when it appears */}
                            <div
                                role="status"
                                aria-live="polite"
                                aria-atomic="true"
                                style={{ padding: contactTyping ? '4px 20px 0' : '0', minHeight: 0 }}
                            >
                                {contactTyping && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <div style={{ display: 'flex', gap: 3, alignItems: 'center' }} aria-hidden="true">
                                            {[0, 0.15, 0.3].map((delay, i) => (
                                                <div key={i} style={{
                                                    width: 6, height: 6, borderRadius: '50%',
                                                    background: 'var(--text-secondary)',
                                                    animation: `typingBounce 0.8s ${delay}s ease-in-out infinite`,
                                                }} />
                                            ))}
                                        </div>
                                        <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                                            Cidadão está digitando...
                                        </span>
                                    </div>
                                )}
                            </div>

                            <div ref={chatInputAreaRef} className="chat-input-area relative" style={{ background: noteMode ? 'rgba(251,191,36,0.08)' : 'var(--bg-secondary)' }}>
                                {/* Upload Error Toast — role="alert" announces immediately to screen readers */}
                                {uploadError && (
                                    <div role="alert" aria-live="assertive" style={{ marginBottom: 8, padding: '8px 14px', borderRadius: 8, background: '#ef4444', color: '#fff', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <AlertTriangle size={14} aria-hidden="true" /> {uploadError}
                                    </div>
                                )}

                                {/* File Preview Strip */}
                                {pendingFiles.length > 0 && (
                                    <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                                        {pendingFiles.map((file, i) => {
                                            const isImage = file.type.startsWith('image/');
                                            const previewUrl = previewUrls[i] ?? null;
                                            return (
                                                <div key={i} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--bg-tertiary)', width: isImage ? 72 : 'auto', height: isImage ? 72 : 38 }}>
                                                    {isImage ? (
                                                        previewUrl
                                                            ? <img src={previewUrl} alt={file.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                            : <div style={{ width: '100%', height: '100%', background: 'var(--z-800)' }} />
                                                    ) : (
                                                        <span style={{ fontSize: 11, padding: '0 10px', color: 'var(--text-secondary)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                                                    )}
                                                    <button
                                                        onClick={() => setPendingFiles(prev => prev.filter((_, idx) => idx !== i))}
                                                        aria-label={`Remover ${file.name}`}
                                                        style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.55)', border: 'none', borderRadius: '50%', width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', padding: 0, fontSize: 10 }}
                                                    >
                                                        <X size={10} aria-hidden="true" />
                                                    </button>
                                                </div>
                                            );
                                        })}
                                        <button className="btn btn-primary btn-sm" onClick={handleUploadFiles} disabled={uploading} style={{ alignSelf: 'center' }}>
                                            {uploading ? 'Enviando...' : `Enviar (${pendingFiles.length})`}
                                        </button>
                                        <button className="btn btn-secondary btn-sm" onClick={() => setPendingFiles([])} disabled={uploading} style={{ alignSelf: 'center' }}>
                                            Cancelar
                                        </button>
                                    </div>
                                )}
                                {windowStatus && windowStatus.minutesRemaining > 0 && windowStatus.minutesRemaining <= 60 && !noteMode && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', marginBottom: 8, borderRadius: 6, background: 'rgba(251,188,4,0.08)', border: '1px solid rgba(251,188,4,0.2)', fontSize: 11, color: '#fbbc04' }}>
                                        <Clock size={11} />
                                        Janela de atendimento encerra em {windowStatus.minutesRemaining} min — após isso, aguardar nova mensagem do cidadão
                                    </div>
                                )}
                                {noteMode && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', marginBottom: 8, borderRadius: 6, background: 'rgba(251,191,36,0.15)', fontSize: 11, color: '#d97706', fontWeight: 600 }}>
                                        <Lock size={12} /> Modo Nota Interna
                                        <button onClick={() => setNoteMode(false)} className="btn-ghost" style={{ marginLeft: 'auto', padding: 2 }}><X size={14} /></button>
                                    </div>
                                )}
                                {hasDraft && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 11, color: '#d97706', opacity: 0.8 }}>
                                        <StickyNote size={11} /> Rascunho restaurado
                                    </div>
                                )}

                                {/* Tags row */}
                                {ticketTags.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                                        {ticketTags.map(tag => (
                                            <span key={tag.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: tag.color + '20', color: tag.color, border: `1px solid ${tag.color}40` }}>
                                                {tag.name}
                                                <button onClick={() => handleTagRemove(tag.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: tag.color, display: 'flex' }}>
                                                    <X size={10} />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {/* Quick Replies autocomplete */}
                                {showQuickReplies && filteredQR.length > 0 && (
                                    <div style={{ position: 'absolute', bottom: '100%', left: 20, right: 20, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, maxHeight: 200, overflowY: 'auto', boxShadow: '0 -4px 20px rgba(0,0,0,0.15)', zIndex: 100 }}>
                                        {filteredQR.map(qr => (
                                            <div key={qr.id} onClick={() => selectQuickReply(qr)} style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }}
                                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                                <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--accent)' }}>{qr.shortcut}</span>
                                                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{qr.message}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                    {/* Attachment */}
                                    <button
                                        className="btn-ghost"
                                        onClick={() => chatInputAreaRef.current?.querySelector<HTMLInputElement>('input[type="file"]')?.click()}
                                        aria-label="Anexar arquivo"
                                        style={{ borderRadius: 8, padding: 8, color: 'var(--text-secondary)' }}
                                    >
                                        <Paperclip size={18} />
                                    </button>
                                    <input
                                        type="file"
                                        multiple
                                        hidden
                                        onChange={e => {
                                            if (e.target.files) addFiles(e.target.files);
                                            e.target.value = '';
                                        }}
                                    />

                                    {/* Note mode toggle */}
                                    <button className="btn-ghost" onClick={() => setNoteMode(!noteMode)} aria-label="Nota interna (Ctrl+Shift+N)"
                                        style={{ borderRadius: 8, padding: 8, background: noteMode ? 'rgba(251,191,36,0.2)' : 'transparent', color: noteMode ? '#d97706' : 'var(--text-secondary)' }}>
                                        <StickyNote size={18} />
                                    </button>

                                    {/* More: special messages + tag picker */}
                                    <div style={{ position: 'relative' }}>
                                        <button
                                            className="btn-ghost"
                                            onClick={() => setShowActionMenu(prev => !prev)}
                                            aria-label="Mais opções de envio"
                                            style={{ borderRadius: 8, padding: 8, color: showActionMenu ? 'var(--z-100)' : 'var(--text-secondary)', background: showActionMenu ? 'var(--bg-tertiary)' : 'transparent' }}
                                        >
                                            <MoreHorizontal size={18} />
                                        </button>
                                        {showActionMenu && (
                                            <>
                                            <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setShowActionMenu(false)} />
                                            <div style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 6, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, minWidth: 200, boxShadow: '0 4px 20px rgba(0,0,0,0.2)', zIndex: 100, overflow: 'hidden' }}>
                                                <div style={{ padding: '7px 12px 4px', fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                                    Mensagem especial
                                                </div>
                                                <div onClick={() => { setShowPollModal(true); setShowActionMenu(false); }} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8, transition: 'background 0.12s' }}
                                                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                                    <BarChart2 size={14} color="var(--accent)" /> Enquete (Votação)
                                                </div>
                                                <div onClick={() => { setShowLocationModal(true); setShowActionMenu(false); }} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8, transition: 'background 0.12s' }}
                                                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                                    <MapPin size={14} color="var(--accent)" /> Enviar Localização
                                                </div>
                                                <div onClick={() => { setShowContactModal(true); setShowActionMenu(false); }} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8, transition: 'background 0.12s' }}
                                                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                                    <User size={14} color="var(--accent)" /> Compartilhar Contato
                                                </div>
                                                {availableTags.length > 0 && (
                                                    <>
                                                    <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                                                    <div style={{ padding: '7px 12px 4px', fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                                        Adicionar etiqueta
                                                    </div>
                                                    {availableTags.map(tag => (
                                                        <div key={tag.id} onClick={() => { handleTagAssign(tag.id); setShowActionMenu(false); }} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8, transition: 'background 0.12s' }}
                                                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                                                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: tag.color, flexShrink: 0 }} /> {tag.name}
                                                        </div>
                                                    ))}
                                                    </>
                                                )}
                                            </div>
                                            </>
                                        )}
                                    </div>

                                    <input value={msgInput} onChange={e => setMsgInput(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                if (showQuickReplies && filteredQR.length > 0) selectQuickReply(filteredQR[0]);
                                                else if (pendingFiles.length > 0 && !noteMode) { if (!isOverLimit && !uploading) handleUploadFiles(); }
                                                else if (!isOverLimit) handleSend();
                                            }
                                            if (e.key === 'Escape') { setShowQuickReplies(false); setNoteMode(false); setShowActionMenu(false); }
                                        }}
                                        placeholder={noteMode ? 'Nota interna — (Ctrl+Shift+N) para sair' : 'Mensagem... (/ para respostas rápidas)'}
                                        aria-label={noteMode ? 'Nota interna' : 'Mensagem para o cidadão'}
                                        style={{
                                            flex: 1, borderRadius: 20, padding: '10px 16px',
                                            borderColor: isOverLimit ? '#ef4444' : noteMode ? 'rgba(251,191,36,0.4)' : undefined,
                                            outline: isOverLimit ? '2px solid rgba(239,68,68,0.3)' : undefined,
                                        }}
                                    />
                                    <button className="btn btn-primary" style={{ borderRadius: '50%', width: 40, height: 40, padding: 0, flexShrink: 0, background: noteMode ? '#d97706' : isOverLimit ? '#ef4444' : undefined }}
                                        onClick={() => { if (pendingFiles.length > 0 && !noteMode) handleUploadFiles(); else handleSend(); }}
                                        disabled={(pendingFiles.length > 0 && !noteMode ? uploading : !msgInput.trim()) || isOverLimit} aria-label="Enviar mensagem">
                                        <Send size={18} />
                                    </button>
                                </div>
                                {/* Character counter */}
                                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4, paddingRight: 4 }}>
                                    <span style={{ fontSize: 11, fontWeight: 600, color: isOverLimit ? "#ef4444" : charCount > WHATSAPP_MAX_CHARS * 0.85 ? "#d97706" : "var(--text-secondary)" }}>{charCount}/{WHATSAPP_MAX_CHARS}</span>
                                </div>
                            </div>
                        </>
                    )}

                    {/* ─── Toast Notifications ─────────── */}
                    <ToastContainer />
                </div>

                {/* ─── CRM Panel (right column) ─────────────────────── */}
                <ContactProfileDrawer
                    key={`${selectedTicket.contact.id}-${contactVersion}`}
                    contactId={selectedTicket.contact.id}
                    ticketId={selectedTicket.id}
                    protocol={selectedTicket.protocol}
                    status={selectedTicket.status}
                    department={selectedTicket.department}
                    agent={selectedTicket.user}
                    createdAt={selectedTicket.createdAt}
                    tags={ticketTags}
                    onMergeClick={() => setShowMerge(true)}
                    onContactUpdated={() => setContactVersion(v => v + 1)}
                />
                </>
            ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'var(--text-secondary)' }}>
                    <MessageSquare size={48} strokeWidth={1} />
                    <p style={{ fontSize: 15 }}>{t('SELECT_TICKET')}</p>
                </div>
            )}

            {/* ─── Merge Modal (root-level overlay) ──────────────── */}
            {showMerge && selectedTicket && (
                <MergeContactModal
                    sourceContactId={selectedTicket.contact.id}
                    sourceContactName={selectedTicket.contact.name || ''}
                    sourceContactPhone={selectedTicket.contact.phone}
                    onClose={() => setShowMerge(false)}
                    onMerged={() => {
                        setContactVersion(v => v + 1);
                        loadTimeline(1);
                        fetchTickets();
                    }}
                />
            )}

            {/* ─── Poll Modal ──────────────── */}
            {showPollModal && selectedTicket && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowPollModal(false)}>
                    <div className="modal-content" style={{ maxWidth: 450 }}>
                        <div className="modal-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <BarChart2 size={20} color="var(--accent)" />
                                <span style={{ fontWeight: 600, fontSize: 16 }}>Criar Enquete</span>
                            </div>
                            <button onClick={() => setShowPollModal(false)} className="btn-ghost btn-icon-sm">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>Pergunta</label>
                                <input 
                                    value={pollQuestion} 
                                    onChange={e => setPollQuestion(e.target.value)} 
                                    placeholder="Ex: Qual é a sua dúvida?" 
                                    style={{ width: '100%', padding: '8px 12px' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>Opções</label>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {pollOptions.map((opt, idx) => (
                                        <div key={opt.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                            <input
                                                value={opt.text}
                                                onChange={e => setPollOptions(pollOptions.map(o =>
                                                    o.id === opt.id ? { ...o, text: e.target.value } : o
                                                ))}
                                                placeholder={`Opção ${idx + 1}`}
                                                style={{ flex: 1, padding: '8px 12px' }}
                                            />
                                            {pollOptions.length > 2 && (
                                                <button
                                                    className="btn-ghost"
                                                    onClick={() => setPollOptions(pollOptions.filter(o => o.id !== opt.id))}
                                                    style={{ padding: 6, color: '#ef4444' }}
                                                >
                                                    <X size={16} />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                {pollOptions.length < 10 && (
                                    <button
                                        className="btn-ghost btn-sm"
                                        onClick={() => setPollOptions([...pollOptions, { id: `po-${Date.now()}`, text: '' }])}
                                        style={{ marginTop: 8, fontSize: 12, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }}
                                    >
                                        <Plus size={14} /> Adicionar Opção
                                    </button>
                                )}
                            </div>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
                                <button className="btn btn-secondary btn-sm" onClick={() => setShowPollModal(false)}>Cancelar</button>
                                <button className="btn btn-primary btn-sm" onClick={handleSendPoll} disabled={!pollQuestion.trim() || pollOptions.filter(o => o.text.trim()).length < 2}>Enviar</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Location Modal ──────────────── */}
            {showLocationModal && selectedTicket && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowLocationModal(false)}>
                    <div className="modal-content" style={{ maxWidth: 450 }}>
                        <div className="modal-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <MapPin size={20} color="var(--accent)" />
                                <span style={{ fontWeight: 600, fontSize: 16 }}>Enviar Localização</span>
                            </div>
                            <button onClick={() => setShowLocationModal(false)} className="btn-ghost btn-icon-sm">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div style={{ display: 'flex', gap: 12 }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>Latitude</label>
                                    <input 
                                        value={locLatitude} 
                                        onChange={e => setLocLatitude(e.target.value)} 
                                        placeholder="Ex: -23.5505" 
                                        style={{ width: '100%', padding: '8px 12px' }}
                                    />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>Longitude</label>
                                    <input 
                                        value={locLongitude} 
                                        onChange={e => setLocLongitude(e.target.value)} 
                                        placeholder="Ex: -46.6333" 
                                        style={{ width: '100%', padding: '8px 12px' }}
                                    />
                                </div>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>Nome do Local (Opcional)</label>
                                <input 
                                    value={locName} 
                                    onChange={e => setLocName(e.target.value)} 
                                    placeholder="Ex: Prefeitura Municipal" 
                                    style={{ width: '100%', padding: '8px 12px' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>Endereço (Opcional)</label>
                                <input 
                                    value={locAddress} 
                                    onChange={e => setLocAddress(e.target.value)} 
                                    placeholder="Ex: Praça da Sé, 111" 
                                    style={{ width: '100%', padding: '8px 12px' }}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
                                <button className="btn btn-secondary btn-sm" onClick={() => setShowLocationModal(false)}>Cancelar</button>
                                <button className="btn btn-primary btn-sm" onClick={handleSendLocation} disabled={!locLatitude.trim() || !locLongitude.trim()}>Enviar</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Contact Modal ──────────────── */}
            {showContactModal && selectedTicket && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowContactModal(false)}>
                    <div className="modal-content" style={{ maxWidth: 450 }}>
                        <div className="modal-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <User size={20} color="var(--accent)" />
                                <span style={{ fontWeight: 600, fontSize: 16 }}>Compartilhar Contato</span>
                            </div>
                            <button onClick={() => setShowContactModal(false)} className="btn-ghost btn-icon-sm">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>Nome Completo</label>
                                <input 
                                    value={contactFullName} 
                                    onChange={e => setContactFullName(e.target.value)} 
                                    placeholder="Ex: João Silva" 
                                    style={{ width: '100%', padding: '8px 12px' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>Telefone (com DDD)</label>
                                <input 
                                    value={contactPhone} 
                                    onChange={e => setContactPhone(e.target.value)} 
                                    placeholder="Ex: 5511999999999" 
                                    style={{ width: '100%', padding: '8px 12px' }}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
                                <button className="btn btn-secondary btn-sm" onClick={() => setShowContactModal(false)}>Cancelar</button>
                                <button className="btn btn-primary btn-sm" onClick={handleSendContact} disabled={!contactFullName.trim() || !contactPhone.trim()}>Enviar</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
