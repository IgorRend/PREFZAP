import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

interface Particle {
    x: number; y: number;
    vx: number; vy: number;
    r: number;
}

const COUNT       = 88;
const CONNECT     = 200;    // px — max distance for a connection line
const REPEL_R     = 95;     // px — mouse repulsion radius
const REPEL_F     = 0.55;   // repulsion force multiplier
const EM          = '16,185,129'; // emerald RGB

export default function Login() {
    const [email, setEmail]     = useState('');
    const [password, setPassword] = useState('');
    const [showPwd, setShowPwd] = useState(false);
    const { login, isLoading, error, clearError } = useAuthStore();
    const navigate = useNavigate();

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const mouseRef  = useRef({ x: -9999, y: -9999 });
    const rafRef    = useRef<number>(0);

    useEffect(() => { if (error) clearError(); }, [email, password]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        clearError();
        await login(email, password);
        if (useAuthStore.getState().user) navigate('/chat');
    };

    // ── Particle network engine ────────────────────────────────────────────
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let particles: Particle[] = [];
        let w = 0, h = 0;

        const init = () => {
            w = canvas.offsetWidth;
            h = canvas.offsetHeight;
            if (w === 0 || h === 0) return; // hidden on mobile — skip
            canvas.width  = w;
            canvas.height = h;
            particles = Array.from({ length: COUNT }, () => ({
                x:  Math.random() * w,
                y:  Math.random() * h,
                vx: (Math.random() - 0.5) * 0.45,
                vy: (Math.random() - 0.5) * 0.45,
                r:  Math.random() * 1.0 + 1.5,
            }));
        };

        const onResize = () => init();
        init();
        window.addEventListener('resize', onResize);

        const loop = () => {
            ctx.clearRect(0, 0, w, h);

            const mx = mouseRef.current.x;
            const my = mouseRef.current.y;

            // Update physics
            for (const p of particles) {
                // Mouse repulsion
                const dx = p.x - mx;
                const dy = p.y - my;
                const d2 = dx * dx + dy * dy;
                if (d2 < REPEL_R * REPEL_R && d2 > 0.01) {
                    const d = Math.sqrt(d2);
                    const f = ((REPEL_R - d) / REPEL_R) * REPEL_F;
                    p.vx += (dx / d) * f;
                    p.vy += (dy / d) * f;
                }

                // Damping — gradually returns to drift speed
                p.vx *= 0.97;
                p.vy *= 0.97;

                // Minimum drift — particles never fully stop
                const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
                if (spd < 0.08) {
                    p.vx += (Math.random() - 0.5) * 0.06;
                    p.vy += (Math.random() - 0.5) * 0.06;
                }

                p.x += p.vx;
                p.y += p.vy;

                // Bounce off walls
                if (p.x < 0)  { p.x = 0;  p.vx *= -1; }
                if (p.x > w)  { p.x = w;  p.vx *= -1; }
                if (p.y < 0)  { p.y = 0;  p.vy *= -1; }
                if (p.y > h)  { p.y = h;  p.vy *= -1; }
            }

            // Draw connection lines (O(n²), optimised with squared distance)
            const CONNECT_SQ = CONNECT * CONNECT;
            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    const a = particles[i], b = particles[j];
                    const dx = a.x - b.x, dy = a.y - b.y;
                    const d2 = dx * dx + dy * dy;
                    if (d2 < CONNECT_SQ) {
                        const alpha = (1 - Math.sqrt(d2) / CONNECT) * 0.20;
                        ctx.beginPath();
                        ctx.strokeStyle = `rgba(${EM},${alpha.toFixed(3)})`;
                        ctx.lineWidth = 1.5;
                        ctx.moveTo(a.x, a.y);
                        ctx.lineTo(b.x, b.y);
                        ctx.stroke();
                    }
                }
            }

            // Draw particle dots
            for (const p of particles) {
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${EM},0.38)`;
                ctx.fill();
            }

            rafRef.current = requestAnimationFrame(loop);
        };

        loop();

        return () => {
            cancelAnimationFrame(rafRef.current);
            window.removeEventListener('resize', onResize);
        };
    }, []);

    return (
        <div className="flex flex-1 overflow-hidden" style={{ background: 'var(--z-950)' }}>

            {/* ── LEFT PANEL — Particle Network ───────────────────────────── */}
            <div
                className="relative hidden lg:flex flex-col justify-between overflow-hidden"
                style={{
                    width: '55%',
                    background: 'var(--z-950)',
                    borderRight: '1px solid var(--border)',
                }}
                onMouseMove={e => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
                }}
                onMouseLeave={() => { mouseRef.current = { x: -9999, y: -9999 }; }}
            >
                {/* Canvas engine — z-0, pointer-events-none */}
                <canvas
                    ref={canvasRef}
                    className="absolute inset-0 w-full h-full"
                    style={{ zIndex: 0, pointerEvents: 'none' }}
                />

                {/* Top logo — z-10, above canvas */}
                <div className="relative z-10 p-10 pointer-events-none animate-fade-in">
                    <div className="flex items-center gap-2.5">
                        <img
                            src="/brasao.png"
                            alt="Brasão de Mafra"
                            width="28"
                            height="24"
                            style={{ objectFit: 'contain' }}
                        />
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--z-400)', letterSpacing: '-0.01em' }}>
                            Atende Mafra
                        </span>
                    </div>
                </div>

                {/* Display headline — z-10, above canvas */}
                <div
                    className="relative z-10 px-10 pb-14 pointer-events-none animate-fade-in"
                    style={{ animationDelay: '50ms' }}
                >
                    <div
                        style={{
                            width: '36px',
                            height: '2px',
                            background: 'var(--em-500)',
                            borderRadius: '2px',
                            marginBottom: '20px',
                        }}
                    />
                    <h1
                        style={{
                            fontSize: 'clamp(56px, 5.8vw, 88px)',
                            fontWeight: 800,
                            lineHeight: 0.94,
                            letterSpacing: '-0.045em',
                            color: 'var(--z-100)',
                        }}
                    >
                        Atende
                        <br />
                        <span style={{ color: 'var(--em-500)' }}>Mafra</span>
                    </h1>
                    <p
                        style={{
                            fontSize: '13.5px',
                            color: 'var(--z-500)',
                            lineHeight: 1.65,
                            maxWidth: '320px',
                            marginTop: '20px',
                        }}
                    >
                        Plataforma de atendimento digital da Prefeitura Municipal de Mafra.
                    </p>
                </div>

                {/* Copyright — z-10, above canvas */}
                <div
                    className="relative z-10 px-10 py-5 pointer-events-none"
                    style={{ borderTop: '1px solid var(--border)' }}
                >
                    <p style={{ fontSize: '11px', color: 'var(--z-600)' }}>
                        © 2025 Prefeitura Municipal de Mafra · Desenvolvido pela Tecnologia da Informação
                    </p>
                </div>
            </div>

            {/* ── RIGHT PANEL — Form (unchanged) ──────────────────────────── */}
            <div
                className="flex flex-col items-center justify-center flex-1 px-8 py-12 animate-fade-in"
                style={{ animationDelay: '80ms' }}
            >
                {/* Mobile-only logo */}
                <div className="flex lg:hidden items-center gap-2.5 mb-10">
                    <img
                        src="/brasao.png"
                        alt="Brasão de Mafra"
                        width="32"
                        height="28"
                        style={{ objectFit: 'contain' }}
                    />
                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--z-200)' }}>
                        Atende Mafra
                    </span>
                </div>

                <div className="w-full" style={{ maxWidth: '360px' }}>

                    <div className="mb-8">
                        <h2
                            style={{
                                fontSize: '21px',
                                fontWeight: 700,
                                letterSpacing: '-0.025em',
                                color: 'var(--z-100)',
                                lineHeight: 1.2,
                            }}
                        >
                            Entrar na plataforma
                        </h2>
                        <p className="mt-1.5" style={{ fontSize: '13px', color: 'var(--z-500)' }}>
                            Use suas credenciais de acesso institucional.
                        </p>
                    </div>

                    {error && (
                        <div
                            className="flex items-center gap-2 px-3 py-2.5 mb-5 animate-fade-in"
                            style={{
                                background: 'rgba(239,68,68,0.10)',
                                border: '1px solid rgba(239,68,68,0.22)',
                                borderRadius: '8px',
                                fontSize: '13px',
                                color: '#fca5a5',
                            }}
                        >
                            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#ef4444' }} />
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="flex flex-col gap-4">

                        <div className="flex flex-col gap-1.5">
                            <label
                                htmlFor="login-email"
                                style={{
                                    fontSize: '10px',
                                    fontWeight: 700,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.07em',
                                    color: 'var(--z-500)',
                                }}
                            >
                                E-mail
                            </label>
                            <input
                                id="login-email"
                                type="email"
                                required
                                autoComplete="email"
                                autoFocus
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                placeholder="seu@email.com"
                                className="w-full h-10 px-3 outline-none transition-all duration-200 placeholder:text-[--z-600]"
                                style={{
                                    background: 'var(--z-900)',
                                    border: '1px solid var(--border-md)',
                                    borderRadius: '8px',
                                    fontSize: '13px',
                                    color: 'var(--z-100)',
                                }}
                                onFocus={e => {
                                    e.currentTarget.style.borderColor = 'rgba(16,185,129,0.40)';
                                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(16,185,129,0.08)';
                                }}
                                onBlur={e => {
                                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)';
                                    e.currentTarget.style.boxShadow = 'none';
                                }}
                            />
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <div className="flex justify-between items-center">
                                <label
                                    htmlFor="login-password"
                                    style={{
                                        fontSize: '10px',
                                        fontWeight: 700,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.07em',
                                        color: 'var(--z-500)',
                                    }}
                                >
                                    Senha
                                </label>
                                <Link
                                    to="/forgot-password"
                                    className="transition-colors duration-150"
                                    style={{ fontSize: '12px', color: 'var(--z-600)' }}
                                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--z-300)')}
                                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--z-600)')}
                                >
                                    Esqueceu?
                                </Link>
                            </div>
                            <div className="relative">
                                <input
                                    id="login-password"
                                    type={showPwd ? 'text' : 'password'}
                                    required
                                    autoComplete="current-password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full h-10 px-3 pr-10 outline-none transition-all duration-200 placeholder:text-[--z-600]"
                                    style={{
                                        background: 'var(--z-900)',
                                        border: '1px solid var(--border-md)',
                                        borderRadius: '8px',
                                        fontSize: '13px',
                                        color: 'var(--z-100)',
                                    }}
                                    onFocus={e => {
                                        e.currentTarget.style.borderColor = 'rgba(16,185,129,0.40)';
                                        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(16,185,129,0.08)';
                                    }}
                                    onBlur={e => {
                                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)';
                                        e.currentTarget.style.boxShadow = 'none';
                                    }}
                                />
                                <button
                                    type="button"
                                    tabIndex={-1}
                                    aria-label={showPwd ? 'Ocultar senha' : 'Exibir senha'}
                                    onClick={() => setShowPwd(!showPwd)}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center justify-center w-6 h-6 transition-colors duration-150"
                                    style={{ borderRadius: '6px', color: 'var(--z-500)' }}
                                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--z-300)')}
                                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--z-500)')}
                                >
                                    {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading || !email || !password}
                            className="relative w-full h-10 flex items-center justify-center font-semibold mt-1 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
                            style={{
                                background: 'var(--em-500)',
                                color: 'var(--z-950)',
                                borderRadius: '8px',
                                border: '1px solid var(--em-600)',
                                fontSize: '13px',
                                letterSpacing: '-0.01em',
                            }}
                            onMouseEnter={e => {
                                if (!(e.currentTarget as HTMLButtonElement).disabled) {
                                    e.currentTarget.style.background = 'var(--em-600)';
                                    e.currentTarget.style.transform = 'translateY(-1px)';
                                    e.currentTarget.style.boxShadow = '0 6px 20px rgba(16,185,129,0.28)';
                                }
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.background = 'var(--em-500)';
                                e.currentTarget.style.transform = '';
                                e.currentTarget.style.boxShadow = '';
                            }}
                        >
                            {isLoading ? <Loader2 size={15} className="animate-spin" /> : 'Entrar'}
                        </button>
                    </form>

                    <p className="lg:hidden text-center mt-8" style={{ fontSize: '11px', color: 'var(--z-600)' }}>
                        © 2025 Prefeitura Municipal de Mafra · Desenvolvido pela Tecnologia da Informação
                    </p>
                </div>
            </div>
        </div>
    );
}
