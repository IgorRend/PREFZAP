import { useEffect, useState } from 'react';
import api from '../services/api';
import { useDictionary } from '../contexts/DictionaryContext';
import { useModules } from '../contexts/ModulesContext';
import { useToast } from '../hooks/useToast';
import {
    ChevronLeft, ChevronRight, RefreshCw, Tag as TagIcon,
} from 'lucide-react';
import {
    AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

/* ── Types ── */
interface AnalyticsSummary {
    tmr: number; tma: number; totalTickets: number; openTickets: number;
    queueTickets: number; onlineAgents: number;
    agentVolume: { agentId: string; name: string; closed: number; open: number }[];
    dailyVolume: { date: string; total: number; closed: number; open: number }[];
}
interface ContactRow { id: string; name: string; phone: string; createdAt: string; _count: { tickets: number } }
interface DddRow { state: string; stateName: string; count: number }
interface NpsAgentRow { agentId: string; name: string; avgScore: number | null; totalRatings: number }
interface NpsLogRow { id: string; score: number; comment: string | null; contactName: string; agentName: string; createdAt: string }
interface TagOption { id: string; name: string; color: string }

function fmtDuration(s: number): string {
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

const CHART_COLORS = ['#10b981', '#34d399', '#6ee7b7', '#a78bfa', '#60a5fa', '#f59e0b', '#f43f5e', '#c084fc'];

const TT_STYLE = {
    background: 'var(--z-800)',
    border: '1px solid var(--border-md)',
    borderRadius: 8,
    fontSize: 12,
    color: 'var(--z-100)',
    boxShadow: 'var(--shadow-lg)',
};

type DashTab = 'summary' | 'contacts' | 'nps';

/* ── MetricsStrip: inline data row, no cards, no icons ── */
interface MetricItem {
    label: string;
    value: string;
    live?: boolean;
    warn?: boolean;
}

function MetricsStrip({ items }: { items: MetricItem[] }) {
    return (
        <div className="flex overflow-hidden" style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--z-900)' }}>
            {items.map((item, i) => (
                <div
                    key={item.label}
                    className="flex-1 px-5"
                    style={{
                        padding: '14px 20px',
                        borderRight: i < items.length - 1 ? '1px solid var(--border)' : 'none',
                    }}
                >
                    <div className="text-[11px] leading-none mb-2" style={{ color: 'var(--z-500)' }}>
                        {item.label}
                    </div>
                    <div className="flex items-center gap-1.5">
                        {item.live && (
                            <span
                                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                style={{ background: 'var(--em-500)' }}
                            />
                        )}
                        <span
                            className="text-[22px] font-semibold leading-none"
                            style={{
                                color: item.warn ? 'var(--amber-500)' : 'var(--z-100)',
                                fontVariantNumeric: 'tabular-nums',
                                letterSpacing: '-0.01em',
                            }}
                        >
                            {item.value}
                        </span>
                    </div>
                </div>
            ))}
        </div>
    );
}

/* ── Panel: tonal surface container ── */
function Panel({ children, className = '', noPad = false }: {
    children: React.ReactNode;
    className?: string;
    noPad?: boolean;
}) {
    return (
        <div
            className={`overflow-hidden ${className}`}
            style={{ background: 'var(--z-900)', border: '1px solid var(--border)', borderRadius: 10 }}
        >
            {noPad ? children : <div className="p-5">{children}</div>}
        </div>
    );
}

/* ── PanelRow: consistent panel header ── */
function PanelRow({ title, action }: { title: React.ReactNode; action?: React.ReactNode }) {
    return (
        <div className="px-5 py-3.5 flex items-center justify-between"
            style={{ borderBottom: '1px solid var(--border)' }}>
            <span className="text-[13px] font-semibold" style={{ color: 'var(--z-200)' }}>{title}</span>
            {action && <div className="flex items-center gap-2">{action}</div>}
        </div>
    );
}

/* ── Pagination controls ── */
function Pagination({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
    if (total <= 1) return null;
    return (
        <div className="px-5 py-3 flex items-center justify-between" style={{ borderTop: '1px solid var(--border)' }}>
            <span className="text-[11px]" style={{ color: 'var(--z-500)' }}>
                Pág {page} de {total}
            </span>
            <div className="flex gap-1">
                {[
                    { dir: -1, disabled: page <= 1 },
                    { dir: 1, disabled: page >= total },
                ].map(({ dir, disabled }, i) => (
                    <button
                        key={i}
                        onClick={() => onChange(page + dir)}
                        disabled={disabled}
                        className="w-7 h-7 flex items-center justify-center transition-colors disabled:opacity-30"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--z-300)', borderRadius: 8 }}
                    >
                        {dir < 0 ? <ChevronLeft size={13} /> : <ChevronRight size={13} />}
                    </button>
                ))}
            </div>
        </div>
    );
}

/* ── Page shell ── */
export default function Dashboard() {
    const [tab, setTab] = useState<DashTab>('summary');
    const [period, setPeriod] = useState('7d');
    const { t } = useDictionary();
    const { hasModule } = useModules();

    const tabs: { key: DashTab; label: string }[] = [
        { key: 'summary', label: 'Resumo' },
        { key: 'contacts', label: t('CONTACT_PLURAL') },
    ];
    if (hasModule('nps')) tabs.push({ key: 'nps', label: 'NPS' });

    const periods = [
        { val: '1d', label: 'Hoje' },
        { val: '7d', label: '7d' },
        { val: '30d', label: '30d' },
        { val: 'all', label: 'Tudo' },
    ];

    return (
        <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--z-950)' }}>

            {/* Header */}
            <div className="shrink-0 px-6 pt-5 pb-0" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between mb-4">
                    <h1 className="text-xl font-bold" style={{ color: 'var(--z-100)', letterSpacing: '-0.01em' }}>
                        Dashboard
                    </h1>

                    {/* Period selector */}
                    <div
                        className="flex items-center p-0.5"
                        style={{ background: 'var(--z-850)', border: '1px solid var(--border)', borderRadius: 10 }}
                    >
                        {periods.map(p => (
                            <button
                                key={p.val}
                                onClick={() => setPeriod(p.val)}
                                className="px-3 py-1.5 text-xs font-medium transition-all duration-150"
                                style={{
                                    borderRadius: 8,
                                    background: period === p.val ? 'var(--em-subtle)' : 'transparent',
                                    color: period === p.val ? 'var(--em-400)' : 'var(--z-400)',
                                    border: period === p.val ? '1px solid var(--border-em)' : '1px solid transparent',
                                }}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Tab nav */}
                <div className="flex gap-1">
                    {tabs.map(tb => (
                        <button
                            key={tb.key}
                            onClick={() => setTab(tb.key)}
                            className="px-4 py-2.5 text-[13px] font-medium transition-colors duration-150 relative"
                            style={{
                                background: 'none',
                                border: 'none',
                                borderBottom: `2px solid ${tab === tb.key ? 'var(--em-500)' : 'transparent'}`,
                                color: tab === tb.key ? 'var(--em-400)' : 'var(--z-400)',
                                cursor: 'pointer',
                                outline: 'none',
                                marginBottom: -1,
                            }}
                        >
                            {tb.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto px-6 py-5">
                {tab === 'summary' && <SummaryTab period={period} />}
                {tab === 'contacts' && <ContactsTab />}
                {tab === 'nps' && <NpsTab period={period} />}
            </div>
        </div>
    );
}

/* ─── Summary Tab ─── */
function SummaryTab({ period }: { period: string }) {
    const [data, setData] = useState<AnalyticsSummary | null>(null);
    const { t } = useDictionary();

    useEffect(() => {
        const p = new URLSearchParams();
        const now = new Date();
        if (period === '1d') { const f = new Date(now); f.setHours(0,0,0,0); p.set('from', f.toISOString()); }
        else if (period === '7d') { const f = new Date(now); f.setDate(f.getDate()-7); p.set('from', f.toISOString()); }
        else if (period === '30d') { const f = new Date(now); f.setDate(f.getDate()-30); p.set('from', f.toISOString()); }
        api.get(`/analytics/summary?${p}`)
            .then(r => setData(r.data))
            .catch(e => console.error('Dashboard summary fetch failed:', e));
    }, [period]);

    if (!data) return (
        <div className="space-y-4">
            <div className="skeleton h-[68px]" style={{ borderRadius: 10 }} />
            <div className="grid grid-cols-2 gap-4">
                <div className="skeleton h-[240px]" style={{ borderRadius: 10 }} />
                <div className="skeleton h-[240px]" style={{ borderRadius: 10 }} />
            </div>
            <div className="skeleton h-[200px]" style={{ borderRadius: 10 }} />
        </div>
    );

    const daily = data.dailyVolume.map(d => ({
        ...d,
        label: new Date(d.date + 'T00:00:00').toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' }),
    }));

    const metricItems: MetricItem[] = [
        { label: 'Abertos',           value: String(data.openTickets) },
        { label: 'Na Fila',           value: String(data.queueTickets), warn: data.queueTickets > 5 },
        { label: 'Online',            value: String(data.onlineAgents), live: true },
        { label: 'Total no Período',  value: String(data.totalTickets) },
        { label: 'Tempo de Resposta', value: fmtDuration(data.tmr) },
        { label: 'Resolução Média',   value: fmtDuration(data.tma) },
    ];

    return (
        <div className="space-y-4">

            {/* Metrics strip — one row, no cards */}
            <MetricsStrip items={metricItems} />

            {/* Charts row */}
            <div className="grid grid-cols-2 gap-4">

                {/* Daily volume */}
                <Panel>
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-[13px] font-semibold" style={{ color: 'var(--z-200)' }}>
                            Volume Diário
                        </span>
                        <div className="flex items-center gap-3 text-[11px]" style={{ color: 'var(--z-500)' }}>
                            <span className="flex items-center gap-1.5">
                                <span className="w-2 h-0.5 inline-block rounded-full" style={{ background: 'var(--em-500)' }} />
                                Total
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span className="w-2 h-0.5 inline-block rounded-full" style={{ background: 'var(--em-400)' }} />
                                Fechados
                            </span>
                        </div>
                    </div>
                    {daily.length > 0 ? (
                        <ResponsiveContainer width="100%" height={192}>
                            <AreaChart data={daily} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                                <defs>
                                    <linearGradient id="gTotal" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.25} />
                                        <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="gClosed" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#34d399" stopOpacity={0.15} />
                                        <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} allowDecimals={false} />
                                <Tooltip contentStyle={TT_STYLE} cursor={{ stroke: 'rgba(255,255,255,0.06)', strokeDasharray: '4 2' }} />
                                <Area type="monotone" dataKey="total" name="Total" stroke="#10b981" strokeWidth={1.5} fill="url(#gTotal)" dot={false} />
                                <Area type="monotone" dataKey="closed" name="Fechados" stroke="#34d399" strokeWidth={1} fill="url(#gClosed)" dot={false} />
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-[192px] flex items-center justify-center text-sm" style={{ color: 'var(--z-500)' }}>
                            Sem dados no período
                        </div>
                    )}
                </Panel>

                {/* Agent volume chart */}
                <Panel>
                    <div className="text-[13px] font-semibold mb-4" style={{ color: 'var(--z-200)' }}>
                        Volume por {t('AGENT_LABEL')}
                    </div>
                    {data.agentVolume.length > 0 ? (
                        <ResponsiveContainer width="100%" height={192}>
                            <BarChart data={data.agentVolume} layout="vertical" margin={{ top: 0, right: 4, bottom: 0, left: 4 }}>
                                <XAxis type="number" tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} allowDecimals={false} />
                                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} width={72} />
                                <Tooltip contentStyle={TT_STYLE} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                                <Bar dataKey="closed" name="Fechados" radius={[0, 4, 4, 0]}>
                                    {data.agentVolume.map((_, i) => (
                                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.8} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-[192px] flex items-center justify-center text-sm" style={{ color: 'var(--z-500)' }}>
                            Sem dados no período
                        </div>
                    )}
                </Panel>
            </div>

            {/* Agent table */}
            {data.agentVolume.length > 0 && (
                <Panel noPad>
                    <PanelRow title={`Equipe — ${data.agentVolume.length} agentes`} />
                    <table className="w-full text-sm">
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                {[t('AGENT_LABEL'), 'Abertos', 'Fechados', 'Total'].map(h => (
                                    <th key={h} className="px-5 py-2.5 text-left text-[11px] font-medium" style={{ color: 'var(--z-500)' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {data.agentVolume.map((a, i) => (
                                <tr
                                    key={a.agentId}
                                    style={{ borderBottom: '1px solid var(--border)' }}
                                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                >
                                    <td className="px-5 py-2.5 font-medium" style={{ color: 'var(--z-100)' }}>
                                        <div className="flex items-center gap-2.5">
                                            <div
                                                className="w-5 h-5 flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                                                style={{
                                                    borderRadius: 6,
                                                    background: CHART_COLORS[i % CHART_COLORS.length] + '22',
                                                    color: CHART_COLORS[i % CHART_COLORS.length],
                                                }}
                                            >
                                                {a.name[0]}
                                            </div>
                                            {a.name}
                                        </div>
                                    </td>
                                    <td className="px-5 py-2.5 tabular-nums text-[13px]" style={{ color: 'var(--z-300)' }}>
                                        {a.open}
                                    </td>
                                    <td className="px-5 py-2.5 tabular-nums text-[13px]" style={{ color: 'var(--em-400)' }}>
                                        {a.closed}
                                    </td>
                                    <td className="px-5 py-2.5 tabular-nums text-[13px] font-semibold" style={{ color: 'var(--z-100)' }}>
                                        {a.open + a.closed}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Panel>
            )}
        </div>
    );
}

/* ─── Contacts Tab ─── */
function ContactsTab() {
    const [contacts, setContacts] = useState<ContactRow[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [tags, setTags] = useState<TagOption[]>([]);
    const [selectedTag, setSelectedTag] = useState('');
    const [dddData, setDddData] = useState<DddRow[]>([]);
    const [isSyncing, setIsSyncing] = useState(false);
    const { t } = useDictionary();
    const { showToast, ToastContainer } = useToast();

    useEffect(() => {
        api.get('/tags').then(r => setTags(r.data)).catch(e => console.error('Dashboard tags fetch failed:', e));
        api.get('/analytics/contacts-by-ddd').then(r => setDddData(r.data)).catch(e => console.error('Dashboard contacts-by-ddd fetch failed:', e));
    }, []);

    const fetchContacts = () => {
        const p = new URLSearchParams({ page: page.toString(), limit: '30' });
        if (selectedTag) p.set('tagId', selectedTag);
        api.get(`/analytics/contacts?${p}`).then(r => {
            setContacts(r.data.contacts); setTotal(r.data.total); setTotalPages(r.data.totalPages);
        }).catch(e => console.error('Dashboard contacts fetch failed:', e));
    };
    useEffect(() => { fetchContacts(); }, [page, selectedTag]);

    const handleSync = async () => {
        setIsSyncing(true);
        try {
            const r = await api.post('/contacts/sync');
            showToast(`${r.data.syncedCount} contatos sincronizados`, 'success');
            setPage(1); fetchContacts();
        } catch (e: any) { showToast(e.response?.data?.error || 'Erro', 'error'); }
        finally { setIsSyncing(false); }
    };

    return (
        <>
            <ToastContainer />
            <div className="grid grid-cols-2 gap-4">

                {/* Contacts table */}
                <Panel noPad>
                    <PanelRow
                        title={<>{t('CONTACT_PLURAL')} <span style={{ color: 'var(--z-500)', fontWeight: 400 }}>({total})</span></>}
                        action={
                            <>
                                <button
                                    onClick={handleSync}
                                    disabled={isSyncing}
                                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium transition-all"
                                    style={{ background: 'var(--em-subtle)', color: 'var(--em-400)', border: '1px solid var(--border-em)', borderRadius: 7 }}
                                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(16,185,129,0.15)')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'var(--em-subtle)')}
                                >
                                    <RefreshCw size={11} className={isSyncing ? 'animate-spin' : ''} />
                                    Sincronizar
                                </button>
                                <TagIcon size={12} style={{ color: 'var(--z-500)' }} />
                                <select
                                    value={selectedTag}
                                    onChange={e => { setSelectedTag(e.target.value); setPage(1); }}
                                    aria-label="Filtrar por tag"
                                    className="text-xs px-2 py-1 outline-none"
                                    style={{ background: 'var(--z-800)', border: '1px solid var(--border)', color: 'var(--z-300)', borderRadius: 7 }}
                                >
                                    <option value="">Todas as tags</option>
                                    {tags.map(tg => <option key={tg.id} value={tg.id}>{tg.name}</option>)}
                                </select>
                            </>
                        }
                    />
                    <table className="w-full text-sm">
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                {['Nome', 'Telefone', 'Tickets'].map(h => (
                                    <th key={h} className="px-5 py-2 text-left text-[11px] font-medium" style={{ color: 'var(--z-500)' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {contacts.map(c => (
                                <tr key={c.id}
                                    style={{ borderBottom: '1px solid var(--border)' }}
                                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                >
                                    <td className="px-5 py-2.5 font-medium" style={{ color: 'var(--z-100)' }}>{c.name || '—'}</td>
                                    <td className="px-5 py-2.5 text-xs font-mono" style={{ color: 'var(--z-400)' }}>{c.phone}</td>
                                    <td className="px-5 py-2.5">
                                        <span className="text-[11px] px-2 py-0.5" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--z-300)', borderRadius: 20 }}>
                                            {c._count.tickets}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {contacts.length === 0 && (
                                <tr>
                                    <td colSpan={3} className="px-5 py-10 text-center text-sm" style={{ color: 'var(--z-500)' }}>
                                        {t('NO_CONTACT_FOUND')}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                    <Pagination page={page} total={totalPages} onChange={setPage} />
                </Panel>

                {/* DDD chart */}
                <Panel>
                    <div className="text-[13px] font-semibold mb-4" style={{ color: 'var(--z-200)' }}>
                        {t('CONTACTS_BY_STATE')}
                    </div>
                    {dddData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={280}>
                            <PieChart>
                                <Pie
                                    data={dddData.slice(0,10)}
                                    dataKey="count"
                                    nameKey="state"
                                    cx="50%" cy="50%"
                                    outerRadius={100}
                                    label={(e: any) => `${e.state}: ${e.count}`}
                                    labelLine={{ strokeWidth: 1, stroke: 'rgba(255,255,255,0.15)' }}
                                >
                                    {dddData.slice(0,10).map((_,i) => <Cell key={i} fill={CHART_COLORS[i%CHART_COLORS.length]} fillOpacity={0.85} />)}
                                </Pie>
                                <Tooltip contentStyle={TT_STYLE} formatter={(v: any,_: any,p: any) => [`${v} contatos`, p.payload.stateName]} />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-[280px] flex items-center justify-center text-sm" style={{ color: 'var(--z-500)' }}>
                            Sem dados
                        </div>
                    )}
                </Panel>
            </div>
        </>
    );
}

/* ─── NPS Tab ─── */
function NpsTab({ period }: { period: string }) {
    const [agents, setAgents] = useState<NpsAgentRow[]>([]);
    const [log, setLog] = useState<NpsLogRow[]>([]);
    const [logTotal, setLogTotal] = useState(0);
    const [logPage, setLogPage] = useState(1);
    const [logTotalPages, setLogTotalPages] = useState(1);

    useEffect(() => {
        const p = new URLSearchParams();
        const now = new Date();
        if (period === '1d') { const f = new Date(now); f.setHours(0,0,0,0); p.set('from', f.toISOString()); }
        else if (period === '7d') { const f = new Date(now); f.setDate(f.getDate()-7); p.set('from', f.toISOString()); }
        else if (period === '30d') { const f = new Date(now); f.setDate(f.getDate()-30); p.set('from', f.toISOString()); }
        api.get(`/analytics/nps-per-agent?${p}`)
            .then(r => setAgents(r.data))
            .catch(e => console.error('Dashboard nps-per-agent fetch failed:', e));
    }, [period]);

    useEffect(() => {
        const p = new URLSearchParams({ page: logPage.toString(), limit: '20' });
        api.get(`/analytics/nps-log?${p}`).then(r => {
            setLog(r.data.ratings); setLogTotal(r.data.total); setLogTotalPages(r.data.totalPages);
        }).catch(e => console.error('Dashboard nps-log fetch failed:', e));
    }, [logPage]);

    const totalR = agents.reduce((s, a) => s + a.totalRatings, 0);
    const avg = totalR > 0
        ? (agents.reduce((s, a) => s + (a.avgScore || 0) * a.totalRatings, 0) / totalR).toFixed(1)
        : '—';
    const scoreNum = Number(avg);

    const scoreLabel = (s: number) => s >= 9 ? 'Promotor' : s >= 7 ? 'Neutro' : 'Detrator';
    const scoreBg    = (s: number) => s >= 9 ? 'rgba(16,185,129,0.10)' : s >= 7 ? 'rgba(245,158,11,0.10)' : 'rgba(239,68,68,0.10)';
    const scoreClr   = (s: number) => s >= 9 ? '#10b981' : s >= 7 ? '#f59e0b' : '#ef4444';

    const npsMetrics: MetricItem[] = [
        { label: 'Nota Média',    value: String(avg),    live: scoreNum >= 8 },
        { label: 'Avaliações',   value: String(totalR) },
        { label: 'Promotores',   value: String(agents.filter(a => (a.avgScore ?? 0) >= 9).length) },
        { label: 'Detratores',   value: String(agents.filter(a => (a.avgScore ?? 0) < 7).length), warn: agents.filter(a => (a.avgScore ?? 0) < 7).length > 0 },
    ];

    return (
        <div className="space-y-4">

            {/* NPS summary strip */}
            <MetricsStrip items={npsMetrics} />

            {/* Agent bar chart */}
            <Panel>
                <div className="text-[13px] font-semibold mb-4" style={{ color: 'var(--z-200)' }}>
                    Nota por atendente
                </div>
                {agents.length > 0 ? (
                    <ResponsiveContainer width="100%" height={160}>
                        <BarChart data={agents}>
                            <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} />
                            <YAxis domain={[0, 10]} tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={TT_STYLE} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                            <Bar dataKey="avgScore" name="Nota" radius={[4, 4, 0, 0]}>
                                {agents.map((a, i) => (
                                    <Cell key={i} fill={scoreClr(a.avgScore ?? 0)} fillOpacity={0.75} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-[160px] flex items-center justify-center text-sm" style={{ color: 'var(--z-500)' }}>
                        Sem avaliações no período
                    </div>
                )}
            </Panel>

            {/* Ratings log table */}
            <Panel noPad>
                <PanelRow title={<>Log de Avaliações <span style={{ color: 'var(--z-500)', fontWeight: 400 }}>({logTotal})</span></>} />
                <table className="w-full text-sm">
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                            {['Cliente', 'Nota', 'Comentário', 'Atendente', 'Data'].map(h => (
                                <th key={h} className="px-5 py-2 text-left text-[11px] font-medium" style={{ color: 'var(--z-500)' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {log.map(r => (
                            <tr key={r.id}
                                style={{ borderBottom: '1px solid var(--border)' }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >
                                <td className="px-5 py-3 font-medium" style={{ color: 'var(--z-100)' }}>{r.contactName}</td>
                                <td className="px-5 py-3">
                                    <span className="text-[11px] px-2 py-0.5 font-semibold" style={{ background: scoreBg(r.score), color: scoreClr(r.score), borderRadius: 20 }}>
                                        {r.score} · {scoreLabel(r.score)}
                                    </span>
                                </td>
                                <td className="px-5 py-3 max-w-[200px] truncate text-xs" style={{ color: r.comment ? 'var(--z-300)' : 'var(--z-500)' }}>
                                    {r.comment || '—'}
                                </td>
                                <td className="px-5 py-3 text-xs" style={{ color: 'var(--z-400)' }}>{r.agentName}</td>
                                <td className="px-5 py-3 text-xs font-mono" style={{ color: 'var(--z-500)', fontVariantNumeric: 'tabular-nums' }}>
                                    {new Date(r.createdAt).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' })}
                                </td>
                            </tr>
                        ))}
                        {log.length === 0 && (
                            <tr>
                                <td colSpan={5} className="px-5 py-10 text-center text-sm" style={{ color: 'var(--z-500)' }}>
                                    Nenhuma avaliação ainda
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
                <Pagination page={logPage} total={logTotalPages} onChange={setLogPage} />
            </Panel>
        </div>
    );
}
