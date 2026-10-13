import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import {
    Search, RefreshCw, Phone, Mail, User, CheckCircle, AlertCircle,
    Building2, Upload, Download, FileSpreadsheet, Loader2,
} from 'lucide-react';
import { Label } from '@/components/ui/label';

interface Contact {
    id: string; phone: string; name: string | null; fullName: string | null;
    email: string | null; avatarUrl: string | null; cpf: string | null;
    channel: string; createdAt: string; _count: { tickets: number };
    tenant?: { id: string; name: string };
}
interface SyncResult { syncedCount: number; totalProcessed: number; }
type ToastType = 'success' | 'error';
interface Toast { id: number; message: string; type: ToastType; }

export default function Contacts() {
    const { user } = useAuthStore();
    const [searchParams, setSearchParams] = useSearchParams();
    const isAdmin = user?.role === 'ADMIN' || user?.isSuperAdmin;
    const activeTab = isAdmin ? (searchParams.get('tab') || 'list') : 'list';

    const PAGE_SIZE = 60;
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [total, setTotal] = useState(0);
    const [identifiedTotal, setIdentifiedTotal] = useState(0);
    const [search, setSearch] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [toasts, setToasts] = useState<Toast[]>([]);
    const pageRef = useRef(1);
    const hasMoreRef = useRef(false);
    const loadingRef = useRef(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    let toastId = 0;

    const addToast = (message: string, type: ToastType) => {
        const id = ++toastId;
        setToasts(p => [...p, { id, message, type }]);
        setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000);
    };

    // Paginated fetch. reset=true restarts at page 1 (replace); otherwise appends the next page.
    const fetchPage = useCallback(async (reset: boolean) => {
        if (activeTab !== 'list' || loadingRef.current) return;
        loadingRef.current = true;
        const nextPage = reset ? 1 : pageRef.current + 1;
        if (reset) setIsLoading(true); else setIsLoadingMore(true);
        try {
            const q = search.trim();
            const { data } = await api.get('/contacts', { params: { page: nextPage, pageSize: PAGE_SIZE, q } });
            const list: Contact[] = Array.isArray(data?.contacts) ? data.contacts : [];
            setContacts(prev => (reset ? list : [...prev, ...list]));
            setTotal(data?.total ?? 0);
            setIdentifiedTotal(data?.identifiedTotal ?? 0);
            pageRef.current = nextPage;
            hasMoreRef.current = nextPage * PAGE_SIZE < (data?.total ?? 0);
        } catch { } finally {
            loadingRef.current = false;
            if (reset) setIsLoading(false); else setIsLoadingMore(false);
        }
    }, [search, activeTab]);

    // Debounced reset-load on search / tab change.
    useEffect(() => { const t = setTimeout(() => fetchPage(true), 300); return () => clearTimeout(t); }, [fetchPage]);

    // Infinite scroll: load the next page when near the bottom.
    const handleScroll = useCallback(() => {
        const el = scrollRef.current;
        if (!el || !hasMoreRef.current || loadingRef.current) return;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 300) {
            fetchPage(false);
        }
    }, [fetchPage]);

    const handleSync = async () => {
        if (isSyncing) return;
        setIsSyncing(true);
        try {
            const { data } = await api.post<SyncResult>('/contacts/sync');
            addToast(`${data.syncedCount} contatos atualizados de ${data.totalProcessed}`, 'success');
            await fetchPage(true);
        } catch (e: any) { addToast(e?.response?.data?.error || 'Erro ao sincronizar', 'error'); }
        finally { setIsSyncing(false); }
    };

    const dn = (c: Contact) => c.fullName || c.name || c.phone;
    const ini = (c: Contact) => dn(c).substring(0, 2).toUpperCase();

    return (
        <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--z-950)' }}>
            {/* Toasts */}
            <div className="fixed top-5 right-5 z-50 flex flex-col gap-2">
                {toasts.map(t => (
                    <div key={t.id} className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm animate-slide-r"
                        style={{ background: t.type === 'success' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', border: `1px solid ${t.type === 'success' ? 'var(--border-em)' : 'rgba(239,68,68,0.3)'}`, color: t.type === 'success' ? 'var(--em-400)' : 'var(--red-500)', backdropFilter: 'blur(16px)' }}>
                        {t.type === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}{t.message}
                    </div>
                ))}
            </div>

            {/* Header */}
            <div className="px-6 pt-5 pb-0 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="mb-4">
                    <h1 className="text-xl font-bold text-white tracking-tight">Contatos</h1>
                    <p className="text-sm mt-0.5" style={{ color: 'var(--z-400)' }}>Gerencie e importe os contatos da sua agenda</p>
                </div>
                {isAdmin && (
                    <div className="flex">
                        {[{ k: 'list', l: 'Lista de Contatos' }, { k: 'import', l: 'Importar / Sincronizar' }].map(tb => (
                            <button key={tb.k} onClick={() => setSearchParams({ tab: tb.k })}
                                className="px-4 py-2.5 text-[13px] font-medium transition-all"
                                style={{ borderBottom: `2px solid ${activeTab === tb.k ? 'var(--em-500)' : 'transparent'}`, color: activeTab === tb.k ? 'var(--em-400)' : 'var(--z-400)', background: 'transparent', border: 'none', borderBottomWidth: 2, borderBottomStyle: 'solid', borderBottomColor: activeTab === tb.k ? 'var(--em-500)' : 'transparent', cursor: 'pointer' }}>
                                {tb.l}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Content */}
            {activeTab === 'list' ? (
                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Stats + Search */}
                    <div className="px-6 py-3 flex items-center justify-between shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
                        <div className="flex gap-5 text-sm" style={{ color: 'var(--z-400)' }}>
                            <span><strong className="text-white">{total}</strong> contatos</span>
                            <span><strong className="text-white">{identifiedTotal}</strong> identificados</span>
                        </div>
                        <div className="relative w-[260px]">
                            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--z-500)' }} />
                            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar contatos..." className="w-full h-8 pl-8 pr-3 rounded-xl text-sm text-white outline-none" style={{ background: 'var(--z-850)', border: '1px solid var(--border)' }} />
                        </div>
                    </div>

                    {/* Grid */}
                    <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-auto px-6 py-5">
                        {isLoading ? (
                            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                                {Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton rounded-2xl h-24" />)}
                            </div>
                        ) : contacts.length === 0 ? (
                            <div className="flex flex-col items-center gap-3 py-16" style={{ color: 'var(--z-500)' }}>
                                <User size={40} className="opacity-20" />
                                <p className="text-sm">Nenhum contato encontrado.</p>
                                {isAdmin && <p className="text-xs">Vá em <strong>Importar / Sincronizar</strong> para carregar contatos.</p>}
                            </div>
                        ) : (
                            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                                {contacts.map(c => (
                                    <div key={c.id} className="rounded-2xl p-4 flex gap-3 animate-fade-in transition-all" style={{ background: 'var(--z-900)', border: '1px solid var(--border)' }}
                                        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-md)'}
                                        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                                        {c.avatarUrl ? (
                                            <img src={c.avatarUrl} alt={dn(c)} className="w-11 h-11 rounded-xl object-cover shrink-0" />
                                        ) : (
                                            <div className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-bold text-white shrink-0" style={{ background: 'linear-gradient(135deg, var(--em-600), var(--em-500))' }}>{ini(c)}</div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <div className="font-semibold text-white truncate">{dn(c)}</div>
                                            <div className="flex flex-col gap-0.5 mt-1">
                                                <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--z-400)' }}><Phone size={10} /> {c.phone}</div>
                                                {c.email && <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--z-400)' }}><Mail size={10} /> {c.email}</div>}
                                                {user?.isSuperAdmin && c.tenant && <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--z-500)' }}><Building2 size={10} /> {c.tenant.name}</div>}
                                            </div>
                                            <div className="flex flex-wrap gap-1.5 mt-2">
                                                {c._count.tickets > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--z-300)' }}>{c._count.tickets} ticket(s)</span>}
                                                <span className="text-[10px] px-1.5 py-0.5 rounded-md" style={{ background: c.name ? 'var(--em-subtle)' : 'rgba(255,255,255,0.04)', color: c.name ? 'var(--em-400)' : 'var(--z-500)' }}>{c.name ? 'Identificado' : 'Sem nome'}</span>
                                                <span className="text-[10px] px-1.5 py-0.5 rounded-md uppercase" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--z-400)' }}>{c.channel}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {isLoadingMore && (
                            <div className="flex items-center justify-center gap-2 py-6 text-sm" style={{ color: 'var(--z-400)' }}>
                                <Loader2 size={15} className="animate-spin" /> Carregando mais...
                            </div>
                        )}
                        {!isLoading && total > 0 && (
                            <div className="text-center text-xs py-4" style={{ color: 'var(--z-500)' }}>
                                {contacts.length} de {total} carregados
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="flex-1 overflow-auto px-6 py-6">
                    <ImportTab handleSync={handleSync} isSyncing={isSyncing} addToast={addToast} />
                </div>
            )}
        </div>
    );
}

function ImportTab({ handleSync, isSyncing, addToast }: { handleSync: () => void; isSyncing: boolean; addToast: (m: string, t: ToastType) => void }) {
    const { user } = useAuthStore();
    const [file, setFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [tenants, setTenants] = useState<{ id: string; name: string }[]>([]);
    const [tenantId, setTenantId] = useState('');

    useEffect(() => { if (user?.isSuperAdmin) api.get('/super-admin/tenants').then(r => setTenants(Array.isArray(r.data) ? r.data : [])).catch(() => {}); }, [user]);

    const upload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file) { addToast('Selecione um arquivo', 'error'); return; }
        setIsUploading(true);
        try {
            const fd = new FormData(); fd.append('file', file);
            if (user?.isSuperAdmin && tenantId) fd.append('tenantId', tenantId);
            const { data } = await api.post('/bulk-import/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            addToast(`Processados: ${data.processed}, Sucesso: ${data.success}, Falhas: ${data.errors?.length || 0}`, 'success');
            setFile(null);
        } catch (e: any) { addToast(e.response?.data?.error || 'Erro', 'error'); }
        finally { setIsUploading(false); }
    };
    const backendUrl = import.meta.env.VITE_API_URL || window.location.origin.replace(':5173', ':3001');

    return (
        <div className="grid gap-4 max-w-[900px] mx-auto" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
            {/* Sync card */}
            <div className="rounded-2xl p-5 flex flex-col justify-between min-h-[260px]" style={{ background: 'var(--z-900)', border: '1px solid var(--border)' }}>
                <div>
                    <div className="flex items-center gap-2.5 mb-3">
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'var(--em-subtle)' }}><RefreshCw size={15} style={{ color: 'var(--em-400)' }} /></div>
                        <span className="text-sm font-semibold text-white">Sincronizar com WhatsApp</span>
                    </div>
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--z-400)' }}>Busca contatos e conversas da conexão ativa e sincroniza com o banco local.</p>
                </div>
                <button onClick={handleSync} disabled={isSyncing} className="flex items-center justify-center gap-2 w-full h-10 rounded-xl text-sm font-semibold text-white" style={{ background: 'linear-gradient(135deg, var(--em-600), var(--em-500))', boxShadow: 'var(--shadow-em)' }}>
                    <RefreshCw size={15} className={isSyncing ? 'animate-spin' : ''} /> {isSyncing ? 'Sincronizando...' : 'Sincronizar Agora'}
                </button>
            </div>

            {/* CSV card */}
            <div className="rounded-2xl p-5 min-h-[260px]" style={{ background: 'var(--z-900)', border: '1px solid var(--border)' }}>
                <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(96,165,250,0.12)' }}><Upload size={15} style={{ color: '#60a5fa' }} /></div>
                    <span className="text-sm font-semibold text-white">Importar via CSV</span>
                </div>
                <button onClick={() => window.open('/api/bulk-import/template', '_blank')} className="flex items-center gap-1.5 text-sm font-medium mb-4 transition-colors" style={{ color: 'var(--em-400)' }}>
                    <Download size={13} /> Baixar Modelo CSV
                </button>
                <form onSubmit={upload} className="flex flex-col gap-3">
                    {user?.isSuperAdmin && (
                        <div>
                            <Label className="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" style={{ color: 'var(--z-500)' }}>Organização</Label>
                            <select required value={tenantId} onChange={e => setTenantId(e.target.value)} className="w-full h-9 px-3 rounded-xl text-sm outline-none" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--z-200)' }}>
                                <option value="">Selecione...</option>
                                {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                        </div>
                    )}
                    <label className="relative flex flex-col items-center gap-2 px-4 py-6 rounded-xl text-center cursor-pointer transition-all" style={{ border: '1px dashed var(--border-md)', background: 'rgba(255,255,255,0.02)' }}>
                        <input type="file" accept=".csv,.txt" onChange={e => setFile(e.target.files?.[0] || null)} className="absolute inset-0 opacity-0 cursor-pointer" />
                        <FileSpreadsheet size={26} style={{ color: 'var(--z-500)' }} />
                        <div className="text-sm font-medium text-white">{file ? file.name : 'Clique ou arraste'}</div>
                        <div className="text-[11px]" style={{ color: 'var(--z-600)' }}>.csv ou .txt até 10MB</div>
                    </label>
                    <button type="submit" disabled={isUploading || !file} className="flex items-center justify-center gap-2 w-full h-10 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'linear-gradient(135deg, var(--em-600), var(--em-500))' }}>
                        {isUploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} {isUploading ? 'Processando...' : 'Importar'}
                    </button>
                </form>
            </div>
        </div>
    );
}
