import { useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useDictionary } from '../contexts/DictionaryContext';
import { useModules } from '../contexts/ModulesContext';
import { DictionaryKey } from '../lib/dictionary';
import {
    MessageSquare, Users, Building2, Bot, LayoutDashboard, LogOut,
    Settings2, FileText, MessagesSquare, ShieldAlert, KanbanSquare, BarChart2,
    Shield, BookUser, Zap, Wifi, RefreshCw, ChevronLeft, ChevronRight,
    Search, Bell, ChevronDown,
} from 'lucide-react';
import CommandPalette from './CommandPalette';
import BrandLogo from './BrandLogo';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/* ── Nav config ── */
interface NavItem {
    path: string;
    icon: React.ElementType;
    label: string;
    adminOnly?: boolean;
    superAdminOnly?: boolean;
    module?: string;
    section: string;
}

const NAV_ITEMS: NavItem[] = [
    { path: '/dashboard',              icon: LayoutDashboard, label: 'Dashboard',           adminOnly: true,   section: 'analytics' },
    { path: '/analytics',              icon: BarChart2,       label: 'Relatórios',           adminOnly: true,   section: 'analytics' },
    { path: '/chat',                   icon: MessageSquare,   label: 'Atendimentos',         module: 'ticketing', section: 'service' },
    { path: '/kanban',                 icon: KanbanSquare,    label: 'Kanban',               module: 'ticketing', section: 'service' },
    { path: '/team-chat',              icon: MessagesSquare,  label: 'Chat Interno',         module: 'internal_chat', section: 'service' },
    { path: '/settings?tab=automations', icon: Bot,           label: 'Chatbot',              adminOnly: true, module: 'automations', section: 'automation' },
    { path: '/bot-flow',               icon: Zap,             label: 'Fluxos',               adminOnly: true, module: 'bot_flow', section: 'automation' },
    { path: '/quick-replies',          icon: MessageSquare,   label: 'Respostas Rápidas',    adminOnly: true,   section: 'automation' },
    { path: '/templates',              icon: FileText,        label: 'Templates HSM',        adminOnly: true, module: 'hsm_templates', section: 'automation' },
    { path: '/contacts',               icon: BookUser,        label: 'Contatos',             section: 'contacts' },
    { path: '/contacts?tab=import',    icon: RefreshCw,       label: 'Importar',             adminOnly: true,   section: 'contacts' },
    { path: '/super-admin',            icon: ShieldAlert,     label: 'Organizações',         superAdminOnly: true, section: 'admin' },
    { path: '/users',                  icon: Users,           label: 'Usuários',             adminOnly: true,   section: 'admin' },
    { path: '/departments',            icon: Building2,       label: 'Setores',              adminOnly: true,   section: 'admin' },
    { path: '/settings?tab=connections', icon: Wifi,          label: 'Conexões',             adminOnly: true,   section: 'admin' },
    { path: '/settings',               icon: Settings2,       label: 'Configurações',        adminOnly: true,   section: 'admin' },
    { path: '/audit-logs',             icon: Shield,          label: 'Auditoria',            adminOnly: true,   section: 'admin' },
];

const SECTION_LABELS: Record<string, string> = {
    analytics: 'Análises',
    service: 'Atendimento',
    automation: 'Automação',
    contacts: 'Contatos',
    admin: 'Administração',
};

const SECTION_ORDER = ['analytics', 'service', 'automation', 'contacts', 'admin'];

/* ── Active link helper ── */
function isActive(path: string, location: ReturnType<typeof useLocation>): boolean {
    const [pn, qs] = path.split('?');
    if (location.pathname !== pn) return false;
    if (qs) {
        const p = new URLSearchParams(qs);
        const c = new URLSearchParams(location.search);
        for (const [k, v] of p.entries()) if (c.get(k) !== v) return false;
    } else if (location.search.includes('tab=')) {
        const tab = new URLSearchParams(location.search).get('tab');
        if (tab && ['connections', 'automations', 'import'].includes(tab)) return false;
    }
    return true;
}

export default function Layout() {
    const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sb') === '1');
    const [showPalette, setShowPalette] = useState(false);
    const { user, logout, managementContext, setManagementContext } = useAuthStore();
    const { hasModule } = useModules();
    const { t } = useDictionary();
    const navigate = useNavigate();
    const location = useLocation();

    const toggle = () => setCollapsed(c => { localStorage.setItem('sb', c ? '0' : '1'); return !c; });

    const handleLogout = async () => { await logout(); navigate('/login'); };

    const items = NAV_ITEMS.filter(item => {
        if (item.superAdminOnly && !user?.isSuperAdmin) return false;
        if (item.adminOnly && user?.role !== 'ADMIN' && !user?.isSuperAdmin) return false;
        if (item.module && !hasModule(item.module)) return false;
        return true;
    });

    const groups = SECTION_ORDER
        .map(s => ({ section: s, items: items.filter(i => i.section === s) }))
        .filter(g => g.items.length > 0);

    const initials = user?.name?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() ?? '?';
    const w = collapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-w)';

    return (
        <div className="flex h-dvh overflow-hidden" style={{ background: 'var(--z-950)' }}>

            {/* ══ SIDEBAR ══ */}
            <aside
                className="flex flex-col overflow-hidden flex-shrink-0 relative z-10"
                style={{
                    width: w,
                    minWidth: w,
                    background: 'var(--z-925)',
                    borderRight: '1px solid var(--border)',
                    transition: 'width 220ms var(--ease-smooth), min-width 220ms var(--ease-smooth)',
                }}
            >
                {/* Logo row */}
                <div
                    className="flex items-center px-3 shrink-0"
                    style={{
                        height: 56,
                        borderBottom: '1px solid var(--border)',
                        gap: 10,
                    }}
                >
                    {/* Brand logo (brasão de Mafra) */}
                    <BrandLogo size={32} />

                    {!collapsed && (
                        <div className="flex-1 overflow-hidden">
                            <div className="text-sm font-bold text-white truncate leading-none">Atende Mafra</div>
                            <div className="text-[10px] truncate mt-0.5" style={{ color: 'var(--z-500)' }}>
                                {t('SIDEBAR_SUBTITLE' as DictionaryKey) || 'Plataforma de atendimento'}
                            </div>
                        </div>
                    )}

                    {/* Collapse button */}
                    <button
                        onClick={toggle}
                        className="shrink-0 w-6 h-6 rounded-lg flex items-center justify-center transition-all duration-150"
                        style={{ color: 'var(--z-500)', background: 'transparent' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'var(--z-200)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--z-500)'; }}
                    >
                        {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
                    </button>
                </div>

                {/* Nav */}
                <nav className="flex-1 overflow-y-auto no-scrollbar px-2 py-2 space-y-0.5">
                    {groups.map(({ section, items: groupItems }, gi) => (
                        <div key={section} className="mb-1">
                            {!collapsed && (
                                <div
                                    className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-widest"
                                    style={{ color: 'var(--z-500)' }}
                                >
                                    {SECTION_LABELS[section]}
                                </div>
                            )}
                            {collapsed && gi > 0 && (
                                <div className="mx-2 my-1.5 h-px" style={{ background: 'var(--border)' }} />
                            )}
                            {groupItems.map(({ path, icon: Icon, label, superAdminOnly }) => {
                                const active = isActive(path, location);
                                const isDanger = superAdminOnly;
                                const btn = (
                                    <NavLink
                                        key={path}
                                        to={path}
                                        className="flex items-center rounded-lg transition-all duration-150 group"
                                        style={{
                                            gap: collapsed ? 0 : 9,
                                            padding: collapsed ? '8px' : '7px 8px',
                                            justifyContent: collapsed ? 'center' : 'flex-start',
                                            color: active
                                                ? isDanger ? '#fca5a5' : 'var(--em-400)'
                                                : isDanger ? '#f87171' : 'var(--z-400)',
                                            background: active
                                                ? isDanger ? 'rgba(239,68,68,0.08)' : 'var(--em-subtle)'
                                                : 'transparent',
                                        }}
                                        onMouseEnter={e => {
                                            if (!active) {
                                                e.currentTarget.style.background = isDanger ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.04)';
                                                e.currentTarget.style.color = isDanger ? '#fca5a5' : 'var(--z-200)';
                                            }
                                        }}
                                        onMouseLeave={e => {
                                            if (!active) {
                                                e.currentTarget.style.background = 'transparent';
                                                e.currentTarget.style.color = isDanger ? '#f87171' : 'var(--z-400)';
                                            }
                                        }}
                                    >
                                        <Icon size={15} className="shrink-0" />
                                        {!collapsed && (
                                            <span className="text-[13px] font-medium leading-none truncate">{label}</span>
                                        )}
                                        {!collapsed && active && (
                                            <div
                                                className="ml-auto w-1 h-1 rounded-full shrink-0"
                                                style={{ background: isDanger ? 'var(--red-500)' : 'var(--em-500)' }}
                                            />
                                        )}
                                    </NavLink>
                                );

                                if (!collapsed) return btn;

                                return (
                                    <Tooltip key={path} delayDuration={0}>
                                        <TooltipTrigger asChild>{btn}</TooltipTrigger>
                                        <TooltipContent side="right" className="text-xs font-medium">{label}</TooltipContent>
                                    </Tooltip>
                                );
                            })}
                        </div>
                    ))}
                </nav>

                {/* Footer */}
                <div
                    className="shrink-0 px-2 py-2"
                    style={{ borderTop: '1px solid var(--border)' }}
                >
                    {!collapsed ? (
                        <div
                            className="flex items-center gap-2.5 px-2 py-2 rounded-xl"
                            style={{ background: 'rgba(255,255,255,0.03)' }}
                        >
                            <div
                                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[11px] font-bold text-white"
                                style={{ background: 'linear-gradient(135deg, var(--em-600), var(--em-500))' }}
                            >
                                {initials}
                            </div>
                            <div className="flex-1 overflow-hidden">
                                <div className="text-[12px] font-semibold text-white truncate leading-tight">{user?.name}</div>
                                <div className="text-[10px] truncate mt-0.5" style={{ color: 'var(--z-500)' }}>
                                    {user?.isSuperAdmin ? 'Super Admin' : user?.role === 'ADMIN' ? 'Admin' : 'Agente'}
                                </div>
                            </div>
                            <button
                                onClick={handleLogout}
                                className="shrink-0 w-6 h-6 rounded-lg flex items-center justify-center transition-all"
                                style={{ color: 'var(--z-500)' }}
                                onMouseEnter={e => { e.currentTarget.style.color = '#fca5a5'; e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; }}
                                onMouseLeave={e => { e.currentTarget.style.color = 'var(--z-500)'; e.currentTarget.style.background = 'transparent'; }}
                                title="Sair"
                            >
                                <LogOut size={12} />
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-1.5">
                            <Tooltip delayDuration={0}>
                                <TooltipTrigger asChild>
                                    <div
                                        className="w-8 h-8 rounded-xl flex items-center justify-center text-[11px] font-bold text-white cursor-default"
                                        style={{ background: 'linear-gradient(135deg, var(--em-600), var(--em-500))' }}
                                    >
                                        {initials}
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent side="right" className="text-xs">{user?.name}</TooltipContent>
                            </Tooltip>
                            <Tooltip delayDuration={0}>
                                <TooltipTrigger asChild>
                                    <button
                                        onClick={handleLogout}
                                        className="w-8 h-8 rounded-xl flex items-center justify-center transition-all"
                                        style={{ color: 'var(--z-500)' }}
                                        onMouseEnter={e => { e.currentTarget.style.color = '#fca5a5'; e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--z-500)'; e.currentTarget.style.background = 'transparent'; }}
                                    >
                                        <LogOut size={13} />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent side="right" className="text-xs">Sair</TooltipContent>
                            </Tooltip>
                        </div>
                    )}
                </div>
            </aside>

            {/* ══ MAIN ══ */}
            <div className="flex flex-col flex-1 overflow-hidden">

                {/* ── TopBar ── */}
                <header
                    className="flex items-center px-4 gap-3 shrink-0"
                    style={{
                        height: 52,
                        background: 'var(--z-925)',
                        borderBottom: '1px solid var(--border)',
                    }}
                >
                    {/* Search trigger */}
                    <button
                        onClick={() => setShowPalette(true)}
                        className="flex items-center gap-2 flex-1 max-w-[360px] h-8 px-3 rounded-xl text-sm transition-all duration-150"
                        style={{
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid var(--border)',
                            color: 'var(--z-500)',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; e.currentTarget.style.color = 'var(--z-400)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--z-500)'; }}
                    >
                        <Search size={13} />
                        <span className="flex-1 text-left text-[13px]">Buscar atendimentos...</span>
                        <kbd
                            className="text-[10px] px-1.5 py-0.5 rounded-md font-medium"
                            style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--z-500)' }}
                        >
                            ⌘K
                        </kbd>
                    </button>

                    {/* Right actions */}
                    <div className="ml-auto flex items-center gap-1">
                        {/* Notification bell */}
                        <button
                            className="w-8 h-8 rounded-xl flex items-center justify-center transition-all"
                            style={{ color: 'var(--z-500)' }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'var(--z-200)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--z-500)'; }}
                        >
                            <Bell size={15} />
                        </button>

                        {/* User dropdown */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button
                                    className="flex items-center gap-2 h-8 pl-2 pr-2.5 rounded-xl transition-all"
                                    style={{ border: '1px solid transparent' }}
                                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}
                                >
                                    <div
                                        className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                                        style={{ background: 'linear-gradient(135deg, var(--em-600), var(--em-500))' }}
                                    >
                                        {initials}
                                    </div>
                                    <span className="text-[13px] font-medium text-white max-w-[100px] truncate">{user?.name?.split(' ')[0]}</span>
                                    <ChevronDown size={12} style={{ color: 'var(--z-500)' }} />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                align="end"
                                sideOffset={6}
                                className="min-w-[180px] rounded-xl border"
                                style={{
                                    background: 'var(--z-850)',
                                    borderColor: 'var(--border-md)',
                                    boxShadow: 'var(--shadow-xl)',
                                }}
                            >
                                <div className="px-3 py-2.5">
                                    <div className="text-[13px] font-semibold text-white">{user?.name}</div>
                                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--z-500)' }}>
                                        {user?.isSuperAdmin ? 'Super Admin' : user?.role === 'ADMIN' ? 'Administrador' : 'Agente'}
                                    </div>
                                </div>
                                <DropdownMenuSeparator style={{ background: 'var(--border)' }} />
                                <DropdownMenuItem
                                    onClick={handleLogout}
                                    className="text-[13px] gap-2 cursor-pointer mx-1 mb-1 rounded-lg"
                                    style={{ color: '#fca5a5' }}
                                >
                                    <LogOut size={13} />
                                    Sair
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </header>

                {/* Management context banner */}
                {managementContext && (
                    <div className="mgmt-banner">
                        <div className="flex items-center gap-2">
                            <ShieldAlert size={14} />
                            <span>Gerenciando: <strong>{managementContext.name}</strong></span>
                        </div>
                        <button
                            onClick={() => setManagementContext(null)}
                            className="text-xs px-3 py-1 rounded-lg transition-all"
                            style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--em-400)' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(16,185,129,0.25)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(16,185,129,0.15)'}
                        >
                            Sair do modo
                        </button>
                    </div>
                )}

                {/* Page content */}
                <main className="flex-1 overflow-hidden flex flex-col">
                    <Outlet />
                </main>
            </div>

            {/* Command palette */}
            {showPalette && <CommandPalette onClose={() => setShowPalette(false)} />}
        </div>
    );
}
