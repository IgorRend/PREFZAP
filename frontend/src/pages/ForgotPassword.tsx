import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { ArrowLeft, Mail } from 'lucide-react';
import BrandLogo from '../components/BrandLogo';
import { Button } from '@/components/ui/button';

export default function ForgotPassword() {
    const [email, setEmail] = useState('');
    const [sent, setSent] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try { await api.post('/auth/forgot-password', { email }); setSent(true); } catch { }
        setLoading(false);
    };

    return (
        <div className="h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #0b141a 0%, #111b21 50%, #0b141a 100%)' }}>
            <div className="animate-scaleIn w-[400px] p-10 bg-card rounded-2xl border border-border shadow-2xl">
                <div className="text-center mb-8">
                    {sent ? (
                        <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center bg-primary/15">
                            <Mail size={28} className="text-primary" />
                        </div>
                    ) : (
                        <div className="mx-auto mb-4 flex items-center justify-center">
                            <BrandLogo size={56} />
                        </div>
                    )}
                    <h1 className="text-xl font-bold mb-1">{sent ? 'E-mail Enviado' : 'Recuperar Senha'}</h1>
                    <p className="text-sm text-muted-foreground">
                        {sent ? 'Se o e-mail existir em nosso sistema, você receberá um link de recuperação.' : 'Digite seu e-mail para receber o link de recuperação.'}
                    </p>
                </div>

                {!sent && (
                    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" required className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-border bg-input text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                        <Button type="submit" disabled={loading} className="w-full">
                            {loading ? 'Enviando...' : 'Enviar Link'}
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
