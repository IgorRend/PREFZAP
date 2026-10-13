import { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { Search, GitMerge, X, AlertTriangle, ArrowRight, Phone, FileText, Check } from 'lucide-react';

interface ContactResult {
    id: string;
    name?: string;
    fullName?: string;
    phone: string;
    cpf?: string;
    email?: string;
    channel?: string;
    _count?: { tickets: number };
}

interface Props {
    sourceContactId: string;
    sourceContactName: string;
    sourceContactPhone: string;
    onClose: () => void;
    onMerged: () => void;
}

export default function MergeContactModal({
    sourceContactId, sourceContactName, sourceContactPhone,
    onClose, onMerged
}: Props) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<ContactResult[]>([]);
    const [selected, setSelected] = useState<ContactResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [merging, setMerging] = useState(false);
    const [confirmed, setConfirmed] = useState(false);
    const [error, setError] = useState('');
    const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    useEffect(() => {
        if (!query.trim()) { setResults([]); return; }
        clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(async () => {
            setLoading(true);
            try {
                const { data } = await api.get(`/contacts/search?q=${encodeURIComponent(query)}&limit=10`);
                setResults(data.filter((c: ContactResult) => c.id !== sourceContactId));
            } catch { }
            finally { setLoading(false); }
        }, 300);
    }, [query]);

    async function handleMerge() {
        if (!selected || !confirmed) return;
        setMerging(true);
        setError('');
        try {
            await api.post(`/contacts/${sourceContactId}/merge`, { targetId: selected.id });
            onMerged();
            onClose();
        } catch (e: any) {
            setError(e.response?.data?.error || 'Erro ao fundir contatos.');
        } finally {
            setMerging(false);
        }
    }

    return (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="modal-content merge-modal">
                {/* Header */}
                <div className="modal-header merge-modal-header">
                    <div className="merge-modal-title">
                        <GitMerge size={20} />
                        <div>
                            <div>Fundir Contatos</div>
                            <div className="merge-modal-subtitle">
                                A timeline será unificada e o contato original se tornará um alias.
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="btn-ghost btn-icon-sm">
                        <X size={18} />
                    </button>
                </div>

                <div className="modal-body">
                    {/* Source contact */}
                    <div className="merge-step">
                        <div className="merge-step-label">Contato de Origem (será fundido)</div>
                        <ContactCard name={sourceContactName} phone={sourceContactPhone} dimmed />
                    </div>

                    <div className="merge-arrow">
                        <div className="merge-line" />
                        <ArrowRight size={16} />
                        <div className="merge-line" />
                    </div>

                    {/* Search for target */}
                    <div className="merge-step">
                        <div className="merge-step-label">Contato de Destino (contato canônico)</div>
                        <div className="merge-search">
                            <Search size={14} className="merge-search-icon" />
                            <input
                                value={query}
                                onChange={e => { setQuery(e.target.value); setSelected(null); setConfirmed(false); }}
                                placeholder="Buscar por nome, CPF, telefone, e-mail..."
                                className="merge-search-input"
                                autoFocus
                            />
                        </div>

                        {/* Results */}
                        {results.length > 0 && !selected && (
                            <div className="merge-results">
                                {loading && (
                                    <div className="merge-loading">Buscando...</div>
                                )}
                                {results.map(c => (
                                    <div
                                        key={c.id}
                                        onClick={() => { setSelected(c); setConfirmed(false); }}
                                        className="merge-result-item"
                                    >
                                        <div className="merge-result-name">{c.fullName || c.name || c.phone}</div>
                                        <div className="merge-result-meta">
                                            <span><Phone size={10} />{c.phone}</span>
                                            {c.cpf && <span><FileText size={10} />{c.cpf}</span>}
                                            {c._count && <span>{c._count.tickets} ticket{c._count.tickets !== 1 ? 's' : ''}</span>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Selected target */}
                        {selected && (
                            <div className="merge-selected">
                                <ContactCard
                                    name={selected.fullName || selected.name || selected.phone}
                                    phone={selected.phone}
                                    cpf={selected.cpf}
                                    tickets={selected._count?.tickets}
                                    selected
                                    onRemove={() => { setSelected(null); setConfirmed(false); }}
                                />
                            </div>
                        )}
                    </div>

                    {/* Warning */}
                    {selected && (
                        <div className="merge-warning">
                            <AlertTriangle size={15} />
                            <div>
                                <strong>Ação irreversível.</strong> Todos os tickets e mensagens de <strong>{sourceContactName || sourceContactPhone}</strong> serão transferidos para <strong>{selected.fullName || selected.name || selected.phone}</strong>. O contato original se tornará um alias.
                            </div>
                        </div>
                    )}

                    {/* Confirm checkbox */}
                    {selected && (
                        <label className="merge-confirm">
                            <div
                                className={`merge-checkbox${confirmed ? ' checked' : ''}`}
                                onClick={() => setConfirmed(c => !c)}
                            >
                                {confirmed && <Check size={11} />}
                            </div>
                            <span>Compreendo que a fusão é permanente e não pode ser desfeita.</span>
                        </label>
                    )}

                    {error && (
                        <div className="form-error-banner">{error}</div>
                    )}

                    {/* Actions */}
                    <div className="merge-actions">
                        <button onClick={onClose} className="btn btn-secondary btn-sm">Cancelar</button>
                        <button
                            onClick={handleMerge}
                            disabled={!selected || !confirmed || merging}
                            className="btn btn-primary btn-sm"
                            style={{ opacity: (!selected || !confirmed) ? 0.5 : 1 }}
                        >
                            <GitMerge size={14} /> {merging ? 'Fundindo...' : 'Confirmar Fusão'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ContactCard({ name, phone, cpf, tickets, selected, dimmed, onRemove }: {
    name: string; phone: string; cpf?: string; tickets?: number;
    selected?: boolean; dimmed?: boolean; onRemove?: () => void;
}) {
    return (
        <div className={`contact-card${selected ? ' selected' : ''}${dimmed ? ' dimmed' : ''}`}>
            <div>
                <div className="contact-card-name">{name}</div>
                <div className="contact-card-meta">
                    <span>{phone}</span>
                    {cpf && <span>CPF: {cpf}</span>}
                    {tickets !== undefined && <span>{tickets} ticket{tickets !== 1 ? 's' : ''}</span>}
                </div>
            </div>
            {onRemove && (
                <button onClick={onRemove} className="btn-ghost btn-icon-sm">
                    <X size={14} />
                </button>
            )}
            {selected && !onRemove && <Check size={16} />}
        </div>
    );
}
