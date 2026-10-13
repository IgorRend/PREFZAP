import { useState, useEffect } from 'react';
import api from '../services/api';
import {
    User, Phone, Mail, FileText, Edit3, X, Save, GitMerge, ChevronDown, ChevronUp,
    Clock, CheckCircle, Circle, AlertCircle, Shield, RefreshCw
} from 'lucide-react';
import Avatar from './Avatar';

interface Contact {
    id: string;
    name?: string;
    fullName?: string;
    cpf?: string;
    email?: string;
    phone: string;
    profilePicUrl?: string;
    avatarUrl?: string;
    channel?: string;
    variables?: string;
    mergedFrom?: { id: string; name?: string; phone: string; channel?: string }[];
    tickets?: {
        id: string; protocol: string; status: string;
        createdAt: string; closedAt?: string;
        department?: { name: string };
        _count?: { messages: number };
    }[];
}

interface Props {
    contactId: string;
    ticketId: string;
    protocol: string;
    status: string;
    department?: { id: string; name: string };
    agent?: { id: string; name: string };
    createdAt: string;
    tags: { id: string; name: string; color: string }[];
    onMergeClick: () => void;
    onContactUpdated: () => void;
}

const statusColors: Record<string, string> = {
    OPEN: '#22c55e', QUEUE: '#f59e0b', BOT: '#6366f1',
    CLOSED: '#6b7280', PENDING_NPS: '#f59e0b'
};
const statusIcon: Record<string, React.JSX.Element> = {
    OPEN: <CheckCircle size={12} />, QUEUE: <Circle size={12} />,
    BOT: <AlertCircle size={12} />, CLOSED: <X size={12} />, PENDING_NPS: <Clock size={12} />
};

export default function ContactProfileDrawer({
    contactId, ticketId, protocol, status, department, agent, createdAt,
    tags, onMergeClick, onContactUpdated
}: Props) {
    const [contact, setContact] = useState<Contact | null>(null);
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editForm, setEditForm] = useState({ fullName: '', cpf: '', email: '' });
    const [showHistory, setShowHistory] = useState(false);
    const [refreshingPic, setRefreshingPic] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (contactId) loadContact();
    }, [contactId]);

    async function loadContact() {
        setError('');
        try {
            const { data } = await api.get(`/contacts/${contactId}`);
            setContact(data);
            setEditForm({ fullName: data.fullName || '', cpf: data.cpf || '', email: data.email || '' });
        } catch {
            setError('Não foi possível carregar os dados do contato.');
        }
    }

    async function handleRefreshPic() {
        setRefreshingPic(true);
        try {
            await api.post('/zapo-compat/contact/refresh-avatar', { contactId });
            await loadContact();
            onContactUpdated();
        } catch (e: any) {
            console.error('Erro ao buscar foto:', e);
        } finally {
            setRefreshingPic(false);
        }
    }

    async function handleSave() {
        setError('');
        setSaving(true);
        try {
            await api.put(`/contacts/${contactId}`, editForm);
            await loadContact();
            setEditing(false);
            onContactUpdated();
        } catch (e: any) {
            setError(e.response?.data?.error || 'Erro ao salvar. Verifique os dados.');
        } finally {
            setSaving(false);
        }
    }

    const formatCpf = (v: string) => {
        const d = v.replace(/\D/g, '').slice(0, 11);
        return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    };

    const avatarInitial = (contact?.fullName || contact?.name || contact?.phone || '?').charAt(0).toUpperCase();

    if (error && !contact) {
        return (
            <div className="contact-drawer" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}>
                <AlertCircle size={28} color="#ef4444" />
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center' }}>{error}</p>
                <button className="btn btn-secondary btn-sm" onClick={loadContact}>Tentar novamente</button>
            </div>
        );
    }

    return (
        <div className="contact-drawer">
            {/* Avatar + Name */}
            <div className="contact-drawer-header">
                <div className="contact-drawer-avatar" style={{ display: 'flex', justifyContent: 'center' }}>
                    <Avatar 
                        phone={contact?.phone || ''} 
                        name={contact?.fullName || contact?.name || ''} 
                        url={contact?.profilePicUrl || contact?.avatarUrl || null} 
                        size={64} 
                    />
                </div>
                <button
                    onClick={handleRefreshPic}
                    disabled={refreshingPic}
                    className="btn-ghost btn-icon-sm"
                    title="Buscar foto do WhatsApp"
                    style={{ position: 'absolute', top: 8, right: 8 }}
                >
                    <RefreshCw size={14} className={refreshingPic ? 'animate-spin' : ''} />
                </button>
                <div className="contact-drawer-name">{contact?.fullName || contact?.name || '-'}</div>
                {contact?.fullName && contact?.name && (
                    <div className="contact-drawer-at">@{contact.name}</div>
                )}
                <div className="contact-drawer-phone">
                    <Phone size={11} /> {contact?.phone}
                </div>
                {contact?.channel && contact.channel !== 'whatsapp' && (
                    <span className="badge badge-indigo channel-badge">
                        Web Widget
                    </span>
                )}
                {contact?.mergedFrom && contact.mergedFrom.length > 0 && (
                    <div className="contact-merged-badge">
                        <Shield size={10} /> {contact.mergedFrom.length} contato(s) fundido(s)
                    </div>
                )}
            </div>

            {/* CRM Fields */}
            <div className="contact-drawer-section">
                <div className="contact-drawer-section-header">
                    <span className="contact-drawer-section-title">Perfil CRM</span>
                    <div className="contact-drawer-section-actions">
                        <button onClick={onMergeClick} className="btn-ghost btn-icon-sm" title="Fundir contatos">
                            <GitMerge size={14} />
                        </button>
                        <button
                            onClick={() => { setEditing(!editing); setError(''); }}
                            className="btn-ghost btn-icon-sm"
                            style={{ color: editing ? 'var(--accent)' : undefined }}
                            title={editing ? 'Cancelar edição' : 'Editar perfil'}
                        >
                            {editing ? <X size={14} /> : <Edit3 size={14} />}
                        </button>
                    </div>
                </div>

                {editing ? (
                    <div className="edit-form">
                        {error && (
                            <div className="form-error-banner">
                                {error}
                            </div>
                        )}
                        <div className="form-group">
                            <label className="form-label">NOME COMPLETO</label>
                            <input
                                value={editForm.fullName}
                                onChange={e => setEditForm(f => ({ ...f, fullName: e.target.value }))}
                                placeholder="João da Silva Santos"
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">CPF</label>
                            <input
                                value={editForm.cpf}
                                onChange={e => setEditForm(f => ({ ...f, cpf: formatCpf(e.target.value) }))}
                                placeholder="000.000.000-00"
                                maxLength={14}
                                style={{ fontFamily: 'monospace' }}
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">E-MAIL</label>
                            <input
                                type="email"
                                value={editForm.email}
                                onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                                placeholder="joao@prefeitura.gov.br"
                            />
                        </div>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="btn btn-primary btn-sm"
                            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                        >
                            <Save size={13} /> {saving ? 'Salvando...' : 'Salvar'}
                        </button>
                    </div>
                ) : (
                    <div className="crm-fields">
                        <CrmRow icon={<User size={12} />} label="Nome Completo" value={contact?.fullName || '—'} empty={!contact?.fullName} />
                        <CrmRow icon={<FileText size={12} />} label="CPF" value={contact?.cpf ? contact.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : '—'} empty={!contact?.cpf} mono />
                        <CrmRow icon={<Mail size={12} />} label="E-mail" value={contact?.email || '—'} empty={!contact?.email} />
                        {contact?.variables && contact.variables !== '{}' && (() => {
                            try {
                                const vars = JSON.parse(contact.variables!);
                                const entries = Object.entries(vars);
                                if (entries.length === 0) return null;
                                return (
                                    <div style={{ marginTop: 12 }}>
                                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                                            Variáveis do Bot
                                        </div>
                                        {entries.map(([k, v]) => (
                                            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '3px 0', borderBottom: '1px solid var(--border)' }}>
                                                <span style={{ color: 'var(--text-secondary)' }}>{k}</span>
                                                <span style={{ fontWeight: 500 }}>{String(v)}</span>
                                            </div>
                                        ))}
                                    </div>
                                );
                            } catch { return null; }
                        })()}
                    </div>
                )}
            </div>

            {/* Current Ticket Info */}
            <div className="contact-drawer-section">
                <div className="contact-drawer-section-title">Atendimento Atual</div>
                <div className="ticket-info-fields">
                    <CrmRow icon={<FileText size={12} />} label="Protocolo" value={`#${protocol}`} />
                    <div>
                        <div className="crm-label">Status</div>
                        <span className="status-badge" style={{
                            background: (statusColors[status] || '#6b7280') + '20',
                            color: statusColors[status] || '#6b7280',
                        }}>
                            {statusIcon[status]} {status}
                        </span>
                    </div>
                    {department && <CrmRow icon={<ChevronDown size={12} />} label="Departamento" value={department.name} />}
                    {agent && <CrmRow icon={<User size={12} />} label="Agente" value={agent.name} />}
                    <CrmRow icon={<Clock size={12} />} label="Criado em" value={new Date(createdAt).toLocaleString('pt-BR')} />
                </div>
            </div>

            {/* Tags */}
            {tags.length > 0 && (
                <div className="contact-drawer-section">
                    <div className="contact-drawer-section-title">Tags</div>
                    <div className="tags-list">
                        {tags.map(tag => (
                            <span key={tag.id} className="dynamic-tag" style={{
                                background: tag.color + '20', color: tag.color, borderColor: tag.color + '40',
                            }}>
                                {tag.name}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Ticket History */}
            {contact?.tickets && contact.tickets.length > 1 && (
                <div className="contact-drawer-section">
                    <button
                        onClick={() => setShowHistory(!showHistory)}
                        className="history-toggle"
                    >
                        <span>Histórico ({contact.tickets.length - 1} protocolo{contact.tickets.length - 1 !== 1 ? 's' : ''})</span>
                        {showHistory ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                    {showHistory && (
                        <div className="history-list">
                            {contact.tickets
                                .filter(t => t.id !== ticketId)
                                .map(t => (
                                    <div key={t.id} className="history-item">
                                        <div className="history-item-header">
                                            <span className="history-protocol">
                                                #{t.protocol.slice(0, 12)}…
                                            </span>
                                            <span className="status-badge" style={{
                                                background: (statusColors[t.status] || '#6b7280') + '20',
                                                color: statusColors[t.status] || '#6b7280',
                                            }}>
                                                {t.status}
                                            </span>
                                        </div>
                                        <div className="history-item-meta">
                                            {new Date(t.createdAt).toLocaleDateString('pt-BR')}
                                            {t._count && ` · ${t._count.messages} msgs`}
                                            {t.department && ` · ${t.department.name}`}
                                        </div>
                                    </div>
                                ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function CrmRow({ icon, label, value, empty, mono }: { icon: React.ReactNode; label: string; value: string; empty?: boolean; mono?: boolean }) {
    return (
        <div className="crm-row">
            <div className="crm-label">{label}</div>
            <div className={`crm-value${empty ? ' crm-empty' : ''}${mono ? ' crm-mono' : ''}`}>
                <span className="crm-icon">{icon}</span>
                {value}
            </div>
        </div>
    );
}
