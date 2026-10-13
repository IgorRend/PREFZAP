import { useEffect, useState } from 'react';
import api from '../services/api';
import { useDictionary } from '../contexts/DictionaryContext';
import { Plus, Pencil, Trash2, Search, MessageSquare, HelpCircle } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '../hooks/useToast';

interface QuickReply { id: string; shortcut: string; message: string; tenantId: string; tenant?: { id: string; name: string }; }

export default function QuickReplies() {
    const [replies, setReplies] = useState<QuickReply[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<QuickReply | null>(null);
    const [search, setSearch] = useState('');
    const [form, setForm] = useState({ shortcut: '', message: '', tenantId: '' });
    const [tenants, setTenants] = useState<{ id: string; name: string }[]>([]);
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
    const { user: me, managementContext } = useAuthStore();
    const { t } = useDictionary();
    const { showToast, ToastContainer } = useToast();

    const load = async () => {
        try {
            const params = (me?.isSuperAdmin && managementContext) ? { tenantId: managementContext.id } : {};
            const { data } = await api.get('/quick-replies', { params });
            setReplies(Array.isArray(data) ? data : []);
            if (me?.isSuperAdmin) { const r = await api.get('/super-admin/tenants'); setTenants(r.data); }
        } catch { }
    };
    useEffect(() => { load(); }, [managementContext]);

    const openCreate = () => { setEditing(null); setForm({ shortcut: '', message: '', tenantId: managementContext?.id || '' }); setShowModal(true); };
    const openEdit = (qr: QuickReply) => { setEditing(qr); setForm({ shortcut: qr.shortcut, message: qr.message, tenantId: qr.tenantId || '' }); setShowModal(true); };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        let sc = form.shortcut.trim().toLowerCase().replace(/^\//, '');
        if (!sc) { showToast('O atalho é obrigatório', 'error'); return; }
        try {
            const payload: any = { shortcut: sc, message: form.message };
            if (me?.isSuperAdmin) payload.tenantId = form.tenantId;
            if (editing) await api.put(`/quick-replies/${editing.id}`, payload);
            else await api.post('/quick-replies', payload);
            setShowModal(false); load();
        } catch (err: any) { showToast(err.response?.data?.error || 'Erro', 'error'); }
    };
    const handleDelete = (id: string) => setDeleteTarget(id);
    const confirmDelete = async () => {
        if (!deleteTarget) return;
        try { await api.delete(`/quick-replies/${deleteTarget}`); load(); } catch { }
        setDeleteTarget(null);
    };

    const filtered = replies.filter(qr => !search || qr.shortcut.includes(search.toLowerCase()) || qr.message.toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="h-full overflow-auto px-6 py-5" style={{ background: 'var(--z-950)' }}>
            <ToastContainer />
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-xl font-bold text-white tracking-tight">Respostas Rápidas</h1>
                    <p className="text-sm mt-0.5" style={{ color: 'var(--z-400)' }}>Digite / no chat para usar os atalhos</p>
                </div>
                <button onClick={openCreate} className="flex items-center gap-2 h-9 px-4 rounded-xl text-sm font-semibold text-white"
                    style={{ background: 'linear-gradient(135deg, var(--em-600), var(--em-500))', boxShadow: 'var(--shadow-em)' }}>
                    <Plus size={15} /> Nova Resposta
                </button>
            </div>

            <div className="relative mb-5 max-w-[380px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--z-500)' }} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por atalho ou mensagem..."
                    aria-label="Buscar resposta rápida"
                    className="w-full h-9 pl-9 pr-3 rounded-xl text-sm text-white outline-none"
                    style={{ background: 'var(--z-850)', border: '1px solid var(--border)' }} />
            </div>

            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                {filtered.map(qr => (
                    <div key={qr.id} className="rounded-2xl p-4 flex flex-col gap-3 animate-fade-in transition-all"
                        style={{ background: 'var(--z-900)', border: '1px solid var(--border)' }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-md)'}
                        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <code className="text-sm font-bold px-2.5 py-1 rounded-lg" style={{ background: 'var(--em-subtle)', color: 'var(--em-400)', border: '1px solid var(--border-em)' }}>
                                    /{qr.shortcut}
                                </code>
                                {me?.isSuperAdmin && qr.tenant && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--z-400)' }}>
                                        {qr.tenant.name}
                                    </span>
                                )}
                            </div>
                            <div className="flex gap-1">
                                <button onClick={() => openEdit(qr)} aria-label={`Editar resposta /${qr.shortcut}`} className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                                    style={{ color: 'var(--z-500)' }}
                                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'var(--z-200)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--z-500)'; }}>
                                    <Pencil size={12} />
                                </button>
                                <button onClick={() => handleDelete(qr.id)} aria-label={`Remover resposta /${qr.shortcut}`} className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                                    style={{ color: 'var(--z-500)' }}
                                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--red-subtle)'; e.currentTarget.style.color = 'var(--red-500)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--z-500)'; }}>
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        </div>
                        <p className="text-sm leading-relaxed overflow-hidden" style={{ color: 'var(--z-300)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                            {qr.message}
                        </p>
                    </div>
                ))}
                {filtered.length === 0 && (
                    <div className="col-span-full flex flex-col items-center gap-3 py-16" style={{ color: 'var(--z-500)' }}>
                        <MessageSquare size={36} className="opacity-20" />
                        <p className="text-sm">Nenhuma resposta rápida cadastrada.</p>
                    </div>
                )}
            </div>

            <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
                <AlertDialogContent style={{ background: 'var(--z-900)', border: '1px solid var(--border-md)', boxShadow: 'var(--shadow-xl)' }}>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-white">Remover resposta rápida</AlertDialogTitle>
                        <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={confirmDelete}>Remover</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Dialog open={showModal} onOpenChange={setShowModal}>
                <DialogContent className="max-w-[480px]" style={{ background: 'var(--z-900)', border: '1px solid var(--border-md)', boxShadow: 'var(--shadow-xl)' }}>
                    <DialogHeader>
                        <DialogTitle className="text-white">{editing ? 'Editar Resposta' : 'Nova Resposta Rápida'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-1">
                        {me?.isSuperAdmin && !managementContext && (
                            <div>
                                <Label className="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" style={{ color: 'var(--z-500)' }}>Organização</Label>
                                <select required value={form.tenantId} onChange={e => setForm({ ...form, tenantId: e.target.value })}
                                    className="w-full h-9 px-3 rounded-xl text-sm outline-none" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--z-200)' }}>
                                    <option value="">Selecione...</option>
                                    {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                            </div>
                        )}
                        <div>
                            <Label className="text-[10px] font-bold uppercase tracking-widest mb-1.5 flex items-center gap-1.5 block" style={{ color: 'var(--z-500)' }}>
                                Atalho <span title="Texto após / para acionar" className="inline-flex"><HelpCircle size={10} className="opacity-50" /></span>
                            </Label>
                            <div className="relative">
                                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold" style={{ color: 'var(--em-400)' }}>/</span>
                                <input required value={form.shortcut} onChange={e => setForm({ ...form, shortcut: e.target.value })} placeholder="bomdia"
                                    className="w-full h-9 pl-7 pr-3.5 rounded-xl text-sm text-white outline-none"
                                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} />
                            </div>
                            <p className="text-[11px] mt-1" style={{ color: 'var(--z-600)' }}>Apenas letras e números, sem espaços</p>
                        </div>
                        <div>
                            <Label className="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" style={{ color: 'var(--z-500)' }}>Mensagem</Label>
                            <textarea required rows={4} value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} placeholder="Olá! Como posso ajudar?"
                                className="w-full px-3.5 py-2.5 rounded-xl text-sm text-white outline-none resize-none"
                                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} />
                        </div>
                        <div className="flex gap-2 pt-1">
                            <button type="button" onClick={() => setShowModal(false)} className="flex-1 h-9 rounded-xl text-sm font-medium" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-md)', color: 'var(--z-300)' }}>Cancelar</button>
                            <button type="submit" className="flex-1 h-9 rounded-xl text-sm font-semibold text-white" style={{ background: 'linear-gradient(135deg, var(--em-600), var(--em-500))' }}>Salvar</button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
