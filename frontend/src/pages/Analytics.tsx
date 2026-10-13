import { useEffect, useState, useCallback } from 'react';
import {
    AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, Cell, Legend,
} from 'recharts';
import api from '../services/api';
import {
    Download, RefreshCw, TrendingUp, CheckCircle2, Clock, Users,
    AlertCircle, BarChart2, Calendar, Loader2,
} from 'lucide-react';

interface Overview { total: number; resolved: number; open: number; queue: number; bot: number; }
interface SlaData { tmr: number; tma: number; }
interface DeptVolume { name: string; count: number; }
interface DailyVolume { date: string; total: number; closed: number; open: number; }
interface NpsSummary { total: number; avg: number | null; npsScore: number | null; distribution: { score: number; count: number }[] }
interface AgentVolume { name: string; closed: number; open: number; }

type Preset = 'today' | '7d' | '30d' | 'custom';

function fmtSec(s: number): string {
    if (!s) return '—';
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.round(s / 60)}min`;
    const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function npsClr(score: number | null): string {
    if (score === null) return 'var(--z-400)';
    if (score >= 75) return '#10b981';
    if (score >= 50) return '#84cc16';
    if (score >= 0) return '#f59e0b';
    return '#ef4444';
}

const DEPT_COLORS = ['#10b981', '#34d399', '#60a5fa', '#a78bfa', '#f59e0b', '#f43f5e', '#6ee7b7'];
const TT_STYLE = { background: 'var(--z-800)', border: '1px solid var(--border-md)', borderRadius: 10, fontSize: 12, color: 'var(--z-100)', boxShadow: 'var(--shadow-lg)' };

/* ── Panel ── */
function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return <div className={`rounded-2xl p-5 ${className}`} style={{ background: 'var(--z-900)', border: '1px solid var(--border)' }}>{children}</div>;
}
function SL({ children }: { children: React.ReactNode }) {
    return <div className="text-[11px] font-bold uppercase tracking-widest mb-3 flex items-center gap-2" style={{ color: 'var(--z-500)' }}><BarChart2 size={12} style={{ color: 'var(--em-500)' }} />{children}</div>;
}

/* ── KPI ── */
function Kpi({ label, value, icon: Icon, color, sub }: { label: string; value: string | number; icon: React.ElementType; color: string; sub?: string }) {
    return (
        <div className="flex-1 min-w-[140px] rounded-2xl p-4" style={{ background: 'var(--z-900)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${color}18` }}>
                    <Icon size={15} style={{ color }} />
                </div>
                <span className="text-xs font-medium" style={{ color: 'var(--z-400)' }}>{label}</span>
            </div>
            <div className="text-3xl font-bold text-white leading-none tracking-tight">{value}</div>
            {sub && <div className="text-[11px] mt-1.5" style={{ color: 'var(--z-500)' }}>{sub}</div>}
        </div>
    );
}

export default function Analytics() {
    const [preset, setPreset] = useState<Preset>('30d');
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [overview, setOverview] = useState<Overview | null>(null);
    const [sla, setSla] = useState<SlaData | null>(null);
    const [deptVolume, setDeptVolume] = useState<DeptVolume[]>([]);
    const [dailyVolume, setDailyVolume] = useState<DailyVolume[]>([]);
    const [nps, setNps] = useState<NpsSummary | null>(null);
    const [agents, setAgents] = useState<AgentVolume[]>([]);

    const range = useCallback((): { from: string; to: string } => {
        const now = new Date(), to = now.toISOString().slice(0, 10);
        if (preset === 'today') return { from: to, to };
        if (preset === '7d') { const f = new Date(now); f.setDate(f.getDate()-7); return { from: f.toISOString().slice(0,10), to }; }
        if (preset === '30d') { const f = new Date(now); f.setDate(f.getDate()-30); return { from: f.toISOString().slice(0,10), to }; }
        return { from: customFrom, to: customTo };
    }, [preset, customFrom, customTo]);

    const loadAll = useCallback(async () => {
        setLoading(true);
        const { from, to } = range();
        const p = (from && to) ? `?from=${from}&to=${to}` : '';
        try {
            const [ov, tmr, tma, dept, daily, npsS, agentV] = await Promise.all([
                api.get(`/analytics/overview${p}`), api.get(`/analytics/tmr${p}`), api.get(`/analytics/tma${p}`),
                api.get(`/analytics/department-volume${p}`), api.get(`/analytics/daily-volume${p}`),
                api.get(`/analytics/nps-summary${p}`), api.get(`/analytics/agent-volume${p}`),
            ]);
            setOverview(ov.data); setSla({ tmr: tmr.data.tmr, tma: tma.data.tma });
            setDeptVolume(dept.data);
            setDailyVolume(daily.data.map((d: DailyVolume) => ({ ...d, date: d.date.slice(5) })));
            setNps(npsS.data);
            setAgents((agentV.data as AgentVolume[]).sort((a, b) => b.closed - a.closed).slice(0, 10));
        } catch (e) { console.error('Analytics loadAll failed:', e); }
        setLoading(false);
    }, [range]);

    useEffect(() => { loadAll(); }, [loadAll]);

    const handleExport = async () => {
        setExporting(true);
        const { from, to } = range();
        const p = (from && to) ? `?from=${from}&to=${to}` : '';
        try {
            const r = await api.get(`/analytics/export${p}`, { responseType: 'blob' });
            const url = URL.createObjectURL(new Blob([r.data], { type: 'text/csv' }));
            const a = document.createElement('a'); a.href = url; a.download = `relatorio_${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
        } catch (e) { console.error('Analytics export failed:', e); }
        setExporting(false);
    };

    const presets: { k: Preset; l: string }[] = [{ k: 'today', l: 'Hoje' }, { k: '7d', l: '7d' }, { k: '30d', l: '30d' }, { k: 'custom', l: 'Custom' }];
    const npsScore = nps?.npsScore ?? null;

    return (
        <div className="h-full overflow-auto px-6 py-5" style={{ background: 'var(--z-950)' }}>
            {/* Header */}
            <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
                <div>
                    <h1 className="text-xl font-bold text-white tracking-tight">Relatórios</h1>
                    <p className="text-sm mt-0.5" style={{ color: 'var(--z-400)' }}>Indicadores de desempenho e prestação de contas</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center p-0.5 rounded-xl" style={{ background: 'var(--z-850)', border: '1px solid var(--border)' }}>
                        {presets.map(p => (
                            <button key={p.k} onClick={() => setPreset(p.k)} className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                                style={{ background: preset === p.k ? 'var(--em-subtle)' : 'transparent', color: preset === p.k ? 'var(--em-400)' : 'var(--z-400)', border: preset === p.k ? '1px solid var(--border-em)' : '1px solid transparent' }}>
                                {p.l}
                            </button>
                        ))}
                    </div>
                    {preset === 'custom' && (
                        <>
                            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="h-9 px-2.5 rounded-xl text-xs outline-none" style={{ background: 'var(--z-850)', border: '1px solid var(--border)', color: 'var(--z-300)' }} />
                            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="h-9 px-2.5 rounded-xl text-xs outline-none" style={{ background: 'var(--z-850)', border: '1px solid var(--border)', color: 'var(--z-300)' }} />
                        </>
                    )}
                    <button onClick={loadAll} disabled={loading} className="flex items-center gap-2 h-9 px-3.5 rounded-xl text-sm font-medium transition-all" style={{ background: 'var(--z-850)', border: '1px solid var(--border)', color: 'var(--z-300)' }}>
                        <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Atualizar
                    </button>
                    <button onClick={handleExport} disabled={exporting} className="flex items-center gap-2 h-9 px-4 rounded-xl text-sm font-semibold text-white" style={{ background: 'linear-gradient(135deg, var(--em-600), var(--em-500))', boxShadow: 'var(--shadow-em)' }}>
                        {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Exportar
                    </button>
                </div>
            </div>

            {/* KPI cards */}
            <div className="flex gap-3 flex-wrap mb-3">
                <Kpi label="Total no Período" value={overview?.total ?? '—'} icon={TrendingUp} color="#60a5fa" />
                <Kpi label="Resolvidos" value={overview?.resolved ?? '—'} icon={CheckCircle2} color="#10b981" sub={overview ? `${Math.round((overview.resolved/(overview.total||1))*100)}% de resolução` : undefined} />
                <Kpi label="Em Atendimento" value={overview?.open ?? '—'} icon={Users} color="#f59e0b" />
                <Kpi label="Na Fila" value={overview?.queue ?? '—'} icon={AlertCircle} color="#ef4444" />
                <Kpi label="No Bot" value={overview?.bot ?? '—'} icon={Clock} color="#a78bfa" />
            </div>

            {/* SLA cards */}
            <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="rounded-2xl px-5 py-4" style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(16,185,129,0.02))', border: '1px solid var(--border-em)' }}>
                    <div className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--em-400)' }}>TME — Tempo Médio de Espera</div>
                    <div className="text-3xl font-bold text-white tracking-tight">{fmtSec(sla?.tmr ?? 0)}</div>
                    <div className="text-[11px] mt-1" style={{ color: 'var(--z-500)' }}>1ª resposta do atendente</div>
                </div>
                <div className="rounded-2xl px-5 py-4" style={{ background: 'linear-gradient(135deg, rgba(96,165,250,0.1), rgba(96,165,250,0.02))', border: '1px solid rgba(96,165,250,0.25)' }}>
                    <div className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: '#60a5fa' }}>TMA — Tempo Médio de Atendimento</div>
                    <div className="text-3xl font-bold text-white tracking-tight">{fmtSec(sla?.tma ?? 0)}</div>
                    <div className="text-[11px] mt-1" style={{ color: 'var(--z-500)' }}>Abertura até encerramento</div>
                </div>
                <div className="rounded-2xl px-5 py-4" style={{ background: `linear-gradient(135deg, ${npsClr(npsScore)}1a, ${npsClr(npsScore)}05)`, border: `1px solid ${npsClr(npsScore)}40` }}>
                    <div className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: npsClr(npsScore) }}>NPS Score</div>
                    <div className="text-3xl font-bold tracking-tight" style={{ color: npsClr(npsScore) }}>{npsScore !== null ? npsScore : '—'}</div>
                    <div className="text-[11px] mt-1" style={{ color: 'var(--z-500)' }}>Média {nps?.avg ?? '—'} · {nps?.total ?? 0} avaliações</div>
                </div>
            </div>

            {/* Daily volume */}
            <Panel className="mb-3">
                <SL>Volume Diário de Atendimentos</SL>
                {dailyVolume.length === 0 ? (
                    <div className="h-[200px] flex flex-col items-center justify-center gap-2" style={{ color: 'var(--z-500)' }}>
                        <Calendar size={28} className="opacity-40" /><span className="text-sm">Sem dados no período</span>
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height={200}>
                        <AreaChart data={dailyVolume} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                            <defs>
                                <linearGradient id="aTotal" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.3}/><stop offset="100%" stopColor="#10b981" stopOpacity={0}/></linearGradient>
                                <linearGradient id="aClosed" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#60a5fa" stopOpacity={0.2}/><stop offset="100%" stopColor="#60a5fa" stopOpacity={0}/></linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                            <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--z-500)' }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 10, fill: 'var(--z-500)' }} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={TT_STYLE} cursor={{ stroke: 'rgba(255,255,255,0.08)' }} />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            <Area type="monotone" dataKey="total" name="Total" stroke="#10b981" strokeWidth={2} fill="url(#aTotal)" dot={false} />
                            <Area type="monotone" dataKey="closed" name="Resolvidos" stroke="#60a5fa" strokeWidth={1.5} fill="url(#aClosed)" dot={false} />
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </Panel>

            {/* Two col */}
            <div className="grid grid-cols-2 gap-3 mb-3">
                <Panel>
                    <SL>Volume por Secretaria</SL>
                    {deptVolume.length === 0 ? <div className="h-[200px] flex items-center justify-center text-sm" style={{ color: 'var(--z-500)' }}>Sem dados</div> : (
                        <ResponsiveContainer width="100%" height={200}>
                            <BarChart data={deptVolume} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 8 }}>
                                <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--z-500)' }} axisLine={false} tickLine={false} />
                                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--z-500)' }} axisLine={false} tickLine={false} width={90} />
                                <Tooltip contentStyle={TT_STYLE} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                                <Bar dataKey="count" name="Protocolos" radius={[0, 6, 6, 0]}>
                                    {deptVolume.map((_, i) => <Cell key={i} fill={DEPT_COLORS[i % DEPT_COLORS.length]} fillOpacity={0.85} />)}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </Panel>
                <Panel>
                    <SL>Distribuição NPS</SL>
                    {!nps || nps.total === 0 ? <div className="h-[200px] flex items-center justify-center text-sm" style={{ color: 'var(--z-500)' }}>Sem avaliações</div> : (
                        <ResponsiveContainer width="100%" height={200}>
                            <BarChart data={nps.distribution} margin={{ top: 0, right: 8, bottom: 0, left: -20 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                                <XAxis dataKey="score" tick={{ fontSize: 10, fill: 'var(--z-500)' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 10, fill: 'var(--z-500)' }} axisLine={false} tickLine={false} />
                                <Tooltip contentStyle={TT_STYLE} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                                <Bar dataKey="count" name="Avaliações" radius={[6, 6, 0, 0]}>
                                    {nps.distribution.map(d => <Cell key={d.score} fill={d.score >= 9 ? '#10b981' : d.score >= 7 ? '#f59e0b' : '#ef4444'} fillOpacity={0.85} />)}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </Panel>
            </div>

            {/* Agent ranking */}
            {agents.length > 0 && (
                <Panel className="!p-0 overflow-hidden">
                    <div className="px-5 py-3.5" style={{ borderBottom: '1px solid var(--border)' }}><SL>Ranking de Atendentes</SL></div>
                    <table className="w-full text-sm">
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                {['#', 'Atendente', 'Resolvidos', 'Em Aberto'].map(h => (
                                    <th key={h} className="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--z-500)' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {agents.map((a, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.015)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    <td className="px-5 py-3 font-bold" style={{ color: 'var(--z-400)' }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`}</td>
                                    <td className="px-5 py-3">
                                        <div className="flex items-center gap-2.5 font-medium text-white">
                                            <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold" style={{ background: DEPT_COLORS[i % DEPT_COLORS.length] + '30', color: DEPT_COLORS[i % DEPT_COLORS.length] }}>{a.name[0]}</div>
                                            {a.name}
                                        </div>
                                    </td>
                                    <td className="px-5 py-3"><span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: 'var(--em-subtle)', color: 'var(--em-400)' }}>{a.closed}</span></td>
                                    <td className="px-5 py-3"><span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(245,158,11,0.1)', color: '#fbbf24' }}>{a.open}</span></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Panel>
            )}
        </div>
    );
}
