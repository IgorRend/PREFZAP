import { useState, useEffect } from 'react';
import api from '../services/api';
import { FileText, RefreshCw, Plus, Trash2, Check, X, Shield, Loader2 } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

interface HsmTemplate {
    id: string; name: string; namespace?: string; language: string;
    category?: string; components: any[]; status: string; createdAt: string;
}

const STATUS_CFG: Record<string, { label: string; bg: string; color: string }> = {
    APPROVED: { label: 'Aprovado', bg: 'rgba(16,185,129,0.1)', color: '#10b981' },
    PENDING:  { label: 'Pendente', bg: 'rgba(245,158,11,0.1)', color: '#fbbf24' },
    REJECTED: { label: 'Rejeitado', bg: 'rgba(239,68,68,0.1)', color: '#ef4444' },
};

export default function Templates() {
    const { user } = useAuthStore();
    const [templates, setTemplates] = useState<HsmTemplate[]>([]);
    const [syncing, setSyncing] = useState(false);
    const [showAdd, setShowAdd] = useState(false);
    const [newName, setNewName] = useState('');
    const [newLang, setNewLang] = useState('pt_BR');
    const [newCat, setNewCat] = useState('MARKETING');
    const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

    useEffect(() => { load(); }, []);
    const load = async () => { try { setLoadError(null); const { data } = await api.get('/templates'); setTemplates(data); } catch (e: any) { setLoadError(e.response?.data?.error || 'Erro ao carregar templates'); } };

    const sync = async () => {
        setSyncing(true); setMsg(null);
        try { const { data } = await api.post('/templates/sync'); setMsg({ text: `${data.synced} templates sincronizados`, type: 'success' }); await load(); }
        catch (e: any) { setMsg({ text: e.response?.data?.error || 'Erro', type: 'error' }); }
        finally { setSyncing(false); }
    };
    const add = async () => {
        if (!newName.trim()) return;
        try { await api.post('/templates', { name: newName, language: newLang, category: newCat }); setNewName(''); setShowAdd(false); setMsg({ text: 'Template adicionado', type: 'success' }); await load(); }
        catch (e: any) { setMsg({ text: e.response?.data?.error || 'Erro', type: 'error' }); }
    };
    const del = (id: string) => setDeleteTarget(id);
    const confirmDelete = async () => {
        if (!deleteTarget) return;
        try { await api.delete(`/templates/${deleteTarget}`); await load(); } catch {}
        setDeleteTarget(null);
    };

    if (user?.role !== 'ADMIN') {
        return (
            <div className="flex-1 flex items-center justify-center" style={{ background: 'var(--z-950)' }}>
                <div className="text-center">
                    <Shield size={44} className="mx-auto mb-4 opacity-20 text-white" />
                    <h2 className="text-lg font-bold text-white mb-1">Acesso Restrito</h2>
                    <p className="text-sm" style={{ color: 'var(--z-400)' }}>Apenas administradores podem gerenciar templates.</p>
                </div>
            </div>
        );
    }

    const inpSt = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' };

    return (
        <div className="h-full overflow-auto px-6 py-5" style={{ background: 'var(--z-950)' }}>
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'var(--em-subtle)', border: '1px solid var(--border-em)' }}>
                        <FileText size={18} style={{ color: 'var(--em-400)' }} />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-white tracking-tight">Templates HSM</h1>
                        <p className="text-sm mt-0.5" style={{ color: 'var(--z-400)' }}>Mensagens pré-aprovadas pela Meta</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={sync} disabled={syncing} className="flex items-center gap-2 h-9 px-3.5 rounded-xl text-sm font-medium transition-all"
                        style={{ background: 'var(--z-850)', border: '1px solid var(--border)', color: 'var(--z-300)' }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-md)'}
                        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                        <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} /> Sincronizar Meta
                    </button>
                    <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 h-9 px-4 rounded-xl text-sm font-semibold text-white"
                        style={{ background: 'linear-gradient(135deg, var(--em-600), var(--em-500))', boxShadow: 'var(--shadow-em)' }}>
                        <Plus size={14} /> Adicionar
                    </button>
                </div>
            </div>

            {loadError && (
                <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm mb-4 animate-fade-in"
                    style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: 'var(--red-500)' }}>
                    <X size={14} />{loadError}
                </div>
            )}
            {msg && (
                <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm mb-4 animate-fade-in"
                    style={{ background: msg.type === 'success' ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${msg.type === 'success' ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`, color: msg.type === 'success' ? 'var(--em-400)' : 'var(--red-500)' }}>
                    {msg.type === 'success' ? <Check size={14} /> : <X size={14} />}{msg.text}
                </div>
            )}

            {showAdd && (
                <div className="rounded-2xl p-5 mb-5 animate-fade-in" style={{ background: 'var(--z-900)', border: '1px solid var(--border)' }}>
                    <div className="text-sm font-semibold text-white mb-4">Adicionar Template Manual</div>
                    <div className="flex gap-3 flex-wrap items-end">
                        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nome (ex: welcome_message)" className="flex-[2] min-w-[200px] h-9 px-3.5 rounded-xl text-sm text-white outline-none" style={inpSt} />
                        <select value={newLang} onChange={e => setNewLang(e.target.value)} className="flex-1 min-w-[120px] h-9 px-3 rounded-xl text-sm outline-none" style={{ ...inpSt, color: 'var(--z-200)' }}>
                            <option value="pt_BR">Português (BR)</option>
                            <option value="en_US">English (US)</option>
                            <option value="es">Español</option>
                        </select>
                        <select value={newCat} onChange={e => setNewCat(e.target.value)} className="flex-1 min-w-[140px] h-9 px-3 rounded-xl text-sm outline-none" style={{ ...inpSt, color: 'var(--z-200)' }}>
                            <option value="MARKETING">Marketing</option>
                            <option value="UTILITY">Utilidade</option>
                            <option value="AUTHENTICATION">Autenticação</option>
                        </select>
                        <button onClick={add} className="w-9 h-9 rounded-xl flex items-center justify-center text-white" style={{ background: 'linear-gradient(135deg, var(--em-600), var(--em-500))' }}><Check size={15} /></button>
                        <button onClick={() => setShowAdd(false)} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--z-400)' }}><X size={15} /></button>
                    </div>
                </div>
            )}

            <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--z-900)', border: '1px solid var(--border)' }}>
                <table className="w-full text-sm">
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--z-850)' }}>
                            {['Nome', 'Idioma', 'Categoria', 'Status', ''].map(h => (
                                <th key={h} className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--z-500)' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {templates.length === 0 ? (
                            <tr><td colSpan={5} className="px-5 py-12 text-center text-sm" style={{ color: 'var(--z-500)' }}>Nenhum template. Sincronize da Meta ou adicione manualmente.</td></tr>
                        ) : templates.map(t => (
                            <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.015)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                <td className="px-5 py-3.5 font-medium text-white font-mono text-xs">{t.name}</td>
                                <td className="px-5 py-3.5 text-xs" style={{ color: 'var(--z-400)' }}>{t.language}</td>
                                <td className="px-5 py-3.5 text-xs" style={{ color: 'var(--z-400)' }}>{t.category || '—'}</td>
                                <td className="px-5 py-3.5">
                                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: (STATUS_CFG[t.status] || STATUS_CFG.PENDING).bg, color: (STATUS_CFG[t.status] || STATUS_CFG.PENDING).color }}>
                                        {(STATUS_CFG[t.status] || { label: t.status }).label}
                                    </span>
                                </td>
                                <td className="px-5 py-3.5 text-right">
                                    <button onClick={() => del(t.id)} aria-label={`Remover template ${t.name}`} className="w-7 h-7 rounded-lg flex items-center justify-center transition-all ml-auto" style={{ color: 'var(--z-500)' }}
                                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--red-subtle)'; e.currentTarget.style.color = 'var(--red-500)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--z-500)'; }}>
                                        <Trash2 size={13} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
                <AlertDialogContent style={{ background: 'var(--z-900)', border: '1px solid var(--border-md)', boxShadow: 'var(--shadow-xl)' }}>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-white">Remover template</AlertDialogTitle>
                        <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={confirmDelete}>Remover</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
