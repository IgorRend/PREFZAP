import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { Shield, Search, Download, RefreshCw, ChevronLeft, ChevronRight, User, LogIn, LogOut, Settings, Plus, Pencil, Trash2, ArrowRightLeft, X } from 'lucide-react';

interface AuditLog {
    id: string; userId: string | null; userName: string | null; action: string;
    entity: string; entityId: string | null; oldValue: string | null; newValue: string | null;
    ip: string | null; createdAt: string; user?: { name: string; email: string } | null;
}
interface AuditResponse { total: number; page: number; limit: number; logs: AuditLog[]; }

const ACTION_META: Record<string, { label: string; bg: string; color: string; icon: React.ReactNode }> = {
    LOGIN:        { label: 'Login',         bg: 'rgba(16,185,129,0.1)',  color: '#10b981', icon: <LogIn size={11} /> },
    LOGIN_FAILED: { label: 'Login Falhou',  bg: 'rgba(239,68,68,0.1)',   color: '#ef4444', icon: <LogIn size={11} /> },
    LOGOUT:       { label: 'Logout',        bg: 'rgba(113,113,122,0.1)', color: '#71717a', icon: <LogOut size={11} /> },
    CREATE:       { label: 'Criação',       bg: 'rgba(59,130,246,0.1)',  color: '#60a5fa', icon: <Plus size={11} /> },
    UPDATE:       { label: 'Alteração',     bg: 'rgba(245,158,11,0.1)',  color: '#fbbf24', icon: <Pencil size={11} /> },
    DELETE:       { label: 'Exclusão',      bg: 'rgba(239,68,68,0.1)',   color: '#ef4444', icon: <Trash2 size={11} /> },
    TRANSFER:     { label: 'Transferência', bg: 'rgba(139,92,246,0.1)',  color: '#a78bfa', icon: <ArrowRightLeft size={11} /> },
    CLOSE:        { label: 'Encerramento',  bg: 'rgba(113,113,122,0.1)', color: '#71717a', icon: <X size={11} /> },
    EXPORT:       { label: 'Exportação',    bg: 'rgba(20,184,166,0.1)',  color: '#34d399', icon: <Download size={11} /> },
};

const getMeta = (action: string) => ACTION_META[action] || { label: action, bg: 'rgba(113,113,122,0.1)', color: '#71717a', icon: <Settings size={11} /> };
const fmtDT = (d: string) => new Date(d).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' });
const LIMIT = 25;

export default function AuditLogs() {
    const [data, setData] = useState<AuditResponse | null>(null);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [filterEntity, setFilterEntity] = useState('');
    const [filterAction, setFilterAction] = useState('');
    const [filterFrom, setFilterFrom] = useState('');
    const [filterTo, setFilterTo] = useState('');

    const fetch = useCallback(async (p = page) => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            params.set('page', String(p)); params.set('limit', String(LIMIT));
            if (filterEntity) params.set('entity', filterEntity);
            if (filterAction) params.set('action', filterAction);
            if (filterFrom) params.set('from', filterFrom);
            if (filterTo) params.set('to', filterTo);
            const { data: res } = await api.get(`/audit?${params}`);
            setData(res);
        } catch { }
        setLoading(false);
    }, [page, filterEntity, filterAction, filterFrom, filterTo]);

    useEffect(() => { fetch(1); setPage(1); }, [filterEntity, filterAction, filterFrom, filterTo]);
    useEffect(() => { fetch(page); }, [page]);

    const totalPages = data ? Math.ceil(data.total / LIMIT) : 1;

    const exportCsv = () => {
        if (!data?.logs.length) return;
        const hdr = ['Data', 'Ação', 'Entidade', 'Usuário', 'IP', 'ID Entidade'];
        const rows = data.logs.map(l => [fmtDT(l.createdAt), l.action, l.entity, l.userName || l.user?.name || '-', l.ip || '-', l.entityId || '-']);
        const csv = [hdr, ...rows].map(r => r.join(',')).join('\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
        const a = document.createElement('a'); a.href = url; a.download = `audit_${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
    };

    const inputCls = "h-9 px-3 rounded-xl text-sm outline-none transition-all";
    const inputSt = { background: 'var(--z-850)', border: '1px solid var(--border)', color: 'var(--z-300)' };

    return (
        <div className="h-full overflow-auto px-6 py-5" style={{ background: 'var(--z-950)' }}>
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.2)' }}>
                        <Shield size={18} style={{ color: '#a78bfa' }} />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-white tracking-tight">Trilha de Auditoria</h1>
                        <p className="text-sm mt-0.5" style={{ color: 'var(--z-400)' }}>
                            {data ? `${data.total.toLocaleString('pt-BR')} registros` : 'Carregando...'}
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => fetch(page)} disabled={loading} className="flex items-center gap-2 h-9 px-3.5 rounded-xl text-sm font-medium transition-all"
                        style={{ background: 'var(--z-850)', border: '1px solid var(--border)', color: 'var(--z-300)' }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-md)'}
                        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                        <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Atualizar
                    </button>
                    <button onClick={exportCsv} disabled={!data?.logs.length} className="flex items-center gap-2 h-9 px-3.5 rounded-xl text-sm font-semibold text-white transition-all"
                        style={{ background: 'linear-gradient(135deg, var(--em-600), var(--em-500))', boxShadow: 'var(--shadow-em)' }}>
                        <Download size={13} /> Exportar CSV
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex gap-2.5 mb-5 flex-wrap">
                <div className="relative flex-1 min-w-[180px]">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--z-500)' }} />
                    <input value={filterEntity} onChange={e => setFilterEntity(e.target.value)} placeholder="Entidade (User, Ticket...)"
                        className="pl-8 pr-3 w-full h-9 rounded-xl text-sm outline-none" style={{ background: 'var(--z-850)', border: '1px solid var(--border)', color: 'var(--z-300)' }} />
                </div>
                <select value={filterAction} onChange={e => setFilterAction(e.target.value)} className={inputCls} style={{ ...inputSt, minWidth: 160 }}>
                    <option value="">Todas as ações</option>
                    {Object.entries(ACTION_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} title="De" className={inputCls} style={inputSt} />
                <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} title="Até" className={inputCls} style={inputSt} />
                {(filterEntity || filterAction || filterFrom || filterTo) && (
                    <button onClick={() => { setFilterEntity(''); setFilterAction(''); setFilterFrom(''); setFilterTo(''); }}
                        className="flex items-center gap-1.5 h-9 px-3 rounded-xl text-sm transition-all"
                        style={{ background: 'var(--z-850)', border: '1px solid var(--border)', color: 'var(--z-400)' }}>
                        <X size={12} /> Limpar
                    </button>
                )}
            </div>

            {/* Table */}
            <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--z-900)', border: '1px solid var(--border)' }}>
                <table className="w-full text-sm">
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--z-850)' }}>
                            {['Data/Hora', 'Ação', 'Entidade', 'Usuário', 'IP', 'Dados'].map(h => (
                                <th key={h} className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--z-500)' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading && !data && (
                            <tr><td colSpan={6} className="px-5 py-12 text-center text-sm" style={{ color: 'var(--z-500)' }}>Carregando...</td></tr>
                        )}
                        {!loading && data?.logs.length === 0 && (
                            <tr><td colSpan={6} className="px-5 py-12 text-center text-sm" style={{ color: 'var(--z-500)' }}>Nenhum registro com esses filtros.</td></tr>
                        )}
                        {data?.logs.map(log => {
                            const meta = getMeta(log.action);
                            const isExp = expanded === log.id;
                            const hasPay = !!(log.oldValue || log.newValue);
                            return (
                                <>
                                    <tr key={log.id}
                                        onClick={() => hasPay && setExpanded(isExp ? null : log.id)}
                                        style={{ borderBottom: '1px solid var(--border)', cursor: hasPay ? 'pointer' : 'default', background: isExp ? 'rgba(255,255,255,0.02)' : 'transparent' }}
                                        onMouseEnter={e => { if (!isExp) e.currentTarget.style.background = 'rgba(255,255,255,0.015)'; }}
                                        onMouseLeave={e => { if (!isExp) e.currentTarget.style.background = 'transparent'; }}
                                    >
                                        <td className="px-5 py-3 font-mono text-xs" style={{ color: 'var(--z-500)', whiteSpace: 'nowrap' }}>{fmtDT(log.createdAt)}</td>
                                        <td className="px-5 py-3">
                                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                                                style={{ background: meta.bg, color: meta.color }}>
                                                {meta.icon} {meta.label}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3">
                                            <span className="font-medium text-white">{log.entity}</span>
                                            {log.entityId && <span className="text-[10px] ml-1.5 font-mono" style={{ color: 'var(--z-500)' }}>#{log.entityId.slice(-6)}</span>}
                                        </td>
                                        <td className="px-5 py-3">
                                            <div className="flex items-center gap-1.5">
                                                <User size={11} style={{ color: 'var(--z-500)' }} />
                                                <span style={{ color: log.userName || log.user?.name ? 'var(--z-200)' : 'var(--z-500)' }}>
                                                    {log.userName || log.user?.name || 'Sistema'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3 font-mono text-xs" style={{ color: 'var(--z-500)' }}>{log.ip || '—'}</td>
                                        <td className="px-5 py-3">
                                            {hasPay ? (
                                                <span className="text-[11px] font-medium transition-colors" style={{ color: isExp ? 'var(--em-400)' : 'var(--z-500)' }}>
                                                    {isExp ? 'Ocultar ▲' : 'Ver ▼'}
                                                </span>
                                            ) : <span style={{ color: 'var(--z-600)' }}>—</span>}
                                        </td>
                                    </tr>
                                    {isExp && hasPay && (
                                        <tr key={`exp-${log.id}`} style={{ borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.015)' }}>
                                            <td colSpan={6} className="px-5 pb-4 pt-2">
                                                <div className="grid grid-cols-2 gap-4">
                                                    {log.oldValue && (
                                                        <div>
                                                            <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--red-500)' }}>Antes</div>
                                                            <pre className="text-[11px] rounded-xl p-3 overflow-x-auto max-h-52 leading-relaxed" style={{ background: 'var(--z-850)', color: 'var(--z-300)', border: '1px solid var(--border)' }}>
                                                                {JSON.stringify(JSON.parse(log.oldValue), null, 2)}
                                                            </pre>
                                                        </div>
                                                    )}
                                                    {log.newValue && (
                                                        <div>
                                                            <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--em-500)' }}>Depois</div>
                                                            <pre className="text-[11px] rounded-xl p-3 overflow-x-auto max-h-52 leading-relaxed" style={{ background: 'var(--z-850)', color: 'var(--z-300)', border: '1px solid var(--border)' }}>
                                                                {JSON.stringify(JSON.parse(log.newValue), null, 2)}
                                                            </pre>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {data && data.total > LIMIT && (
                <div className="flex items-center justify-center gap-3 mt-5">
                    {[
                        { icon: ChevronLeft, disabled: page <= 1, action: () => setPage(p => Math.max(p-1, 1)) },
                        { icon: ChevronRight, disabled: page >= totalPages, action: () => setPage(p => Math.min(p+1, totalPages)) },
                    ].map(({ icon: Ico, disabled, action }, i, arr) => (
                        <>
                            {i === 1 && (
                                <span className="text-sm" style={{ color: 'var(--z-400)' }}>
                                    <strong className="text-white">{page}</strong> / {totalPages}
                                </span>
                            )}
                            <button key={i} onClick={action} disabled={disabled}
                                className="w-8 h-8 rounded-xl flex items-center justify-center transition-all disabled:opacity-30"
                                style={{ background: 'var(--z-850)', border: '1px solid var(--border)', color: 'var(--z-300)' }}>
                                <Ico size={14} />
                            </button>
                        </>
                    ))}
                </div>
            )}
        </div>
    );
}
