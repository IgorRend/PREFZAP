import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { useEffect, useState, Component, ReactNode, lazy, Suspense } from 'react';
import { useAuthStore } from './store/authStore';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Layout from './components/Layout';
import Chat from './pages/Chat';
// Non-critical pages: code-split via dynamic import so the initial bundle
// does not include @xyflow/react (BotFlowBuilder), recharts (Dashboard/Analytics),
// or other heavy libraries that agents on the Chat route never need.
const Dashboard      = lazy(() => import('./pages/Dashboard'));
const BotFlowBuilder = lazy(() => import('./pages/BotFlowBuilder'));
const Analytics      = lazy(() => import('./pages/Analytics'));
const Kanban         = lazy(() => import('./pages/Kanban'));
const Users          = lazy(() => import('./pages/Users'));
const Departments    = lazy(() => import('./pages/Departments'));
const Settings       = lazy(() => import('./pages/Settings'));
const Templates      = lazy(() => import('./pages/Templates'));
const TeamChat       = lazy(() => import('./pages/TeamChat'));
const SuperAdmin     = lazy(() => import('./pages/SuperAdmin'));
const AuditLogs      = lazy(() => import('./pages/AuditLogs'));
const Contacts       = lazy(() => import('./pages/Contacts'));
const QuickReplies   = lazy(() => import('./pages/QuickReplies'));
import { ComponentErrorBoundary } from './components/ComponentErrorBoundary';
import CommandPalette from './components/CommandPalette';
import { DictionaryProvider } from './contexts/DictionaryContext';
import { ModulesProvider } from './contexts/ModulesContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { useBackgroundAlerts } from './hooks/useBackgroundAlerts';
import './index.css';

// Error boundary to catch runtime errors
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: any) {
    console.error('React Error Boundary caught:', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="p-10 text-destructive bg-[#0b141a] h-screen font-mono">
          <h1 className="text-[#e9edef] mb-4 text-xl font-bold">⚠️ Application Error</h1>
          <pre className="whitespace-pre-wrap text-sm">{this.state.error.message}</pre>
          <pre className="whitespace-pre-wrap text-xs text-[#8696a0] mt-4">{this.state.error.stack}</pre>
          <button
            onClick={() => { this.setState({ error: null }); window.location.href = '/login'; }}
            className="mt-5 px-5 py-2.5 bg-primary border-none rounded-md cursor-pointer text-primary-foreground text-sm font-medium hover:bg-primary/80 transition-colors"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (user?.role !== 'ADMIN' && !user?.isSuperAdmin) return <Navigate to="/chat" replace />;
  return <>{children}</>;
}

function SuperAdminRoute({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user?.isSuperAdmin) return <Navigate to="/chat" replace />;
  return <>{children}</>;
}

// AppInner lives inside BrowserRouter so it can use useNavigate
function AppInner() {
  const checkAuth = useAuthStore((s) => s.checkAuth);
  const [showPalette, setShowPalette] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  // ─── Background alerts (sound + title badge) ───────────
  useBackgroundAlerts();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowPalette(prev => !prev);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  return (
    <>
      {showPalette && <CommandPalette onClose={() => setShowPalette(false)} />}
      <Suspense fallback={<div style={{ flex: 1, height: '100dvh', background: 'var(--z-950)' }} />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Navigate to="/chat" replace />} />
          <Route path="dashboard" element={<AdminRoute><Dashboard /></AdminRoute>} />
          <Route path="chat" element={<ComponentErrorBoundary><Chat /></ComponentErrorBoundary>} />
          <Route path="users" element={<AdminRoute><Users /></AdminRoute>} />
          <Route path="departments" element={<AdminRoute><Departments /></AdminRoute>} />
          <Route path="bot-flow" element={<AdminRoute><ComponentErrorBoundary><BotFlowBuilder /></ComponentErrorBoundary></AdminRoute>} />
          <Route path="settings" element={<AdminRoute><Settings /></AdminRoute>} />
          <Route path="templates" element={<AdminRoute><Templates /></AdminRoute>} />
          <Route path="team-chat" element={<TeamChat />} />
          <Route path="kanban" element={<ComponentErrorBoundary><Kanban /></ComponentErrorBoundary>} />
          <Route path="analytics" element={<AdminRoute><Analytics /></AdminRoute>} />
          <Route path="audit-logs" element={<AdminRoute><AuditLogs /></AdminRoute>} />
          <Route path="contacts" element={<Contacts />} />
          <Route path="quick-replies" element={<AdminRoute><QuickReplies /></AdminRoute>} />
          <Route path="super-admin" element={<SuperAdminRoute><SuperAdmin /></SuperAdminRoute>} />
        </Route>
      </Routes>
      </Suspense>
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <DictionaryProvider>
        <ModulesProvider>
          <ThemeProvider>
            <TooltipProvider delayDuration={300}>
              <BrowserRouter>
                <AppInner />
                <Toaster position="bottom-right" richColors closeButton />
              </BrowserRouter>
            </TooltipProvider>
          </ThemeProvider>
        </ModulesProvider>
      </DictionaryProvider>
    </ErrorBoundary>
  );
}
