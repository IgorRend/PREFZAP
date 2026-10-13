import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import api from '../services/api';
import {
    ShieldAlert, Plus, Edit2, CheckCircle2, XCircle,
    Box, Globe, Briefcase, Power, Users as UsersIcon, Building2,
} from 'lucide-react';
import Users from './Users';
import Departments from './Departments';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

interface Tenant {
    id: string; name: string; domain: string | null; businessNiche: string;
    activeModules: string[]; isActive: boolean; createdAt: string;
}

interface Metrics {
    summary: { totalTenants: number; activeTenants: number; totalUsers: number; totalConnections: number; }
}

const NICHES = [
    { value: 'generic', label: 'Genérico' }, { value: 'public_sector', label: 'Setor Público' },
    { value: 'healthcare', label: 'Saúde' }, { value: 'retail', label: 'Varejo' },
];

const AVAILABLE_MODULES = [
    { id: 'ticketing', label: 'Atendimento (Tickets)' }, { id: 'bot_flow', label: 'Construtor de Robô' },
    { id: 'analytics', label: 'Relatórios' }, { id: 'internal_chat', label: 'Chat Interno' },
    { id: 'nps', label: 'NPS' }, { id: 'automations', label: 'Automações' },
    { id: 'hsm_templates', label: 'Templates HSM' }, { id: 'bulk_import', label: 'Importação em Massa' },
];

const inputCls = "w-full px-3 py-2.5 text-sm rounded-lg border border-border bg-input text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary";

export default function SuperAdmin() {
    const { user, setManagementContext } = useAuthStore();
    const navigate = useNavigate();
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [metrics, setMetrics] = useState<Metrics | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('organizations');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isProvisioning, setIsProvisioning] = useState(false);
    const [currentTenant, setCurrentTenant] = useState<any>({});
    const [formLoading, setFormLoading] = useState(false);

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        try {
            const [tenantsRes, metricsRes] = await Promise.all([
                api.get('/super-admin/tenants'), api.get('/super-admin/metrics'),
            ]);
            setTenants(tenantsRes.data); setMetrics(metricsRes.data);
        } catch (error) { console.error('Failed to load super admin data', error); }
        finally { setIsLoading(false); }
    };

    const handleOpenModal = (tenant?: Tenant) => {
        if (tenant) { setIsProvisioning(false); setCurrentTenant(tenant); }
        else {
            setIsProvisioning(true);
            setCurrentTenant({ name: '', domain: '', businessNiche: 'generic', activeModules: ['ticketing', 'bot_flow', 'analytics'], isActive: true, adminName: '', adminEmail: '', adminPassword: '' });
        }
        setIsModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault(); setFormLoading(true);
        try {
            if (isProvisioning) { await api.post('/super-admin/tenants/provision', currentTenant); toast.success('Tenant provisionado!'); }
            else { await api.put(`/super-admin/tenants/${currentTenant.id}`, currentTenant); }
            await loadData(); setIsModalOpen(false);
        } catch (error: any) { toast.error(error.response?.data?.error || 'Erro ao salvar tenant'); }
        finally { setFormLoading(false); }
    };

    const toggleModule = (moduleId: string) => {
        const modules = currentTenant.activeModules || [];
        setCurrentTenant({ ...currentTenant, activeModules: modules.includes(moduleId) ? modules.filter((m: string) => m !== moduleId) : [...modules, moduleId] });
    };

    if (!user?.isSuperAdmin) return <div className="p-10 text-muted-foreground">Acesso restrito.</div>;

    return (
        <div className="flex-1 bg-background flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-8 py-6 border-b border-border flex flex-col gap-6">
                <div className="flex items-center gap-3">
                    <ShieldAlert size={26} className="text-destructive" />
                    <div>
                        <h1 className="text-2xl font-bold leading-none">Super Admin Center</h1>
                        <p className="text-sm text-muted-foreground mt-1">Gestão unificada e isolamento estrito de instâncias e recursos.</p>
                    </div>
                </div>

                {metrics && (
                    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                        {[
                            { icon: Globe, label: 'Organizações', value: metrics.summary.totalTenants, cls: 'bg-destructive/10 text-destructive' },
                            { icon: UsersIcon, label: 'Usuários', value: metrics.summary.totalUsers, cls: 'bg-emerald-500/10 text-emerald-500' },
                            { icon: Power, label: 'Conexões WhatsApp', value: metrics.summary.totalConnections, cls: 'bg-blue-500/10 text-blue-500' },
                        ].map(({ icon: Icon, label, value, cls }) => (
                            <Card key={label}>
                                <CardContent className="p-4 flex items-center gap-3">
                                    <div className={`p-3 rounded-lg ${cls}`}><Icon size={22} /></div>
                                    <div>
                                        <div className="text-2xl font-bold">{value}</div>
                                        <div className="text-xs text-muted-foreground uppercase font-semibold tracking-wide">{label}</div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
                <div className="px-8 border-b border-border">
                    <TabsList className="h-auto bg-transparent p-0 gap-0 border-0 rounded-none">
                        {[
                            { key: 'organizations', label: 'Organizações (Tenants)', icon: <Globe size={15} /> },
                            { key: 'users', label: 'Usuários Globais', icon: <UsersIcon size={15} /> },
                            { key: 'departments', label: 'Setores / Grupos', icon: <Building2 size={15} /> },
                        ].map(t => (
                            <TabsTrigger key={t.key} value={t.key} className="flex items-center gap-2 px-5 py-4 text-sm font-semibold rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent bg-transparent text-muted-foreground hover:text-foreground transition-colors">
                                {t.icon} {t.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </div>

                <TabsContent value="organizations" className="flex-1 overflow-auto p-8 mt-0">
                    <div className="flex justify-end mb-5">
                        <Button onClick={() => handleOpenModal()} className="gap-2">
                            <Plus size={16} /> Provisionar Organização
                        </Button>
                    </div>
                    {isLoading ? (
                        <p className="text-muted-foreground text-sm">Carregando organizações...</p>
                    ) : (
                        <Card className="overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>TENANT</TableHead>
                                        <TableHead>DOMÍNIO</TableHead>
                                        <TableHead>NICHO (i18n)</TableHead>
                                        <TableHead>MÓDULOS ATIVOS</TableHead>
                                        <TableHead>STATUS</TableHead>
                                        <TableHead className="text-right">AÇÕES</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {tenants.map(tenant => (
                                        <TableRow key={tenant.id}>
                                            <TableCell className="font-semibold">{tenant.name}</TableCell>
                                            <TableCell className="text-muted-foreground text-sm">
                                                {tenant.domain || <span className="opacity-50">Sem domínio customizado</span>}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="secondary" className="bg-muted border-0 text-xs">
                                                    {NICHES.find(n => n.value === tenant.businessNiche)?.label || tenant.businessNiche}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">{tenant.activeModules.length} módulos</TableCell>
                                            <TableCell>
                                                {tenant.isActive ? (
                                                    <span className="flex items-center gap-1.5 text-emerald-500 text-sm"><CheckCircle2 size={13} /> Ativo</span>
                                                ) : (
                                                    <span className="flex items-center gap-1.5 text-destructive text-sm"><XCircle size={13} /> Inativo</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex justify-end gap-2">
                                                    <Button variant="outline" size="xs" onClick={() => { setManagementContext({ id: tenant.id, name: tenant.name }); navigate('/users'); }}>
                                                        Gerenciar
                                                    </Button>
                                                    <Button variant="ghost" size="icon-xs" aria-label={`Editar organização ${tenant.name}`} onClick={() => handleOpenModal(tenant)}>
                                                        <Edit2 size={14} />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </Card>
                    )}
                </TabsContent>

                <TabsContent value="users" className="flex-1 overflow-hidden mt-0">
                    <Users />
                </TabsContent>

                <TabsContent value="departments" className="flex-1 overflow-hidden mt-0">
                    <Departments />
                </TabsContent>
            </Tabs>

            {/* Modal */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="max-w-[600px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{isProvisioning ? 'Provisionar Nova Organização (Tenant)' : 'Editar Organização'}</DialogTitle>
                    </DialogHeader>
                    <form id="tenant-form" onSubmit={handleSave} className="flex flex-col gap-6 mt-1">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label className="text-xs font-semibold uppercase tracking-wide mb-1.5 block">Nome da Empresa/Órgão *</Label>
                                <input required value={currentTenant.name} onChange={e => setCurrentTenant({ ...currentTenant, name: e.target.value })} className={inputCls} placeholder="Ex: Prefeitura de Mafra" />
                            </div>
                            <div>
                                <Label className="text-xs font-semibold uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                                    <Globe size={12} /> Domínio Customizado
                                </Label>
                                <input value={currentTenant.domain || ''} onChange={e => setCurrentTenant({ ...currentTenant, domain: e.target.value })} className={inputCls} placeholder="ex: app.prefeitura.sc.gov.br" />
                            </div>
                        </div>

                        <div>
                            <Label className="text-xs font-semibold uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                                <Briefcase size={12} /> Nicho de Negócio (Dicionário de Termos)
                            </Label>
                            <select value={currentTenant.businessNiche} onChange={e => setCurrentTenant({ ...currentTenant, businessNiche: e.target.value })} className={inputCls}>
                                {NICHES.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
                            </select>
                        </div>

                        {isProvisioning && (
                            <div className="bg-primary/5 border border-primary/20 p-4 rounded-lg flex flex-col gap-4">
                                <h3 className="text-sm font-semibold flex items-center gap-2 text-primary">
                                    <UsersIcon size={14} /> Conta de Administrador Principal
                                </h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label className="text-xs font-semibold uppercase tracking-wide mb-1.5 block">Nome do Admin *</Label>
                                        <input required={isProvisioning} value={currentTenant.adminName || ''} onChange={e => setCurrentTenant({ ...currentTenant, adminName: e.target.value })} className={inputCls} placeholder="Nome completo" />
                                    </div>
                                    <div>
                                        <Label className="text-xs font-semibold uppercase tracking-wide mb-1.5 block">E-mail do Admin *</Label>
                                        <input type="email" required={isProvisioning} value={currentTenant.adminEmail || ''} onChange={e => setCurrentTenant({ ...currentTenant, adminEmail: e.target.value })} className={inputCls} placeholder="admin@empresa.com" />
                                    </div>
                                </div>
                                <div>
                                    <Label className="text-xs font-semibold uppercase tracking-wide mb-1.5 block">Senha (opcional — gerada se vazio)</Label>
                                    <input type="password" value={currentTenant.adminPassword || ''} onChange={e => setCurrentTenant({ ...currentTenant, adminPassword: e.target.value })} className={inputCls} placeholder="Deixe em branco para auto-gerar" />
                                </div>
                            </div>
                        )}

                        <div>
                            <Label className="text-xs font-semibold uppercase tracking-wide mb-2 flex items-center gap-1.5">
                                <Box size={12} /> Módulos Contratados
                            </Label>
                            <div className="bg-background border border-border rounded-lg p-4 grid grid-cols-2 gap-3">
                                {AVAILABLE_MODULES.map(mod => {
                                    const isActive = (currentTenant.activeModules || []).includes(mod.id);
                                    return (
                                        <label key={mod.id} className="flex items-center gap-2 cursor-pointer text-sm">
                                            <input type="checkbox" checked={isActive} onChange={() => toggleModule(mod.id)} className="w-4 h-4 accent-[var(--accent)] cursor-pointer" />
                                            {mod.label}
                                        </label>
                                    );
                                })}
                            </div>
                        </div>

                        <label className="flex items-center gap-2 cursor-pointer text-sm">
                            <input type="checkbox" checked={currentTenant.isActive} onChange={e => setCurrentTenant({ ...currentTenant, isActive: e.target.checked })} className="w-4 h-4 accent-[var(--accent)] cursor-pointer" />
                            <span className="flex items-center gap-1.5"><Power size={13} /> Suspender / Ativar Tenant</span>
                        </label>
                    </form>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                        <Button form="tenant-form" type="submit" disabled={formLoading}>
                            {formLoading ? 'Processando...' : (isProvisioning ? 'Provisionar' : 'Salvar')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
