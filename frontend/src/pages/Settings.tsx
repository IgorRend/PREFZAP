import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import api from '../services/api';
import { useModules } from '../contexts/ModulesContext';
import { getSocket } from '../services/socket';
import {
    Settings2, Shield, Clock, Save, AlertTriangle, Wifi, WifiOff, Plus, Trash2,
    TestTube, Copy, Check, X, Eye, EyeOff, Loader2, CalendarClock, Bot, PhoneOff,
    Star, Timer, RefreshCw, QrCode, Globe, Code2,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

/* ── Types ── */
interface AccountSettings {
    id: string; allowPaidTemplates: boolean; autoRenewWindowPrompt: boolean; enforce24hWindow: boolean;
    businessHoursMode: string; businessHoursJson: string; awayMessage: string;
    timezone: string; npsEnabled: boolean; npsMessage: string; npsExpirationHours: number;
    autoCloseMinutes: number; slaAlertMinutes: number; rejectCalls: boolean;
    rejectCallMessage: string; activeBotFlowId: string | null;
}
interface WhatsAppConnection {
    id: string; name: string; type?: string; wabaId: string; phoneNumberId: string;
    accessTokenMasked: string; verifyToken: string; isConnected: boolean;
    sessionStatus?: string; createdAt: string;
}
interface BotFlow { id: string; name: string; isActive: boolean; }

type TabKey = 'general' | 'connections' | 'hours' | 'automations' | 'widgets';
const DAYS = [
    { key: 'mon', label: 'Segunda' }, { key: 'tue', label: 'Terça' }, { key: 'wed', label: 'Quarta' },
    { key: 'thu', label: 'Quinta' }, { key: 'fri', label: 'Sexta' }, { key: 'sat', label: 'Sábado' }, { key: 'sun', label: 'Domingo' },
];
const TIMEZONES = ['America/Sao_Paulo','America/Fortaleza','America/Manaus','America/Rio_Branco','America/Noronha','America/Cuiaba','America/Belem'];

/* ── Shared input style ── */
const inpCls = "w-full h-9 px-3.5 rounded-xl text-sm text-white outline-none transition-all placeholder:opacity-30";
const inpSt = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' };

/* ── Section panel ── */
function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={`rounded-2xl p-5 ${className}`} style={{ background: 'var(--z-900)', border: '1px solid var(--border)' }}>
            {children}
        </div>
    );
}

/* ── Section label ── */
function SL({ children }: { children: React.ReactNode }) {
    return <div className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--z-500)' }}>{children}</div>;
}

/* ── Toggle row ── */
function ToggleRow({ icon: Icon, iconColor = 'var(--em-400)', title, desc, checked, onChange, warning }: {
    icon: React.ElementType; iconColor?: string; title: string; desc: string;
    checked: boolean; onChange: () => void; warning?: string;
}) {
    return (
        <div className="rounded-2xl p-5" style={{ background: 'var(--z-900)', border: '1px solid var(--border)' }}>
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5" style={{ background: checked ? 'var(--em-subtle)' : 'rgba(255,255,255,0.04)' }}>
                        <Icon size={15} style={{ color: checked ? iconColor : 'var(--z-500)' }} />
                    </div>
                    <div>
                        <div className="text-sm font-semibold text-white">{title}</div>
                        <div className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--z-400)' }}>{desc}</div>
                    </div>
                </div>
                {/* Custom toggle */}
                <button
                    onClick={onChange}
                    className="relative shrink-0 w-10 h-5.5 rounded-full transition-all duration-200"
                    style={{
                        width: 40, height: 22,
                        background: checked ? 'var(--em-500)' : 'rgba(255,255,255,0.1)',
                        boxShadow: checked ? 'var(--shadow-em)' : 'none',
                    }}
                >
                    <span
                        className="absolute top-0.5 rounded-full bg-white transition-all duration-200"
                        style={{
                            width: 18, height: 18,
                            left: checked ? 20 : 2,
                            boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                        }}
                    />
                </button>
            </div>
            {warning && (
                <div className="mt-4 flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs" style={{ background: 'var(--amber-subtle)', border: '1px solid rgba(245,158,11,0.2)', color: '#fbbf24' }}>
                    <AlertTriangle size={13} /> {warning}
                </div>
            )}
        </div>
    );
}

/* ── Status banner ── */
function StatusMsg({ msg }: { msg: { text: string; type: 'success' | 'error' } | null }) {
    if (!msg) return null;
    return (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm animate-fade-in mb-4"
            style={{
                background: msg.type === 'success' ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                border: `1px solid ${msg.type === 'success' ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
                color: msg.type === 'success' ? 'var(--em-400)' : 'var(--red-500)',
            }}>
            {msg.type === 'success' ? <Check size={14} /> : <X size={14} />}
            {msg.text}
        </div>
    );
}

/* ── Save button ── */
function SaveBtn({ loading, children }: { loading: boolean; children?: string }) {
    return (
        <button type="submit" disabled={loading} className="flex items-center gap-2 h-9 px-5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, var(--em-600), var(--em-500))', boxShadow: 'var(--shadow-em)' }}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {loading ? 'Salvando...' : (children || 'Salvar')}
        </button>
    );
}

/* ════════════════════════════════════════════════════════════
   MAIN
   ════════════════════════════════════════════════════════════ */
export default function Settings() {
    const { user } = useAuthStore();
    const [searchParams, setSearchParams] = useSearchParams();
    const tabParam = searchParams.get('tab') as TabKey;
    const [activeTab, setActiveTab] = useState<TabKey>('general');

    useEffect(() => {
        if (tabParam && ['general','connections','hours','automations','widgets'].includes(tabParam)) setActiveTab(tabParam);
    }, [tabParam]);

    const handleTabChange = (key: TabKey) => { setActiveTab(key); setSearchParams({ tab: key }); };

    if (user?.role !== 'ADMIN') {
        return (
            <div className="flex-1 flex items-center justify-center" style={{ background: 'var(--z-950)' }}>
                <div className="text-center">
                    <Shield size={44} className="mx-auto mb-4 opacity-20 text-white" />
                    <h2 className="text-lg font-bold text-white mb-1">Acesso Restrito</h2>
                    <p className="text-sm" style={{ color: 'var(--z-400)' }}>Apenas administradores podem acessar as configurações.</p>
                </div>
            </div>
        );
    }

    const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
        { key: 'general',     label: 'Geral',       icon: <Settings2 size={14} /> },
        { key: 'connections', label: 'Conexões',     icon: <Wifi size={14} /> },
        { key: 'hours',       label: 'Horários',     icon: <CalendarClock size={14} /> },
        { key: 'automations', label: 'Automações',   icon: <Bot size={14} /> },
        { key: 'widgets',     label: 'Web Widgets',  icon: <Globe size={14} /> },
    ];

    return (
        <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--z-950)' }}>
            {/* Header */}
            <div className="px-6 pt-5 pb-0 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'var(--em-subtle)', border: '1px solid var(--border-em)' }}>
                        <Settings2 size={16} style={{ color: 'var(--em-400)' }} />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-white tracking-tight">Configurações</h1>
                        <p className="text-sm mt-0.5" style={{ color: 'var(--z-400)' }}>Conexões, horários e automações</p>
                    </div>
                </div>
                <div className="flex">
                    {TABS.map(t => (
                        <button key={t.key} onClick={() => handleTabChange(t.key)}
                            className="flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium transition-all"
                            style={{
                                borderBottom: `2px solid ${activeTab === t.key ? 'var(--em-500)' : 'transparent'}`,
                                color: activeTab === t.key ? 'var(--em-400)' : 'var(--z-400)',
                                background: 'transparent', outline: 'none', cursor: 'pointer', border: 'none',
                                borderBottomWidth: 2, borderBottomStyle: 'solid',
                                borderBottomColor: activeTab === t.key ? 'var(--em-500)' : 'transparent',
                            }}>
                            {t.icon} {t.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto px-6 py-5">
                <div className="max-w-[720px]">
                    {activeTab === 'general' && <GeneralTab />}
                    {activeTab === 'connections' && <ConnectionsTab />}
                    {activeTab === 'hours' && <BusinessHoursTab />}
                    {activeTab === 'automations' && <AutomationsTab />}
                    {activeTab === 'widgets' && <WebWidgetsTab />}
                </div>
            </div>
        </div>
    );
}

/* ─── General ─── */
function GeneralTab() {
    const [settings, setSettings] = useState<AccountSettings | null>(null);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    useEffect(() => { api.get('/settings').then(r => setSettings(r.data)).catch(() => setMsg({ text: 'Erro ao carregar', type: 'error' })); }, []);

    const save = async (e: React.FormEvent) => {
        e.preventDefault(); if (!settings) return;
        setSaving(true); setMsg(null);
        try {
            const { data } = await api.put('/settings', { allowPaidTemplates: settings.allowPaidTemplates, autoRenewWindowPrompt: settings.autoRenewWindowPrompt, enforce24hWindow: settings.enforce24hWindow });
            setSettings(data); setMsg({ text: 'Configurações salvas!', type: 'success' });
        } catch (err: any) { setMsg({ text: err.response?.data?.error || 'Erro', type: 'error' }); }
        finally { setSaving(false); }
    };

    return (
        <form onSubmit={save} className="space-y-4">
            <StatusMsg msg={msg} />
            {settings ? (
                <>
                    <ToggleRow icon={Clock} title="Exigir Janela de 24h" desc="Só na Cloud API da Meta. No WhatsApp Web (padrão), deixe desligado — assim o agente sempre pode responder, sem bloqueio 'aguardando resposta'." checked={settings.enforce24hWindow} onChange={() => setSettings({ ...settings, enforce24hWindow: !settings.enforce24hWindow })} />
                    <ToggleRow icon={Shield} title="Templates Pagos (HSM)" desc="Permite envio de Templates HSM pré-aprovados fora da janela de 24h. Gera custos por mensagem." checked={settings.allowPaidTemplates} onChange={() => setSettings({ ...settings, allowPaidTemplates: !settings.allowPaidTemplates })} warning={settings.allowPaidTemplates ? 'Cada template enviado fora da janela gera custo adicional na Meta.' : undefined} />
                    <ToggleRow icon={Clock} title="Renovação Automática da Janela" desc="Envia lembrete na 23ª hora incentivando resposta para renovar a janela de 24h." checked={settings.autoRenewWindowPrompt} onChange={() => setSettings({ ...settings, autoRenewWindowPrompt: !settings.autoRenewWindowPrompt })} />
                    <SaveBtn loading={saving} />
                </>
            ) : <div className="space-y-4">{Array.from({length:2}).map((_,i)=><div key={i} className="skeleton rounded-2xl h-24"/>)}</div>}
        </form>
    );
}

/* ─── Business Hours ─── */
function BusinessHoursTab() {
    const [settings, setSettings] = useState<AccountSettings | null>(null);
    // Cada dia tem uma lista de períodos (até 2, para fechar no almoço).
    const [schedule, setSchedule] = useState<Record<string, { enabled: boolean; periods: { start: string; end: string }[] }>>({});
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    // Normaliza o valor de um dia (objeto antigo ou array novo) para lista de períodos.
    const toPeriods = (raw: any): { start: string; end: string }[] => {
        if (!raw) return [];
        const list = Array.isArray(raw) ? raw : [raw];
        return list.filter((p: any) => p && p.start && p.end).map((p: any) => ({ start: p.start, end: p.end }));
    };

    useEffect(() => {
        api.get('/settings').then(r => {
            setSettings(r.data);
            try {
                const parsed = JSON.parse(r.data.businessHoursJson || '{}');
                const sched: Record<string, any> = {};
                DAYS.forEach(d => {
                    const periods = toPeriods(parsed[d.key]);
                    sched[d.key] = periods.length
                        ? { enabled: true, periods }
                        : { enabled: false, periods: [{ start: '08:00', end: '18:00' }] };
                });
                setSchedule(sched);
            } catch { }
        }).catch(() => {});
    }, []);

    const setPeriod = (day: string, idx: number, field: 'start' | 'end', value: string) => {
        setSchedule(prev => {
            const periods = prev[day].periods.map((p, i) => i === idx ? { ...p, [field]: value } : p);
            return { ...prev, [day]: { ...prev[day], periods } };
        });
    };
    const addPeriod = (day: string) => {
        setSchedule(prev => {
            if (prev[day].periods.length >= 2) return prev;
            return { ...prev, [day]: { ...prev[day], periods: [...prev[day].periods, { start: '13:00', end: '18:00' }] } };
        });
    };
    const removePeriod = (day: string, idx: number) => {
        setSchedule(prev => ({ ...prev, [day]: { ...prev[day], periods: prev[day].periods.filter((_, i) => i !== idx) } }));
    };

    const save = async (e: React.FormEvent) => {
        e.preventDefault(); if (!settings) return;
        setSaving(true); setMsg(null);
        try {
            const json: Record<string,any> = {};
            Object.entries(schedule).forEach(([k,v]) => {
                if (!v.enabled) return;
                const periods = v.periods.filter(p => p.start && p.end);
                if (periods.length) json[k] = periods;
            });
            await api.put('/settings', { businessHoursMode: settings.businessHoursMode, businessHoursJson: JSON.stringify(json), awayMessage: settings.awayMessage, timezone: settings.timezone });
            setMsg({ text: 'Horários salvos!', type: 'success' });
        } catch (err: any) { setMsg({ text: err.response?.data?.error || 'Erro', type: 'error' }); }
        finally { setSaving(false); }
    };

    if (!settings) return <div className="space-y-4">{Array.from({length:3}).map((_,i)=><div key={i} className="skeleton rounded-2xl h-20"/>)}</div>;

    return (
        <form onSubmit={save} className="space-y-4">
            <StatusMsg msg={msg} />
            <Panel>
                <SL>Modo de Atendimento</SL>
                <div className="flex flex-col gap-2.5">
                    {[{v:'always',l:'Aberto 24/7',d:'Não envia mensagem de ausência'},{v:'custom',l:'Horário Personalizado',d:'Defina abertura e fechamento por dia'},{v:'closed',l:'Fechado',d:'Envia mensagem de ausência imediatamente'}].map(opt => (
                        <label key={opt.v} className="flex items-start gap-3 px-4 py-3.5 rounded-xl cursor-pointer transition-all"
                            style={{ background: settings.businessHoursMode === opt.v ? 'var(--em-subtle)' : 'rgba(255,255,255,0.02)', border: `1px solid ${settings.businessHoursMode === opt.v ? 'var(--border-em)' : 'var(--border)'}` }}>
                            <input type="radio" name="hoursMode" value={opt.v} checked={settings.businessHoursMode === opt.v} onChange={() => setSettings({...settings, businessHoursMode: opt.v})} className="mt-0.5 cursor-pointer" style={{ accentColor: 'var(--em-500)' }} />
                            <div>
                                <div className="text-sm font-medium text-white">{opt.l}</div>
                                <div className="text-xs mt-0.5" style={{ color: 'var(--z-400)' }}>{opt.d}</div>
                            </div>
                        </label>
                    ))}
                </div>
            </Panel>
            {settings.businessHoursMode === 'custom' && (
                <Panel>
                    <SL>Horários por Dia</SL>
                    <div className="space-y-2">
                        {DAYS.map(d => {
                            const day = schedule[d.key];
                            return (
                            <div key={d.key} className="flex items-start gap-4 px-4 py-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
                                <label className="flex items-center gap-2.5 cursor-pointer w-32 shrink-0 mt-1">
                                    <input type="checkbox" checked={day?.enabled || false} onChange={e => setSchedule({...schedule,[d.key]:{...day,enabled:e.target.checked}})} className="cursor-pointer" style={{ accentColor: 'var(--em-500)' }} />
                                    <span className="text-sm font-medium text-white">{d.label}</span>
                                </label>
                                {day?.enabled ? (
                                    <div className="flex flex-col gap-2">
                                        {day.periods.map((p, idx) => (
                                            <div key={idx} className="flex items-center gap-2">
                                                <input type="time" value={p.start} onChange={e=>setPeriod(d.key, idx, 'start', e.target.value)} className="h-8 px-2 rounded-lg text-sm text-white outline-none" style={{background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)'}} />
                                                <span className="text-xs" style={{color:'var(--z-500)'}}>até</span>
                                                <input type="time" value={p.end} onChange={e=>setPeriod(d.key, idx, 'end', e.target.value)} className="h-8 px-2 rounded-lg text-sm text-white outline-none" style={{background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)'}} />
                                                {day.periods.length > 1 && (
                                                    <button type="button" onClick={()=>removePeriod(d.key, idx)} className="h-8 w-8 flex items-center justify-center rounded-lg shrink-0" style={{color:'var(--z-500)'}} aria-label="Remover período">
                                                        <X size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                        {day.periods.length < 2 && (
                                            <button type="button" onClick={()=>addPeriod(d.key)} className="flex items-center gap-1.5 text-xs font-medium w-fit" style={{color:'var(--em-400)'}}>
                                                <Plus size={13} /> período
                                            </button>
                                        )}
                                    </div>
                                ) : <span className="text-xs italic mt-1" style={{color:'var(--z-600)'}}>Fechado</span>}
                            </div>
                            );
                        })}
                    </div>
                </Panel>
            )}
            {settings.businessHoursMode !== 'always' && (
                <Panel>
                    <SL>Mensagem de Ausência</SL>
                    <textarea value={settings.awayMessage} onChange={e=>setSettings({...settings,awayMessage:e.target.value})} rows={3} placeholder="Mensagem enviada fora do horário de atendimento..." className="w-full px-3.5 py-2.5 rounded-xl text-sm text-white outline-none resize-y" style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.08)'}} />
                    <div className="mt-3">
                        <div className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{color:'var(--z-500)'}}>Fuso Horário</div>
                        <select value={settings.timezone} onChange={e=>setSettings({...settings,timezone:e.target.value})} className="h-9 px-3 rounded-xl text-sm outline-none" style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.08)',color:'var(--z-200)'}}>
                            {TIMEZONES.map(tz=><option key={tz} value={tz}>{tz.replace('America/','')}</option>)}
                        </select>
                    </div>
                </Panel>
            )}
            <SaveBtn loading={saving}>Salvar Horários</SaveBtn>
        </form>
    );
}

/* ─── Automations ─── */
function AutomationsTab() {
    const [settings, setSettings] = useState<AccountSettings | null>(null);
    const [botFlows, setBotFlows] = useState<BotFlow[]>([]);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
    const { hasModule } = useModules();

    useEffect(() => {
        api.get('/settings').then(r=>setSettings(r.data)).catch(()=>{});
        api.get('/bot-flows').then(r=>setBotFlows(r.data)).catch(()=>{});
    },[]);

    const save = async (e: React.FormEvent) => {
        e.preventDefault(); if (!settings) return;
        setSaving(true); setMsg(null);
        try {
            await api.put('/settings',{npsEnabled:settings.npsEnabled,npsMessage:settings.npsMessage,npsExpirationHours:settings.npsExpirationHours,autoCloseMinutes:settings.autoCloseMinutes,slaAlertMinutes:settings.slaAlertMinutes,rejectCalls:settings.rejectCalls,rejectCallMessage:settings.rejectCallMessage,activeBotFlowId:settings.activeBotFlowId});
            setMsg({ text: 'Automações salvas!', type: 'success' });
        } catch (err: any) { setMsg({ text: err.response?.data?.error || 'Erro', type: 'error' }); }
        finally { setSaving(false); }
    };

    if (!settings) return <div className="space-y-4">{Array.from({length:3}).map((_,i)=><div key={i} className="skeleton rounded-2xl h-24"/>)}</div>;

    const NumInput = ({ label, value, onChange, suffix }: { label: string; value: number; onChange: (v: number) => void; suffix?: string }) => (
        <div className="flex items-center justify-between">
            <span className="text-sm" style={{ color: 'var(--z-300)' }}>{label}</span>
            <div className="flex items-center gap-2">
                <input type="number" min={0} value={value} onChange={e=>onChange(parseInt(e.target.value)||0)} className="w-20 h-8 text-center rounded-xl text-sm text-white outline-none" style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.08)'}} />
                {suffix && <span className="text-xs" style={{color:'var(--z-500)'}}>{suffix}</span>}
            </div>
        </div>
    );

    return (
        <form onSubmit={save} className="space-y-4">
            <StatusMsg msg={msg} />
            {hasModule('bot_flow') && (
                <Panel>
                    <SL>Fluxo Ativo do Bot</SL>
                    <p className="text-xs mb-3" style={{color:'var(--z-400)'}}>Selecione qual fluxo será usado como entrada padrão para novos atendimentos.</p>
                    <select value={settings.activeBotFlowId||''} onChange={e=>setSettings({...settings,activeBotFlowId:e.target.value||null})} className="w-full h-9 px-3 rounded-xl text-sm outline-none" style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.08)',color:'var(--z-200)'}}>
                        <option value="">Nenhum (sem bot)</option>
                        {botFlows.map(f=><option key={f.id} value={f.id}>{f.name} {f.isActive?'(Ativo)':''}</option>)}
                    </select>
                </Panel>
            )}
            <ToggleRow icon={PhoneOff} iconColor="var(--red-500)" title="Recusa Automática de Chamadas" desc="Rejeita chamadas de voz/vídeo via WhatsApp e envia mensagem amigável." checked={settings.rejectCalls} onChange={()=>setSettings({...settings,rejectCalls:!settings.rejectCalls})} />
            {settings.rejectCalls && (
                <Panel>
                    <SL>Mensagem de Recusa</SL>
                    <textarea value={settings.rejectCallMessage} onChange={e=>setSettings({...settings,rejectCallMessage:e.target.value})} rows={2} className="w-full px-3.5 py-2.5 rounded-xl text-sm text-white outline-none resize-none" style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.08)'}} />
                </Panel>
            )}
            <Panel className="space-y-4">
                <SL>Limites de Tempo</SL>
                <NumInput label="Auto-Encerramento por Inatividade" value={settings.autoCloseMinutes} onChange={v=>setSettings({...settings,autoCloseMinutes:v})} suffix="minutos (0 = desabilitado)" />
                <div className="h-px" style={{background:'var(--border)'}} />
                <NumInput label="Alerta de SLA — Tempo máximo de espera" value={settings.slaAlertMinutes} onChange={v=>setSettings({...settings,slaAlertMinutes:v})} suffix="minutos (0 = desabilitado)" />
            </Panel>
            {hasModule('nps') && (
                <Panel>
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <Star size={15} style={{color:'#fbbf24'}} />
                            <span className="text-sm font-semibold text-white">Pesquisa de Satisfação (NPS)</span>
                        </div>
                        <button type="button" onClick={()=>setSettings({...settings,npsEnabled:!settings.npsEnabled})}
                            className="relative shrink-0 rounded-full transition-all duration-200"
                            style={{width:40,height:22,background:settings.npsEnabled?'var(--em-500)':'rgba(255,255,255,0.1)',boxShadow:settings.npsEnabled?'var(--shadow-em)':'none'}}>
                            <span className="absolute top-0.5 rounded-full bg-white transition-all duration-200" style={{width:18,height:18,left:settings.npsEnabled?20:2,boxShadow:'0 1px 4px rgba(0,0,0,0.3)'}} />
                        </button>
                    </div>
                    {settings.npsEnabled && (
                        <div className="space-y-3">
                            <div>
                                <div className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{color:'var(--z-500)'}}>Mensagem da Pesquisa</div>
                                <textarea value={settings.npsMessage} onChange={e=>setSettings({...settings,npsMessage:e.target.value})} rows={2} className="w-full px-3.5 py-2.5 rounded-xl text-sm text-white outline-none resize-none" style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.08)'}} />
                            </div>
                            <NumInput label="Expiração da Pesquisa" value={settings.npsExpirationHours} onChange={v=>setSettings({...settings,npsExpirationHours:v})} suffix="horas" />
                        </div>
                    )}
                </Panel>
            )}
            <SaveBtn loading={saving}>Salvar Automações</SaveBtn>
        </form>
    );
}

/* ─── Connections ─── */
function ConnectionsTab() {
    const [connections, setConnections] = useState<WhatsAppConnection[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState<WhatsAppConnection | null>(null);
    const [formData, setFormData] = useState({ name:'',type:'qr_code_web',wabaId:'',phoneNumberId:'',accessToken:'' });
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
    const [testResults, setTestResults] = useState<Record<string,{ loading: boolean; result?: any }>>({});
    const [deleteConnTarget, setDeleteConnTarget] = useState<string | null>(null);

    const load = () => { api.get('/connections').then(r=>setConnections(r.data)).catch(()=>{}); };
    useEffect(()=>{ load(); },[]);

    const handleSave = async () => {
        if (!formData.name) { setMsg({text:'Nome obrigatório',type:'error'}); return; }
        setSaving(true); setMsg(null);
        try {
            if (editing) { await api.put(`/connections/${editing.id}`,formData); setMsg({text:'Conexão atualizada!',type:'success'}); }
            else { await api.post('/connections',formData); setMsg({text:'Conexão criada! Aguarde o QR Code.',type:'success'}); }
            setShowForm(false); setEditing(null);
            setFormData({name:'',type:'qr_code_web',wabaId:'',phoneNumberId:'',accessToken:''});
            load();
        } catch (err: any) { setMsg({text:err.response?.data?.error||'Erro',type:'error'}); }
        finally { setSaving(false); }
    };
    const handleDelete = (id: string) => setDeleteConnTarget(id);
    const confirmDeleteConn = async () => {
        if (!deleteConnTarget) return;
        try { await api.delete(`/connections/${deleteConnTarget}`); load(); setMsg({text:'Conexão removida',type:'success'}); } catch { setMsg({text:'Erro ao remover',type:'error'}); }
        setDeleteConnTarget(null);
    };
    const handleTest = async (id: string) => {
        setTestResults(p=>({...p,[id]:{loading:true}}));
        try { const {data} = await api.post(`/connections/${id}/test`); setTestResults(p=>({...p,[id]:{loading:false,result:data}})); load(); }
        catch (err:any) { setTestResults(p=>({...p,[id]:{loading:false,result:{success:false,error:err.response?.data?.error||'Erro'}}})); }
    };
    const handleRestart = async (id: string) => {
        try { await api.post(`/connections/${id}/restart`); setMsg({text:'Sessão reiniciada.',type:'success'}); load(); }
        catch (err:any) { setMsg({text:err.response?.data?.error||'Erro',type:'error'}); }
    };

    return (
        <div className="space-y-4">
            <StatusMsg msg={msg} />
            <AlertDialog open={!!deleteConnTarget} onOpenChange={open => !open && setDeleteConnTarget(null)}>
                <AlertDialogContent style={{ background: 'var(--z-900)', border: '1px solid var(--border-md)', boxShadow: 'var(--shadow-xl)' }}>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-white">Excluir conexão</AlertDialogTitle>
                        <AlertDialogDescription>Esta ação irá desconectar o WhatsApp vinculado e não pode ser desfeita.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={confirmDeleteConn}>Excluir</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            {connections.map(conn => <ConnCard key={conn.id} connection={conn} testResult={testResults[conn.id]} onTest={()=>handleTest(conn.id)} onDelete={()=>handleDelete(conn.id)} onRestart={()=>handleRestart(conn.id)} onRefresh={load} onEdit={()=>{ setEditing(conn); setFormData({name:conn.name,type:conn.type||'qr_code_web',wabaId:conn.wabaId||'',phoneNumberId:conn.phoneNumberId||'',accessToken:''}); setShowForm(true); }} />)}
            {!showForm && (
                <button onClick={()=>{ setEditing(null); setFormData({name:'',type:'qr_code_web',wabaId:'',phoneNumberId:'',accessToken:''}); setShowForm(true); }}
                    className="flex items-center gap-2 h-9 px-4 rounded-xl text-sm font-semibold text-white"
                    style={{background:'linear-gradient(135deg,var(--em-600),var(--em-500))',boxShadow:'var(--shadow-em)'}}>
                    <Plus size={14}/> Nova Conexão
                </button>
            )}
            {showForm && (
                <Panel className="animate-fade-in">
                    <div className="text-sm font-semibold text-white mb-4">{editing?'Editar Conexão':'Nova Conexão WhatsApp'}</div>
                    <div className="space-y-3">
                        <div>
                            <div className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{color:'var(--z-500)'}}>Nome da Conexão</div>
                            <input value={formData.name} onChange={e=>setFormData({...formData,name:e.target.value})} placeholder="Ex: Suporte Principal" className={inpCls} style={inpSt} />
                        </div>
                        {!editing && (
                            <div>
                                <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{color:'var(--z-500)'}}>Tipo</div>
                                <div className="flex flex-col gap-2">
                                    {[{v:'qr_code_web',l:'Sessão via QR Code',d:'Conecte qualquer número via QR Code'},{v:'official_meta',l:'API Oficial Meta',d:'Requer conta Meta Business verificada'}].map(opt=>(
                                        <label key={opt.v} className="flex items-start gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all"
                                            style={{background:formData.type===opt.v?'var(--em-subtle)':'rgba(255,255,255,0.02)',border:`1px solid ${formData.type===opt.v?'var(--border-em)':'var(--border)'}`}}>
                                            <input type="radio" name="connType" value={opt.v} checked={formData.type===opt.v} onChange={()=>setFormData({...formData,type:opt.v})} className="mt-0.5 cursor-pointer" style={{accentColor:'var(--em-500)'}} />
                                            <div><div className="text-sm font-medium text-white">{opt.l}</div><div className="text-xs mt-0.5" style={{color:'var(--z-400)'}}>{opt.d}</div></div>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                        {formData.type==='official_meta' && (
                            <>
                                {[{l:'Phone Number ID',p:'Ex: 123456789',k:'phoneNumberId'},{l:'WABA ID',p:'Ex: 987654321',k:'wabaId'},{l:'Token de Acesso',p:editing?'Vazio = manter':'Cole o token...',k:'accessToken',t:'password'}].map(f=>(
                                    <div key={f.k}>
                                        <div className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{color:'var(--z-500)'}}>{f.l}</div>
                                        <input type={f.t||'text'} value={(formData as any)[f.k]} onChange={e=>setFormData({...formData,[f.k]:e.target.value})} placeholder={f.p} className={inpCls} style={inpSt} />
                                    </div>
                                ))}
                            </>
                        )}
                    </div>
                    <div className="flex gap-2 mt-4">
                        <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-sm font-semibold text-white"
                            style={{background:'linear-gradient(135deg,var(--em-600),var(--em-500))'}}>
                            {saving?<Loader2 size={13} className="animate-spin"/>:<Save size={13}/>}
                            {saving?'Salvando...':editing?'Atualizar':'Criar Conexão'}
                        </button>
                        <button onClick={()=>{setShowForm(false);setEditing(null);}} className="h-9 px-4 rounded-xl text-sm font-medium transition-all"
                            style={{background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',color:'var(--z-300)'}}>Cancelar</button>
                    </div>
                </Panel>
            )}
        </div>
    );
}

/* ─── Connection Card ─── */
function ConnCard({ connection, testResult, onTest, onDelete, onEdit, onRestart, onRefresh }: {
    connection: WhatsAppConnection; testResult?: { loading: boolean; result?: any };
    onTest:()=>void; onDelete:()=>void; onEdit:()=>void; onRestart:()=>void; onRefresh:()=>void;
}) {
    const isQr = connection.type === 'qr_code_web';
    const [status, setStatus] = useState(connection.sessionStatus||(connection.isConnected?'connected':'disconnected'));
    const [qr, setQr] = useState<string|null>(null);
    const [showQr, setShowQr] = useState(false);

    useEffect(()=>{ if(['awaiting','connecting','qr_ready'].includes(status)) setShowQr(true); else setShowQr(false); },[status]);

    useEffect(()=>{
        const socket = getSocket(); if(!socket) return;
        const onQr = (d:{connectionId:string;qr:string})=>{ if(d.connectionId!==connection.id&&!d.qr) return; setQr(d.qr); setStatus('qr_ready'); setShowQr(true); };
        const onSt = (d:{status:string})=>{ setStatus(d.status); if(d.status==='connected'){setQr(null);setShowQr(false);onRefresh();} };
        socket.on(`qrcode_update_${connection.id}`,onQr);
        socket.on(`connection_status_${connection.id}`,onSt);
        return()=>{ socket.off(`qrcode_update_${connection.id}`,onQr); socket.off(`connection_status_${connection.id}`,onSt); };
    },[connection.id,onRefresh]);

    const STATUS_CFG: Record<string,{label:string;dot:string;bg:string}> = {
        connected:   {label:'Conectado',   dot:'#10b981',bg:'rgba(16,185,129,0.1)'},
        disconnected:{label:'Desconectado',dot:'#ef4444',bg:'rgba(239,68,68,0.1)'},
        connecting:  {label:'Conectando...', dot:'#f59e0b',bg:'rgba(245,158,11,0.1)'},
        qr_ready:    {label:'Aguardando QR',dot:'#f59e0b',bg:'rgba(245,158,11,0.1)'},
        awaiting:    {label:'Iniciando...',  dot:'#f59e0b',bg:'rgba(245,158,11,0.1)'},
    };
    const cfg = STATUS_CFG[status]||STATUS_CFG.disconnected;
    const typeLabel = isQr?'QR CODE':connection.type==='official_meta'?'META API':'CLOUD';

    const btnCls = "flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-medium transition-all";
    const btnSt = { background:'rgba(255,255,255,0.05)', border:'1px solid var(--border)', color:'var(--z-300)' };

    return (
        <Panel>
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{background:cfg.bg}}>
                        {status==='connected'?<Wifi size={18} style={{color:cfg.dot}}/>:<WifiOff size={18} style={{color:cfg.dot}}/>}
                    </div>
                    <div>
                        <div className="font-semibold text-white flex items-center gap-2">
                            {connection.name}
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md" style={{background:'rgba(255,255,255,0.06)',color:'var(--z-400)'}}>{typeLabel}</span>
                        </div>
                        <div className="text-xs mt-0.5" style={{color:'var(--z-500)'}}>
                            {isQr?'Sessão via QR Code':`Phone: ${connection.phoneNumberId}`}
                        </div>
                    </div>
                </div>
                <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full" style={{background:cfg.bg,color:cfg.dot}}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{background:cfg.dot}} />
                    {cfg.label}
                </span>
            </div>

            {/* QR Modal */}
            {isQr && showQr && status!=='connected' && (
                <div className="fixed inset-0 flex items-center justify-center z-50" style={{background:'rgba(0,0,0,0.75)',backdropFilter:'blur(12px)'}}>
                    <div className="rounded-2xl p-8 max-w-[380px] w-[90%] flex flex-col items-center relative animate-scale-in" style={{background:'var(--z-900)',border:'1px solid var(--border-md)',boxShadow:'var(--shadow-xl)'}}>
                        <button onClick={()=>setShowQr(false)} aria-label="Fechar QR Code" className="absolute top-4 right-4 w-8 h-8 rounded-xl flex items-center justify-center transition-all" style={{color:'var(--z-500)'}}
                            onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,0.06)';e.currentTarget.style.color='var(--z-200)';}}
                            onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color='var(--z-500)';}}><X size={16}/></button>
                        {qr?(
                            <>
                                <h4 className="text-lg font-bold text-white mb-2">Escaneie o QR Code</h4>
                                <p className="text-sm text-center mb-6" style={{color:'var(--z-400)'}}>Abra o WhatsApp → Aparelhos Conectados → aponte a câmera</p>
                                <div className="p-4 rounded-2xl" style={{background:'#ffffff'}}>
                                    <img src={qr.startsWith('data:image')?qr:`data:image/png;base64,${qr}`} alt="QR" className="max-w-[260px] w-full rounded-xl" />
                                </div>
                            </>
                        ):(
                            <div className="flex flex-col items-center gap-4 py-8">
                                <Loader2 size={32} className="animate-spin" style={{color:'var(--em-400)'}} />
                                <div className="text-center">
                                    <div className="text-sm font-semibold text-white">Iniciando Conexão...</div>
                                    <div className="text-xs mt-1" style={{color:'var(--z-500)'}}>Aguarde o QR Code exclusivo</div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {testResult?.result && (
                <div className="px-4 py-2.5 rounded-xl mb-3 text-xs flex items-center gap-2" style={{background:testResult.result.success?'rgba(16,185,129,0.08)':'rgba(239,68,68,0.08)',border:`1px solid ${testResult.result.success?'rgba(16,185,129,0.2)':'rgba(239,68,68,0.2)'}`,color:testResult.result.success?'var(--em-400)':'var(--red-500)'}}>
                    {testResult.result.success?<Check size={13}/>:<X size={13}/>}
                    {testResult.result.success?'Conexão verificada!':testResult.result.error}
                </div>
            )}

            <div className="flex gap-1.5 flex-wrap">
                <button onClick={onTest} disabled={testResult?.loading} className={btnCls} style={btnSt} onMouseEnter={e=>e.currentTarget.style.borderColor='var(--border-md)'} onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
                    {testResult?.loading?<Loader2 size={12} className="animate-spin"/>:<TestTube size={12}/>} Testar
                </button>
                {isQr && <button onClick={()=>{setShowQr(true);onRestart();}} className={btnCls} style={btnSt} onMouseEnter={e=>e.currentTarget.style.borderColor='var(--border-md)'} onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}><QrCode size={12}/> Gerar QR</button>}
                <button onClick={onEdit} className={btnCls} style={btnSt} onMouseEnter={e=>e.currentTarget.style.borderColor='var(--border-md)'} onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>Editar</button>
                <button onClick={onDelete} className={btnCls} style={{background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',color:'var(--red-500)'}} onMouseEnter={e=>e.currentTarget.style.background='rgba(239,68,68,0.15)'} onMouseLeave={e=>e.currentTarget.style.background='rgba(239,68,68,0.08)'}>
                    <Trash2 size={12}/> Remover
                </button>
            </div>
        </Panel>
    );
}

/* ─── Web Widgets ─── */
interface WebWidget { id:string;name:string;widgetToken:string;primaryColor:string;welcomeMessage:string;agentName:string;allowedOrigin:string;isActive:boolean; }

function WebWidgetsTab() {
    const [widgets, setWidgets] = useState<WebWidget[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState<WebWidget|null>(null);
    const [form, setForm] = useState({name:'',primaryColor:'#10b981',welcomeMessage:'Olá! 👋 Como podemos ajudar?',agentName:'Atendimento',allowedOrigin:'*'});
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{text:string;type:'success'|'error'}|null>(null);
    const [deleteWidgetTarget, setDeleteWidgetTarget] = useState<string | null>(null);
    const load = ()=>api.get('/widgets').then(r=>setWidgets(r.data)).catch(()=>{});
    useEffect(()=>{ load(); },[]);

    const handleSave = async ()=>{
        if(!form.name){setMsg({text:'Nome obrigatório',type:'error'});return;}
        setSaving(true);setMsg(null);
        try{
            if(editing) await api.put(`/widgets/${editing.id}`,form);
            else await api.post('/widgets',form);
            setShowForm(false);setEditing(null);load();
        }catch(e:any){setMsg({text:e.response?.data?.error||'Erro',type:'error'});}
        finally{setSaving(false);}
    };
    const handleDelete = (id: string) => setDeleteWidgetTarget(id);
    const confirmDeleteWidget = async () => {
        if (!deleteWidgetTarget) return;
        await api.delete(`/widgets/${deleteWidgetTarget}`);
        setDeleteWidgetTarget(null);
        load();
    };
    const handleToggle = async(w:WebWidget)=>{ await api.put(`/widgets/${w.id}`,{isActive:!w.isActive});load(); };
    const backendUrl = import.meta.env.VITE_API_URL || window.location.origin.replace(':5173',':3001');

    return (
        <div className="space-y-4">
            <StatusMsg msg={msg} />
            {widgets.map(w=>(
                <Panel key={w.id}>
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{background:w.primaryColor+'20'}}>
                                <Globe size={18} style={{color:w.primaryColor}} />
                            </div>
                            <div>
                                <div className="font-semibold text-white">{w.name}</div>
                                <div className="text-xs mt-0.5" style={{color:'var(--z-500)'}}>Origem: {w.allowedOrigin}</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button type="button" onClick={()=>handleToggle(w)}
                                aria-label={w.isActive ? `Desativar widget ${w.name}` : `Ativar widget ${w.name}`}
                                className="relative rounded-full transition-all duration-200"
                                style={{width:36,height:20,background:w.isActive?'var(--em-500)':'rgba(255,255,255,0.1)'}}>
                                <span className="absolute top-0.5 rounded-full bg-white transition-all duration-200" style={{width:16,height:16,left:w.isActive?18:2}} />
                            </button>
                            <span className="text-[11px] font-semibold" style={{color:w.isActive?'var(--em-400)':'var(--z-500)'}}>{w.isActive?'Ativo':'Inativo'}</span>
                        </div>
                    </div>
                    <div className="rounded-xl p-3 mb-3" style={{background:'var(--z-850)',border:'1px solid var(--border)'}}>
                        <div className="text-[10px] font-bold uppercase tracking-widest mb-1.5 flex items-center gap-1.5" style={{color:'var(--z-500)'}}>
                            <Code2 size={10}/> Snippet
                        </div>
                        <pre className="text-[10px] overflow-auto leading-relaxed" style={{color:'var(--z-300)'}}>
                            {`<script>\n  window.OmniWidgetConfig = { token: '${w.widgetToken}', serverUrl: '${backendUrl}' };\n</script>\n<script src="${backendUrl}/widget.js" defer></script>`}
                        </pre>
                    </div>
                    <div className="flex gap-1.5">
                        <button onClick={()=>{setEditing(w);setForm({name:w.name,primaryColor:w.primaryColor,welcomeMessage:w.welcomeMessage,agentName:w.agentName,allowedOrigin:w.allowedOrigin});setShowForm(true);}}
                            className="h-8 px-3 rounded-xl text-xs font-medium transition-all" style={{background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',color:'var(--z-300)'}}>Editar</button>
                        <button onClick={()=>handleDelete(w.id)} className="h-8 px-3 rounded-xl text-xs font-medium transition-all" style={{background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',color:'var(--red-500)'}}>
                            <Trash2 size={12} className="inline mr-1"/>Remover
                        </button>
                    </div>
                </Panel>
            ))}
            <AlertDialog open={!!deleteWidgetTarget} onOpenChange={open => !open && setDeleteWidgetTarget(null)}>
                <AlertDialogContent style={{ background: 'var(--z-900)', border: '1px solid var(--border-md)', boxShadow: 'var(--shadow-xl)' }}>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-white">Remover widget</AlertDialogTitle>
                        <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={confirmDeleteWidget}>Remover</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            {!showForm && (
                <button onClick={()=>{setEditing(null);setForm({name:'',primaryColor:'#10b981',welcomeMessage:'Olá! 👋 Como podemos ajudar?',agentName:'Atendimento',allowedOrigin:'*'});setShowForm(true);}}
                    className="flex items-center gap-2 h-9 px-4 rounded-xl text-sm font-semibold text-white"
                    style={{background:'linear-gradient(135deg,var(--em-600),var(--em-500))',boxShadow:'var(--shadow-em)'}}>
                    <Plus size={14}/> Novo Widget
                </button>
            )}
            {showForm && (
                <Panel className="animate-fade-in">
                    <div className="text-sm font-semibold text-white mb-4">{editing?'Editar Widget':'Novo Web Widget'}</div>
                    <div className="space-y-3">
                        {[{l:'Nome do Widget',p:'Ex: Chat do Portal',k:'name'},{l:'Nome do Agente',p:'Ex: Atendimento',k:'agentName'},{l:'Mensagem de Boas-Vindas',p:'Olá! 👋',k:'welcomeMessage'},{l:'Origem CORS',p:'* ou https://meusite.gov.br',k:'allowedOrigin'}].map(f=>(
                            <div key={f.k}>
                                <div className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{color:'var(--z-500)'}}>{f.l}</div>
                                <input value={(form as any)[f.k]} onChange={e=>setForm({...form,[f.k]:e.target.value})} placeholder={f.p} className={inpCls} style={inpSt} />
                            </div>
                        ))}
                        <div>
                            <div className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{color:'var(--z-500)'}}>Cor Principal</div>
                            <div className="flex items-center gap-3">
                                <input type="color" value={form.primaryColor} onChange={e=>setForm({...form,primaryColor:e.target.value})} className="w-10 h-9 rounded-lg cursor-pointer border-0 p-0.5" style={{background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)'}} />
                                <span className="text-sm font-mono" style={{color:'var(--z-400)'}}>{form.primaryColor}</span>
                                <div className="w-8 h-8 rounded-xl shadow-md" style={{background:form.primaryColor}} />
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-2 mt-4">
                        <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-sm font-semibold text-white"
                            style={{background:'linear-gradient(135deg,var(--em-600),var(--em-500))'}}>
                            {saving?<Loader2 size={13} className="animate-spin"/>:<Save size={13}/>}
                            {saving?'Salvando...':editing?'Atualizar':'Criar'}
                        </button>
                        <button onClick={()=>{setShowForm(false);setEditing(null);}} className="h-9 px-4 rounded-xl text-sm font-medium transition-all"
                            style={{background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',color:'var(--z-300)'}}>Cancelar</button>
                    </div>
                </Panel>
            )}
        </div>
    );
}
