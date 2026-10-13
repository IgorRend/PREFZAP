import { useState, useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useTheme } from '../contexts/ThemeContext';
import {
    Search, Bell, ChevronDown, Sun, Moon, Monitor,
    PanelLeftClose, PanelLeftOpen, LogOut,
} from 'lucide-react';
import CommandPalette from './CommandPalette';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuGroup,
    DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';

const pageTitleMap: Record<string, string> = {
    '/dashboard': 'Dashboard',
    '/analytics': 'Relatórios',
    '/chat': 'Atendimentos',
    '/kanban': 'Kanban',
    '/team-chat': 'Chat Interno',
    '/bot-flow': 'Bot Flow',
    '/templates': 'Templates HSM',
    '/users': 'Usuários',
    '/departments': 'Setores',
    '/contacts': 'Contatos',
    '/settings': 'Configurações',
    '/audit-logs': 'Trilha de Auditoria',
    '/super-admin': 'Super Admin',
    '/quick-replies': 'Respostas Rápidas',
};

interface TopBarProps {
    onToggleSidebar: () => void;
    isCollapsed: boolean;
}

export default function TopBar({ onToggleSidebar, isCollapsed }: TopBarProps) {
    const location = useLocation();
    const navigate = useNavigate();
    const { user, logout } = useAuthStore();
    const { theme, setTheme } = useTheme();
    const [showPalette, setShowPalette] = useState(false);

    const path = location.pathname.split('/')[1] || '';
    const pageTitle = pageTitleMap[`/${path}`] || '';

    const cycleTheme = () => {
        if (theme === 'light') setTheme('dark');
        else if (theme === 'dark') setTheme('system');
        else setTheme('light');
    };

    const handleLogout = async () => {
        await logout();
        navigate('/login');
    };

    const openPalette = useCallback(() => setShowPalette(true), []);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                openPalette();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [openPalette]);

    const roleLabel = user?.isSuperAdmin
        ? 'Super Admin'
        : user?.role === 'ADMIN' ? 'Administrador' : 'Agente';

    const themeLabel = theme === 'light' ? 'Tema Claro' : theme === 'dark' ? 'Tema Escuro' : 'Automático';
    const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;

    return (
        <>
            <header className="flex items-center gap-3 h-[52px] min-h-[52px] px-4 bg-background border-b border-border sticky top-0 z-[15]">
                {/* Left: sidebar toggle + page title */}
                <div className="flex items-center gap-2.5 shrink-0">
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={onToggleSidebar}
                        title={isCollapsed ? 'Expandir menu' : 'Recolher menu'}
                        aria-label="Toggle sidebar"
                        className="h-8 w-8 text-muted-foreground"
                    >
                        {isCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
                    </Button>
                    {pageTitle && (
                        <h2 className="text-sm font-semibold text-foreground tracking-tight whitespace-nowrap">
                            {pageTitle}
                        </h2>
                    )}
                </div>

                {/* Center: search trigger */}
                <button
                    className="flex-1 max-w-[420px] mx-auto flex items-center gap-2 px-3 h-[34px] rounded-[10px] bg-input border border-border text-left cursor-pointer transition-colors hover:border-border/80 hover:bg-muted"
                    onClick={openPalette}
                    aria-label="Abrir busca"
                    id="topbar-search-btn"
                >
                    <Search size={14} className="text-muted-foreground shrink-0" />
                    <span className="flex-1 text-[13px] text-muted-foreground">Buscar atendimentos...</span>
                    <Kbd className="text-[10px] text-muted-foreground shrink-0">Ctrl+K</Kbd>
                </button>

                {/* Right: actions */}
                <div className="flex items-center gap-1 shrink-0 ml-auto">
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Notificações"
                        aria-label="Notificações"
                        className="h-8 w-8 text-muted-foreground"
                    >
                        <Bell size={17} />
                    </Button>

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                className="flex items-center gap-1.5 px-2 py-1 pr-2.5 rounded-[10px] bg-transparent border border-transparent cursor-pointer transition-colors hover:bg-muted hover:border-border"
                                id="topbar-user-menu-btn"
                            >
                                <Avatar className="h-[26px] w-[26px]">
                                    <AvatarFallback className="bg-gradient-to-br from-sky-500 to-blue-600 text-white text-[10px] font-bold">
                                        {user?.name?.charAt(0).toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>
                                <span className="text-[13px] font-medium text-foreground max-w-[120px] overflow-hidden text-ellipsis whitespace-nowrap">
                                    {user?.name}
                                </span>
                                <ChevronDown size={13} className="text-muted-foreground shrink-0" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            align="end"
                            className="min-w-[200px] rounded-xl shadow-xl"
                            sideOffset={6}
                        >
                            <DropdownMenuLabel className="px-3 py-2.5">
                                <div className="text-[13px] font-semibold text-foreground">{user?.name}</div>
                                <div className="text-[11px] text-muted-foreground mt-0.5">{roleLabel}</div>
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuGroup>
                                <DropdownMenuItem onClick={cycleTheme} className="text-[13px] gap-2 cursor-pointer">
                                    <ThemeIcon size={15} />
                                    <span>Tema: {themeLabel}</span>
                                </DropdownMenuItem>
                            </DropdownMenuGroup>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                onClick={handleLogout}
                                className="text-[13px] gap-2 cursor-pointer text-red-500 focus:text-red-500 focus:bg-red-500/8"
                                id="topbar-logout-btn"
                            >
                                <LogOut size={15} />
                                <span>Sair</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </header>

            {showPalette && <CommandPalette onClose={() => setShowPalette(false)} />}
        </>
    );
}
