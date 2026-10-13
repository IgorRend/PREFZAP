import { useEffect, useState, useRef } from 'react';
import api from '../services/api';
import { useDictionary } from '../contexts/DictionaryContext';
import { Plus, Pencil, Trash2, Search, Upload, Download, FileSpreadsheet, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '../hooks/useToast';

interface Department { id: string; name: string; }
interface UserData {
    id: string; name: string; email: string; role: string; online: boolean;
    departments: { department: Department }[];
}
interface ImportResult { created: number; errors: { row: number; email: string; reason: string }[]; }

const ROLE_LABEL: Record<string, string> = { ADMIN: 'Admin', AGENT: 'Agente' };

function RoleBadge({ role }: { role: string }) {
    const isAdmin = role === 'ADMIN';
    return (
        <span
            className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
            style={{
                background: isAdmin ? 'rgba(96,165,250,0.12)' : 'rgba(16,185,129,0.1)',
                color: isAdmin ? '#93c5fd' : 'var(--em-400)',
            }}
        >
            {ROLE_LABEL[role] ?? role}
        </span>
    );
}

function OnlineDot({ online }: { online: boolean }) {
    return (
        <span className="flex items-center gap-1.5 text-[11px]" style={{ color: online ? 'var(--em-400)' : 'var(--z-500)' }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: online ? 'var(--em-500)' : 'var(--z-600)' }} />
            {online ? 'Online' : 'Offline'}
        </span>
    );
}

const inputCls = "w-full h-9 px-3.5 rounded-xl text-sm text-white outline-none transition-all placeholder:text-[#52525b]";
const inputStyle = {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
};

export default function Users() {
    const { user: me, managementContext, setManagementContext } = useAuthStore();
    const [users, setUsers] = useState<UserData[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [tenants, setTenants] = useState<{ id: string; name: string }[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<UserData | null>(null);
    const [search, setSearch] = useState('');
    const [form, setForm] = useState({ name: '', email: '', password: '', role: 'AGENT', departmentIds: [] as string[], tenantId: '' });
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<ImportResult | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const { t } = useDictionary();
    const { showToast, ToastContainer } = useToast();

    const load = async () => {
        const params = (me?.isSuperAdmin && managementContext) ? { tenantId: managementContext.id } : {};
        const [u, d] = await Promise.all([api.get('/users', { params }), api.get('/departments', { params })]);
        setUsers(u.data); setDepartments(d.data);
        if (me?.isSuperAdmin) { const r = await api.get('/super-admin/tenants'); setTenants(r.data); }
    };
    useEffect(() => { load(); }, [managementContext]);

    const openCreate = () => {
        setEditing(null);
        setForm({ name: '', email: '', password: '', role: 'AGENT', departmentIds: [], tenantId: managementContext?.id || '' });
        setShowModal(true);
    };
    const openEdit = (u: any) => {
        setEditing(u);
        setForm({ name: u.name, email: u.email, password: '', role: u.role, departmentIds: u.departments.map((d: any) => d.department.id), tenantId: u.tenant?.id || '' });
        setShowModal(true);
    };
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editing) {
                const p: any = { name: form.name, email: form.email, role: form.role, departmentIds: form.departmentIds };
                if (me?.isSuperAdmin) p.tenantId = form.tenantId;
                if (form.password) p.password = form.password;
                await api.put(`/users/${editing.id}`, p);
            } else {
                const p: any = { ...form };
                if (!me?.isSuperAdmin) delete p.tenantId;
                await api.post('/users', p);
            }
            setShowModal(false); load();
        } catch (err: any) { showToast(err.response?.data?.error || 'Erro', 'error'); }
    };
    const handleDelete = (id: string) => setDeleteTarget(id);
    const confirmDelete = async () => {
        if (!deleteTarget) return;
        await api.delete(`/users/${deleteTarget}`);
        setDeleteTarget(null);
        load();
    };
    const toggleDept = (id: string) => {
        setForm(p => ({
            ...p,
            departmentIds: p.departmentIds.includes(id) ? p.departmentIds.filter(d => d !== id) : [...p.departmentIds, id],
        }));
    };
    const downloadTemplate = async () => {
        const res = await api.get('/bulk-import/template', { responseType: 'blob' });
        const url = URL.createObjectURL(new Blob([res.data]));
        const a = document.createElement('a'); a.href = url; a.download = 'template_importacao.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    };
    const handleImport = async (file: File) => {
        if (!file.name.toLowerCase().endsWith('.csv')) { showToast('Apenas CSV', 'error'); return; }
        setImporting(true); setImportResult(null);
        try {
            const fd = new FormData(); fd.append('file', file);
            if (me?.isSuperAdmin && managementContext?.id) fd.append('tenantId', managementContext.id);
            const { data } = await api.post('/bulk-import/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            setImportResult(data); load();
        } catch (err: any) { showToast(err.response?.data?.error || 'Erro', 'error'); }
        setImporting(false);
    };

    const filtered = users.filter(u => !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="h-full overflow-auto px-6 py-5" style={{ background: 'var(--z-950)' }}>
            <ToastContainer />
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-xl font-bold text-white tracking-tight">{t('AGENT_PLURAL')}</h1>
                    <p className="text-sm mt-0.5" style={{ color: 'var(--z-400)' }}>Gerencie a equipe de atendimento</p>
                </div>
                <div className="flex items-center gap-3">
                    {me?.isSuperAdmin && (
                        <select
                            value={managementContext?.id || ''}
                            onChange={e => { const t = tenants.find(t => t.id === e.target.value); setManagementContext(t || null); }}
                            className="h-9 px-3 rounded-xl text-sm outline-none"
                            style={{ background: 'var(--z-850)', border: '1px solid var(--border)', color: 'var(--z-300)' }}
                        >
                            <option value="">Todas as Organizações</option>
                            {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                    )}
                    <button
                        onClick={openCreate}
                        className="flex items-center gap-2 h-9 px-4 rounded-xl text-sm font-semibold text-white transition-all"
                        style={{ background: 'linear-gradient(135deg, var(--em-600), var(--em-500))', boxShadow: 'var(--shadow-em)' }}
                        onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
                        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                    >
                        <Plus size={15} /> Novo {t('AGENT_LABEL')}
                    </button>
                </div>
            </div>

            {/* Bulk import */}
            {me?.role === 'ADMIN' && (
                <div className="rounded-2xl p-5 mb-5" style={{ background: 'var(--z-900)', border: '1px solid var(--border)' }}>
                    <div className="flex items-center gap-2 mb-4">
                        <FileSpreadsheet size={16} style={{ color: 'var(--em-500)' }} />
                        <span className="text-sm font-semibold text-white">Importação em Massa</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div
                            className="flex flex-col items-center gap-3 p-4 rounded-xl text-center"
                            style={{ border: '1px dashed var(--border-md)', background: 'rgba(255,255,255,0.02)' }}
                        >
                            <Download size={20} style={{ color: 'var(--em-400)' }} />
                            <div>
                                <div className="text-sm font-medium text-white">1. Baixe o template</div>
                                <div className="text-xs mt-0.5" style={{ color: 'var(--z-500)' }}>CSV: Nome, Email, Cargo</div>
                            </div>
                            <button
                                onClick={downloadTemplate}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                                style={{ background: 'var(--em-subtle)', color: 'var(--em-400)', border: '1px solid var(--border-em)' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(16,185,129,0.15)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'var(--em-subtle)'}
                            >
                                <Download size={12} /> Baixar Template
                            </button>
                        </div>
                        <div
                            className={`flex flex-col items-center gap-3 p-4 rounded-xl text-center cursor-pointer transition-all ${dragOver ? 'border-[var(--border-em)] bg-[var(--em-subtle)]' : ''}`}
                            style={{ border: `1px dashed ${dragOver ? 'var(--em-500)' : 'var(--border-md)'}`, background: dragOver ? 'var(--em-subtle)' : 'rgba(255,255,255,0.02)' }}
                            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.[0]) handleImport(e.dataTransfer.files[0]); }}
                            onClick={() => fileRef.current?.click()}
                        >
                            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => { if (e.target.files?.[0]) handleImport(e.target.files[0]); e.target.value = ''; }} />
                            <Upload size={20} style={{ color: importing ? 'var(--z-500)' : 'var(--em-400)' }} />
                            <div>
                                <div className="text-sm font-medium text-white">{importing ? 'Importando...' : '2. Envie o CSV'}</div>
                                <div className="text-xs mt-0.5" style={{ color: 'var(--z-500)' }}>Arraste ou clique</div>
                            </div>
                        </div>
                    </div>
                    {importResult && (
                        <div className="mt-4 p-4 rounded-xl" style={{ background: importResult.errors.length > 0 ? 'rgba(239,68,68,0.06)' : 'rgba(16,185,129,0.06)', border: `1px solid ${importResult.errors.length > 0 ? 'rgba(239,68,68,0.2)' : 'var(--border-em)'}` }}>
                            <div className="flex items-center gap-4 mb-0">
                                <span className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--em-400)' }}>
                                    <CheckCircle2 size={14} /> {importResult.created} criado(s)
                                </span>
                                {importResult.errors.length > 0 && (
                                    <span className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--red-500)' }}>
                                        <AlertCircle size={14} /> {importResult.errors.length} erro(s)
                                    </span>
                                )}
                                <button onClick={() => setImportResult(null)} className="ml-auto" style={{ color: 'var(--z-500)' }}><X size={14} /></button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Search */}
            <div className="relative mb-4 max-w-[300px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--z-500)' }} />
                <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar..."
                    aria-label="Buscar usuário"
                    className="w-full h-9 pl-9 pr-3 rounded-xl text-sm text-white outline-none"
                    style={{ background: 'var(--z-850)', border: '1px solid var(--border)' }}
                />
            </div>

            {/* Table */}
            <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--z-900)', border: '1px solid var(--border)' }}>
                <table className="w-full text-sm">
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                            {['Nome', 'E-mail', ...(me?.isSuperAdmin ? ['Organização'] : []), 'Perfil', 'Setores', 'Status', ''].map(h => (
                                <th key={h} className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--z-500)', background: 'var(--z-850)' }}>
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((u: any) => (
                            <tr
                                key={u.id}
                                style={{ borderBottom: '1px solid var(--border)' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                                <td className="px-5 py-3.5 font-medium text-white">{u.name}</td>
                                <td className="px-5 py-3.5 text-xs" style={{ color: 'var(--z-400)' }}>{u.email}</td>
                                {me?.isSuperAdmin && <td className="px-5 py-3.5 text-xs" style={{ color: 'var(--z-400)' }}>{u.tenant?.name || '—'}</td>}
                                <td className="px-5 py-3.5"><RoleBadge role={u.role} /></td>
                                <td className="px-5 py-3.5">
                                    <div className="flex gap-1 flex-wrap">
                                        {u.departments.map((d: any) => (
                                            <span key={d.department.id} className="text-[10px] px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--z-300)' }}>
                                                {d.department.name}
                                            </span>
                                        ))}
                                    </div>
                                </td>
                                <td className="px-5 py-3.5"><OnlineDot online={u.online} /></td>
                                <td className="px-5 py-3.5">
                                    <div className="flex items-center gap-1 justify-end">
                                        <button onClick={() => openEdit(u)} aria-label={`Editar usuário ${u.name}`}
                                            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                                            style={{ color: 'var(--z-400)' }}
                                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'var(--z-100)'; }}
                                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--z-400)'; }}
                                        >
                                            <Pencil size={13} />
                                        </button>
                                        <button onClick={() => handleDelete(u.id)} aria-label={`Excluir usuário ${u.name}`}
                                            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                                            style={{ color: 'var(--z-500)' }}
                                            onMouseEnter={e => { e.currentTarget.style.background = 'var(--red-subtle)'; e.currentTarget.style.color = 'var(--red-500)'; }}
                                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--z-500)'; }}
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
                <AlertDialogContent style={{ background: 'var(--z-900)', border: '1px solid var(--border-md)', boxShadow: 'var(--shadow-xl)' }}>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-white">Excluir usuário</AlertDialogTitle>
                        <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={confirmDelete}>Excluir</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Modal */}
            <Dialog open={showModal} onOpenChange={setShowModal}>
                <DialogContent className="max-w-[440px]" style={{ background: 'var(--z-900)', border: '1px solid var(--border-md)', boxShadow: 'var(--shadow-xl)' }}>
                    <DialogHeader>
                        <DialogTitle className="text-white">{editing ? 'Editar Usuário' : 'Novo Usuário'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-1">
                        {[
                            { lbl: 'Nome', type: 'text', val: form.name, set: (v: string) => setForm(p => ({ ...p, name: v })), req: true },
                            { lbl: 'E-mail', type: 'email', val: form.email, set: (v: string) => setForm(p => ({ ...p, email: v })), req: true },
                            { lbl: editing ? 'Senha (vazio = manter)' : 'Senha', type: 'password', val: form.password, set: (v: string) => setForm(p => ({ ...p, password: v })), req: false },
                        ].map(f => (
                            <div key={f.lbl}>
                                <Label className="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" style={{ color: 'var(--z-500)' }}>{f.lbl}</Label>
                                <input type={f.type} value={f.val} onChange={e => f.set(e.target.value)} required={f.req} className={inputCls} style={inputStyle} />
                            </div>
                        ))}
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
                            <Label className="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" style={{ color: 'var(--z-500)' }}>Perfil</Label>
                            <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))} className="w-full h-9 px-3 rounded-xl text-sm outline-none" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--z-200)' }}>
                                <option value="AGENT">Agente</option>
                                <option value="ADMIN">Administrador</option>
                            </select>
                        </div>
                        <div>
                            <Label className="text-[10px] font-bold uppercase tracking-widest mb-2 block" style={{ color: 'var(--z-500)' }}>Setores</Label>
                            <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
                                {departments.map(d => (
                                    <label key={d.id} className="flex items-center gap-2.5 cursor-pointer text-sm" style={{ color: 'var(--z-300)' }}>
                                        <input type="checkbox" checked={form.departmentIds.includes(d.id)} onChange={() => toggleDept(d.id)} className="w-4 h-4 rounded cursor-pointer" style={{ accentColor: 'var(--em-500)' }} />
                                        {d.name}
                                    </label>
                                ))}
                            </div>
                        </div>
                        <div className="flex gap-2 pt-1">
                            <button type="button" onClick={() => setShowModal(false)} className="flex-1 h-9 rounded-xl text-sm font-medium transition-all" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-md)', color: 'var(--z-300)' }}>
                                Cancelar
                            </button>
                            <button type="submit" className="flex-1 h-9 rounded-xl text-sm font-semibold text-white transition-all" style={{ background: 'linear-gradient(135deg, var(--em-600), var(--em-500))' }}>
                                {editing ? 'Salvar' : 'Criar'}
                            </button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
