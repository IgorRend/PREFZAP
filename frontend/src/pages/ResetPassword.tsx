import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import api from '../services/api';
import { ArrowLeft, CheckCircle } from 'lucide-react';
import BrandLogo from '../components/BrandLogo';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function ResetPassword() {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [done, setDone] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirmPassword) { setError('As senhas não coincidem'); return; }
        setLoading(true); setError('');
        try {
            await api.post('/auth/reset-password', { token, password });
            setDone(true);
            setTimeout(() => navigate('/login'), 3000);
        } catch (err: any) { setError(err.response?.data?.error || 'Erro ao redefinir senha'); }
        setLoading(false);
    };

    if (!token) {
        return (
            <div className="h-screen flex items-center justify-center bg-background">
                <div className="text-center">
                    <p className="text-destructive mb-4">Token inválido.</p>
                    <Link to="/login" className="text-primary hover:underline">Voltar ao Login</Link>
                </div>
            </div>
        );
    }

    return (
        <div className="h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #0b141a 0%, #111b21 50%, #0b141a 100%)' }}>
            <div className="animate-scaleIn w-[400px] p-10 bg-card rounded-2xl border border-border shadow-2xl">
                <div className="text-center mb-8">
                    {done ? (
                        <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center bg-emerald-500/15">
                            <CheckCircle size={28} className="text-emerald-500" />
                        </div>
                    ) : (
                        <div className="mx-auto mb-4 flex items-center justify-center">
                            <BrandLogo size={56} />
                        </div>
                    )}
                    <h1 className="text-xl font-bold mb-1">{done ? 'Senha Redefinida!' : 'Nova Senha'}</h1>
                    <p className="text-sm text-muted-foreground">
                        {done ? 'Redirecionando para o login...' : 'Digite sua nova senha.'}
                    </p>
                </div>

                {error && (
                    <Alert className="border-destructive/30 bg-destructive/8 text-destructive mb-4">
                        <AlertDescription className="text-sm">{error}</AlertDescription>
                    </Alert>
                )}

                {!done && (
                    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                        <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Nova senha" required minLength={6} className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-border bg-input text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                        <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirmar senha" required minLength={6} className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-border bg-input text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                        <Button type="submit" disabled={loading} className="w-full">
                            {loading ? 'Salvando...' : 'Redefinir Senha'}
                        </Button>
                    </form>
                )}

                <div className="text-center mt-5">
                    <Link to="/login" className="text-sm text-primary no-underline inline-flex items-center gap-1.5 hover:underline">
                        <ArrowLeft size={13} /> Voltar ao Login
                    </Link>
                </div>
            </div>
        </div>
    );
}
