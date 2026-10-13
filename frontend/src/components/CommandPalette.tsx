import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Search, X, Hash, Phone, User } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────

interface SearchResult {
    id: string;
    protocol: string;
    status: string;
    updatedAt: string;
    contact: { id: string; name: string | null; phone: string; cpf?: string | null };
    department?: { name: string } | null;
}

const statusColors: Record<string, string> = {
    OPEN: '#22c55e',
    QUEUE: '#f59e0b',
    BOT: '#3b82f6',
    CLOSED: '#9ca3af',
    PENDING_NPS: '#8b5cf6',
};

const statusLabels: Record<string, string> = {
    OPEN: 'Aberto', QUEUE: 'Fila', BOT: 'Bot', CLOSED: 'Fechado', PENDING_NPS: 'NPS',
};

// ─── CommandPalette Component ─────────────────────────────

interface CommandPaletteProps {
    onClose: () => void;
}

export default function CommandPalette({ onClose }: CommandPaletteProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const navigate = useNavigate();

    // Auto-focus on open
    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    // Debounced search
    useEffect(() => {
        if (!query.trim()) { setResults([]); setSelectedIndex(0); return; }
        const t = setTimeout(async () => {
            setLoading(true);
            try {
                const { data } = await api.get(`/tickets/search?q=${encodeURIComponent(query)}`);
                setResults(data);
                setSelectedIndex(0);
            } catch { setResults([]); }
            setLoading(false);
        }, 250);
        return () => clearTimeout(t);
    }, [query]);

    const goToTicket = useCallback((ticket: SearchResult) => {
        // Navigate to chat with ticket pre-selected via URL param
        navigate(`/chat?ticketId=${ticket.id}`);
        onClose();
    }, [navigate, onClose]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') { onClose(); return; }
        if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, results.length - 1)); }
        if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)); }
        if (e.key === 'Enter' && results[selectedIndex]) { goToTicket(results[selectedIndex]); }
    };

    return (
        <div
            className="command-palette"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="command-palette-panel">
                {/* Search Input */}
                <div className="command-palette-input-area">
                    <Search size={18} color="var(--text-secondary)" />
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
                        onKeyDown={handleKeyDown}
                        placeholder="Buscar por nome, CPF, telefone ou protocolo..."
                    />
                    {query && (
                        <button onClick={() => setQuery('')} className="btn-ghost btn-icon-sm">
                            <X size={16} />
                        </button>
                    )}
                    <kbd className="command-palette-hint">Esc</kbd>
                </div>

                {/* Loading */}
                {loading && (
                    <div className="py-5 text-center text-sm text-muted-foreground">Buscando...</div>
                )}

                {/* No results */}
                {!loading && results.length === 0 && query.trim() && (
                    <div className="py-5 text-center text-sm text-muted-foreground">
                        Nenhum resultado para <strong>"{query}"</strong>
                    </div>
                )}

                {/* Tips when empty */}
                {!loading && results.length === 0 && !query.trim() && (
                    <div className="p-5">
                        <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Dicas</div>
                        <div className="text-sm text-muted-foreground leading-relaxed">
                            <kbd>↑</kbd> <kbd>↓</kbd> para navegar · <kbd>Enter</kbd> para abrir · <kbd>Esc</kbd> para fechar<br />
                            Busque por nome do cidadão, CPF, telefone ou número de protocolo
                        </div>
                    </div>
                )}

                {/* Results */}
                {results.length > 0 && (
                    <div className="command-palette-results">
                        {results.map((ticket, i) => (
                            <div
                                key={ticket.id}
                                className={`command-palette-item${i === selectedIndex ? ' selected' : ''}`}
                                onClick={() => goToTicket(ticket)}
                                onMouseEnter={() => setSelectedIndex(i)}
                            >
                                {/* Avatar */}
                                <div className="command-palette-avatar">
                                    {ticket.contact.name?.charAt(0).toUpperCase() || <User size={16} />}
                                </div>

                                {/* Main info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 mb-0.5">
                                        <span className="font-bold text-sm">
                                            {ticket.contact.name || ticket.contact.phone}
                                        </span>
                                        {ticket.department && (
                                            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                                {ticket.department.name}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                                        <span className="flex items-center gap-1"><Hash size={10} /> {ticket.protocol}</span>
                                        <span className="flex items-center gap-1"><Phone size={10} /> {ticket.contact.phone}</span>
                                        {ticket.contact.cpf && <span>CPF: {ticket.contact.cpf}</span>}
                                    </div>
                                </div>

                                {/* Status badge */}
                                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full shrink-0"
                                    style={{ background: `${statusColors[ticket.status] || '#9ca3af'}22`, color: statusColors[ticket.status] || '#9ca3af' }}>
                                    {statusLabels[ticket.status] || ticket.status}
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Footer */}
                <div className="command-palette-footer">
                    <span>
                        <kbd>↑</kbd>
                        <kbd>↓</kbd>
                        navegar
                    </span>
                    <span>
                        <kbd>Enter</kbd>
                        abrir ticket
                    </span>
                </div>
            </div>
        </div>
    );
}
