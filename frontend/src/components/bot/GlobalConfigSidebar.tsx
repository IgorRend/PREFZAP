import { useEffect, useState } from 'react';
import api from '../../services/api';
import { Settings, MessageSquare, Clock, AlertTriangle, Shuffle, ChevronDown } from 'lucide-react';

interface GlobalConfig {
    greetingMessage: string;
    invalidResponseMessage: string;
    timeoutMinutes: number;
    timeoutAction: string;
    timeoutTargetType: string;
    timeoutTargetId: string;
    maxRetries: number;
    maxRetriesAction: string;
    maxRetriesTargetType: string;
    maxRetriesTargetId: string;
    autoDistribute: string;
}

interface Props {
    config: GlobalConfig;
    onChange: (config: GlobalConfig) => void;
}

const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 8,
    padding: '8px 10px',
    fontSize: 12.5,
    color: '#f4f4f5',
    outline: 'none',
    fontFamily: 'var(--font-sans)',
    transition: 'border-color 0.15s',
    boxSizing: 'border-box',
};

const textareaStyle: React.CSSProperties = {
    ...inputStyle,
    resize: 'vertical',
    lineHeight: 1.55,
    minHeight: 72,
};

const selectWrapStyle: React.CSSProperties = {
    position: 'relative',
    width: '100%',
};

function Select({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
    return (
        <div style={selectWrapStyle}>
            <select
                value={value}
                onChange={e => onChange(e.target.value)}
                style={{
                    ...inputStyle,
                    appearance: 'none',
                    paddingRight: 28,
                    cursor: 'pointer',
                }}
            >
                {children}
            </select>
            <ChevronDown
                size={13}
                style={{
                    position: 'absolute',
                    right: 9,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#52525b',
                    pointerEvents: 'none',
                }}
            />
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#71717a', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                {label}
            </label>
            {children}
        </div>
    );
}

function Section({
    icon,
    title,
    desc,
    children,
}: {
    icon: React.ReactNode;
    title: string;
    desc: string;
    children: React.ReactNode;
}) {
    return (
        <div
            style={{
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                padding: '16px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
            }}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ color: '#10b981' }}>{icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#d4d4d8' }}>{title}</span>
                </div>
                <p style={{ margin: 0, fontSize: 11.5, color: '#52525b', lineHeight: 1.5 }}>{desc}</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {children}
            </div>
        </div>
    );
}

export default function GlobalConfigSidebar({ config, onChange }: Props) {
    const [departments, setDepartments] = useState<any[]>([]);
    const [users, setUsers] = useState<any[]>([]);

    useEffect(() => {
        api.get('/departments').then(r => setDepartments(r.data)).catch(() => { });
        api.get('/users').then(r => setUsers(r.data)).catch(() => { });
    }, []);

    const update = (key: string, value: any) => onChange({ ...config, [key]: value });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Header */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '14px 16px',
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                    flexShrink: 0,
                }}
            >
                <div
                    style={{
                        width: 32,
                        height: 32,
                        borderRadius: 9,
                        background: 'rgba(16,185,129,0.12)',
                        border: '1px solid rgba(16,185,129,0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#10b981',
                        flexShrink: 0,
                    }}
                >
                    <Settings size={15} />
                </div>
                <div>
                    <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: '#f4f4f5' }}>Configurações Globais</p>
                    <p style={{ margin: 0, fontSize: 11, color: '#52525b' }}>Comportamento padrão do bot</p>
                </div>
            </div>

            {/* Sections */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
                {/* Greeting */}
                <Section
                    icon={<MessageSquare size={14} />}
                    title="Mensagem de Saudação"
                    desc="Enviada quando o bot direcionar para fila ou usuário."
                >
                    <Field label="Mensagem">
                        <textarea
                            value={config.greetingMessage}
                            onChange={e => update('greetingMessage', e.target.value)}
                            placeholder="Ex: Em instantes um atendente irá lhe ajudar."
                            rows={3}
                            style={textareaStyle}
                            onFocus={e => (e.currentTarget.style.borderColor = 'rgba(16,185,129,0.4)')}
                            onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)')}
                        />
                    </Field>
                </Section>

                {/* Invalid Response */}
                <Section
                    icon={<AlertTriangle size={14} />}
                    title="Resposta Inválida"
                    desc="Quando o cliente envia algo fora das opções esperadas."
                >
                    <Field label="Mensagem">
                        <textarea
                            value={config.invalidResponseMessage}
                            onChange={e => update('invalidResponseMessage', e.target.value)}
                            placeholder="Ex: Desculpe, não entendi. Tente novamente."
                            rows={2}
                            style={textareaStyle}
                            onFocus={e => (e.currentTarget.style.borderColor = 'rgba(16,185,129,0.4)')}
                            onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)')}
                        />
                    </Field>
                </Section>

                {/* Timeout */}
                <Section
                    icon={<Clock size={14} />}
                    title="Ausência de Resposta"
                    desc="Ação tomada quando o cliente não responde no tempo configurado."
                >
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <Field label="Tempo (min)">
                            <input
                                type="number"
                                value={config.timeoutMinutes}
                                onChange={e => update('timeoutMinutes', parseInt(e.target.value))}
                                min={1}
                                style={inputStyle}
                                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(16,185,129,0.4)')}
                                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)')}
                            />
                        </Field>
                        <Field label="Ação">
                            <Select value={config.timeoutAction} onChange={v => update('timeoutAction', v)}>
                                <option value="close">Encerrar chat</option>
                                <option value="route">Encaminhar</option>
                            </Select>
                        </Field>
                    </div>
                    {config.timeoutAction === 'route' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            <Field label="Tipo">
                                <Select value={config.timeoutTargetType} onChange={v => update('timeoutTargetType', v)}>
                                    <option value="">Selecionar...</option>
                                    <option value="department">Fila (Setor)</option>
                                    <option value="user">Usuário</option>
                                </Select>
                            </Field>
                            <Field label="Destino">
                                <Select value={config.timeoutTargetId} onChange={v => update('timeoutTargetId', v)}>
                                    <option value="">Selecionar...</option>
                                    {config.timeoutTargetType === 'department' && departments.map(d => (
                                        <option key={d.id} value={d.id}>{d.name}</option>
                                    ))}
                                    {config.timeoutTargetType === 'user' && users.map(u => (
                                        <option key={u.id} value={u.id}>{u.name}</option>
                                    ))}
                                </Select>
                            </Field>
                        </div>
                    )}
                </Section>

                {/* Max Retries */}
                <Section
                    icon={<AlertTriangle size={14} />}
                    title="Máximo de Tentativas"
                    desc="Após exceder o limite de respostas inválidas, o bot encaminha para atendimento humano."
                >
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <Field label="Tentativas">
                            <input
                                type="number"
                                value={config.maxRetries}
                                onChange={e => update('maxRetries', parseInt(e.target.value))}
                                min={1}
                                max={10}
                                style={inputStyle}
                                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(16,185,129,0.4)')}
                                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)')}
                            />
                        </Field>
                        <Field label="Tipo de Destino">
                            <Select value={config.maxRetriesTargetType} onChange={v => update('maxRetriesTargetType', v)}>
                                <option value="department">Fila (Setor)</option>
                                <option value="user">Usuário</option>
                            </Select>
                        </Field>
                    </div>
                    <Field label="Destino de Transbordo">
                        <Select value={config.maxRetriesTargetId} onChange={v => update('maxRetriesTargetId', v)}>
                            <option value="">Selecionar...</option>
                            {config.maxRetriesTargetType === 'department' && departments.map(d => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                            {config.maxRetriesTargetType === 'user' && users.map(u => (
                                <option key={u.id} value={u.id}>{u.name}</option>
                            ))}
                        </Select>
                    </Field>
                </Section>

                {/* Auto Distribute */}
                <Section
                    icon={<Shuffle size={14} />}
                    title="Auto Distribuir Atendimento"
                    desc="Como os atendimentos serão distribuídos aos usuários da fila."
                >
                    <Field label="Modo">
                        <Select value={config.autoDistribute} onChange={v => update('autoDistribute', v)}>
                            <option value="NONE">Desativado</option>
                            <option value="BALANCE">Balancear</option>
                            <option value="RANDOM">Aleatória</option>
                        </Select>
                    </Field>
                    {config.autoDistribute !== 'NONE' && (
                        <p style={{ margin: 0, fontSize: 11.5, color: '#52525b', lineHeight: 1.5 }}>
                            {config.autoDistribute === 'BALANCE'
                                ? 'Escolhe o usuário com menos atendimentos ativos.'
                                : 'Escolhe um usuário de forma aleatória na fila.'}
                        </p>
                    )}
                </Section>
            </div>
        </div>
    );
}
