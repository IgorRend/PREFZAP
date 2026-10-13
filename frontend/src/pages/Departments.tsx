import { useEffect, useState } from 'react';
import api from '../services/api';
import { useDictionary } from '../contexts/DictionaryContext';
import { Plus, Pencil, Trash2, Search, Users } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

interface UserInfo { id: string; name: string; email: string; role: string; online: boolean; tenant?: { id: string; name: string }; }
interface DeptData { id: string; name: string; users: { user: UserInfo }[]; _count: { tickets: number }; tenant?: { id: string; name: string }; }

export default function Departments() {
    const [departments, setDepartments] = useState<DeptData[]>([]);
    const [allUsers, setAllUsers] = useState<UserInfo[]>([]);
    const [tenants, setTenants] = useState<{ id: string; name: string }[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<DeptData | null>(null);
    const [search, setSearch] = useState('');
    const [form, setForm] = useState({ name: '', userIds: [] as string[], tenantId: '' });
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
    const { user: me, managementContext, setManagementContext } = useAuthStore();
    const { t } = useDictionary();

    const load = async () => {
        const params = (me?.isSuperAdmin && managementContext) ? { tenantId: managementContext.id } : {};
        const [d, u] = await Promise.all([api.get('/departments', { params }), api.get('/users', { params })]);
        setDepartments(d.data); setAllUsers(u.data);
        if (me?.isSuperAdmin) { const r = await api.get('/super-admin/tenants'); setTenants(r.data); }
    };
    useEffect(() => { load(); }, [managementContext]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editing) {
                const p: any = { name: form.name, userIds: form.userIds };
                if (me?.isSuperAdmin) p.tenantId = form.tenantId;
                await api.put(`/departments/${editing.id}`, p);
            } else {
                const p: any = { ...form };
                if (!me?.isSuperAdmin) delete p.tenantId;
                await api.post('/departments', p);
            }
            setShowModal(false); load();
        } catch (err: any) { toast.error(err.response?.data?.error || 'Erro'); }
    };
    const handleDelete = (id: string) => setDeleteTarget(id);
    const confirmDelete = async () => {
        if (!deleteTarget) return;
        await api.delete(`/departments/${deleteTarget}`);
        setDeleteTarget(null);
        load();
    };
    const toggleUser = (id: string) => {
        setForm(p => ({ ...p, userIds: p.userIds.includes(id) ? p.userIds.filter(u => u !== id) : [...p.userIds, id] }));
    };
    const openCreate = () => { setEditing(null); setForm({ name: '', userIds: [], tenantId: managementContext?.id || '' }); setShowModal(true); };
    const openEdit = (d: any) => { setEditing(d); setForm({ name: d.name, userIds: d.users.map((u: any) => u.user.id), tenantId: d.tenant?.id || '' }); setShowModal(true); };

    const filtered = departments.filter(d => !search || d.name.toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="h-full overflow-auto px-6 py-5" style={{ background: 'var(--z-950)' }}>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-xl font-bold text-white tracking-tight">{t('DEPARTMENT_PLURAL')}</h1>
                    <p className="text-sm mt-0.5" style={{ color: 'var(--z-400)' }}>Gerencie os setores da organização</p>
                </div>
                <div className="flex items-center gap-3">
                    {me?.isSuperAdmin && (
                        <select value={managementContext?.id || ''} onChange={e => { const t = tenants.find(t => t.id === e.target.value); setManagementContext(t || null); }}
                            className="h-9 px-3 rounded-xl text-sm outline-none" style={{ background: 'var(--z-850)', border: '1px solid var(--border)', color: 'var(--z-300)' }}>
                            <option value="">Todas as Organizações</option>
                            {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                    )}
                    <button onClick={openCreate} className="flex items-center gap-2 h-9 px-4 rounded-xl text-sm font-semibold text-white"
                        style={{ background: 'linear-gradient(135deg, var(--em-600), var(--em-500))', boxShadow: 'var(--shadow-em)' }}>
                        <Plus size={15} /> Novo {t('DEPARTMENT_LABEL')}
                    </button>
                </div>
            </div>

            <div className="relative mb-5 max-w-[300px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--z-500)' }} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar setor..."
                    aria-label="Buscar setor"
                    className="w-full h-9 pl-9 pr-3 rounded-xl text-sm text-white outline-none"
                    style={{ background: 'var(--z-850)', border: '1px solid var(--border)' }} />
            </div>

            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                {filtered.map(dept => (
                    <div key={dept.id} className="rounded-2xl p-5 animate-fade-in transition-all" style={{ background: 'var(--z-900)', border: '1px solid var(--border)' }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-md)'}
                        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                        <div className="flex items-start justify-between mb-3">
                            <div>
                                <h3 className="font-semibold text-white">{dept.name}</h3>
                                {me?.isSuperAdmin && dept.tenant && (
                                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--z-500)' }}>{dept.tenant.name}</div>
                                )}
                            </div>
                            <div className="flex gap-1">
                                <button onClick={() => openEdit(dept)} aria-label={`Editar setor ${dept.name}`} className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                                    style={{ color: 'var(--z-500)' }}
                                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'var(--z-200)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--z-500)'; }}>
                                    <Pencil size={13} />
                                </button>
                                <button onClick={() => handleDelete(dept.id)} aria-label={`Remover setor ${dept.name}`} className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                                    style={{ color: 'var(--z-500)' }}
                                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--red-subtle)'; e.currentTarget.style.color = 'var(--red-500)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--z-500)'; }}>
                                    <Trash2 size={13} />
                                </button>
                            </div>
                        </div>

                        <div className="text-[11px] mb-3 flex items-center gap-2" style={{ color: 'var(--z-500)' }}>
                            <Users size={11} />
                            {dept._count.tickets} ticket(s) · {dept.users.length} membro(s)
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                            {dept.users.map(u => (
                                <span key={u.user.id} className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full"
                                    style={{ background: u.user.online ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.04)', color: u.user.online ? 'var(--em-400)' : 'var(--z-400)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: u.user.online ? 'var(--em-500)' : 'var(--z-600)' }} />
                                    {u.user.name}
                                </span>
                            ))}
                            {dept.users.length === 0 && <span className="text-[11px]" style={{ color: 'var(--z-600)' }}>Sem membros</span>}
                        </div>
                    </div>
                ))}
            </div>

            <Dialog open={showModal} onOpenChange={setShowModal}>
                <DialogContent className="max-w-[440px]" style={{ background: 'var(--z-900)', border: '1px solid var(--border-md)', boxShadow: 'var(--shadow-xl)' }}>
                    <DialogHeader>
                        <DialogTitle className="text-white">{editing ? `Editar ${t('DEPARTMENT_LABEL')}` : `Novo ${t('DEPARTMENT_LABEL')}`}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-1">
                        <div>
                            <Label className="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" style={{ color: 'var(--z-500)' }}>Nome</Label>
                            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required placeholder="Ex: Suporte, Vendas..." className="w-full h-9 px-3.5 rounded-xl text-sm text-white outline-none" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} />
                        </div>
                        {me?.isSuperAdmin && (
                            <div>
                                <Label className="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" style={{ color: 'var(--z-500)' }}>Organização</Label>
                                <select value={form.tenantId} onChange={e => setForm(p => ({ ...p, tenantId: e.target.value }))} required className="w-full h-9 px-3 rounded-xl text-sm outline-none" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--z-200)' }}>
                                    <option value="">Selecione...</option>
                                    {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                            </div>
                        )}
                        <div>
                            <Label className="text-[10px] font-bold uppercase tracking-widest mb-2 block" style={{ color: 'var(--z-500)' }}>Membros ({form.userIds.length} selecionados)</Label>
                            <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
                                {(form.tenantId ? allUsers.filter(u => u.tenant?.id === form.tenantId) : allUsers).map(u => (
                                    <label key={u.id} className={`flex items-center gap-2.5 cursor-pointer px-3 py-2 rounded-xl text-sm transition-all ${form.userIds.includes(u.id) ? '' : ''}`}
                                        style={{ background: form.userIds.includes(u.id) ? 'var(--em-subtle)' : 'transparent', color: form.userIds.includes(u.id) ? 'var(--em-400)' : 'var(--z-300)' }}
                                        onMouseEnter={e => { if (!form.userIds.includes(u.id)) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                                        onMouseLeave={e => { if (!form.userIds.includes(u.id)) e.currentTarget.style.background = 'transparent'; }}>
                                        <input type="checkbox" checked={form.userIds.includes(u.id)} onChange={() => toggleUser(u.id)} className="w-4 h-4 rounded cursor-pointer" style={{ accentColor: 'var(--em-500)' }} />
                                        <span>{u.name}</span>
                                        <span className="text-[11px]" style={{ color: 'var(--z-500)' }}>({u.email})</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                        <div className="flex gap-2 pt-1">
                            <button type="button" onClick={() => setShowModal(false)} className="flex-1 h-9 rounded-xl text-sm font-medium transition-all" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-md)', color: 'var(--z-300)' }}>Cancelar</button>
                            <button type="submit" className="flex-1 h-9 rounded-xl text-sm font-semibold text-white" style={{ background: 'linear-gradient(135deg, var(--em-600), var(--em-500))' }}>{editing ? 'Salvar' : 'Criar'}</button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
                <AlertDialogContent style={{ background: 'var(--z-900)', border: '1px solid var(--border-md)', boxShadow: 'var(--shadow-xl)' }}>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-white">Remover setor</AlertDialogTitle>
                        <AlertDialogDescription>Esta ação não pode ser desfeita. Os tickets do setor serão desvinculados.</AlertDialogDescription>
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
