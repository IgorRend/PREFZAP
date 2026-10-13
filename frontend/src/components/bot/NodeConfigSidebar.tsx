import { useState, useEffect, useRef, KeyboardEvent, useMemo } from 'react';
import { Node } from '@xyflow/react';
import api from '../../services/api';
import {
    X, Plus, Trash2, MessageSquare, GitBranch, Star, Globe, Play,
    Loader2, ChevronDown, List, SquareMousePointer, Link2, Type,
} from 'lucide-react';

/* ── Types ─────────────────────────────────────────────── */
type MessageType = 'text' | 'buttons' | 'list';

interface ButtonDef {
    id: string;
    text: string;
    type?: 'quick_reply' | 'url';
    url?: string;
}

interface ListRow {
    id: string;
    title: string;
    description?: string;
}

interface ListSection {
    title: string;
    rows: ListRow[];
}

interface Condition {
    id: string;
    matchType: 'specific' | 'any' | 'mask';
    values: string;
    action: 'step' | 'department' | 'user' | 'flow';
    targetId: string;
}

interface Props {
    node: Node;
    allNodes: Node[];
    onUpdate: (data: any) => void;
    onClose: () => void;
}

/* ── Helpers ────────────────────────────────────────────── */
function parseButtons(raw: any): ButtonDef[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return []; } }
    return [];
}

function parseListSections(raw: any): ListSection[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return []; } }
    return [];
}

function slugify(text: string): string {
    return text.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 24) || `id_${Date.now()}`;
}

/* ── Shared style helpers ─────────────────────────────── */
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
    boxSizing: 'border-box' as const,
};

function SelectField({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
    return (
        <div style={{ position: 'relative', width: '100%' }}>
            <select
                value={value}
                onChange={e => onChange(e.target.value)}
                style={{ ...inputStyle, appearance: 'none', paddingRight: 28, cursor: 'pointer' }}
            >
                {children}
            </select>
            <ChevronDown size={13} style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', color: '#52525b', pointerEvents: 'none' }} />
        </div>
    );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#71717a', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                {label}
            </label>
            {children}
            {hint && <p style={{ margin: 0, fontSize: 10.5, color: '#52525b', lineHeight: 1.5 }}>{hint}</p>}
        </div>
    );
}

/* ── Tag Input ─────────────────────────────────────────── */
function TagInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const [inputValue, setInputValue] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const tags = value ? value.split(',').map(v => v.trim()).filter(Boolean) : [];

    const addTag = () => {
        const t = inputValue.trim();
        if (!t || tags.some(x => x.toLowerCase() === t.toLowerCase())) { setInputValue(''); return; }
        onChange([...tags, t].join(', '));
        setInputValue('');
    };

    const removeTag = (idx: number) => onChange(tags.filter((_, i) => i !== idx).join(', '));

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') { e.preventDefault(); addTag(); }
        if (e.key === 'Backspace' && !inputValue && tags.length > 0) removeTag(tags.length - 1);
    };

    return (
        <div
            onClick={() => inputRef.current?.focus()}
            style={{
                display: 'flex', flexWrap: 'wrap', gap: 5, padding: '6px 8px',
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)',
                borderRadius: 8, cursor: 'text', minHeight: 38, alignItems: 'center',
            }}
        >
            {tags.map((tag, idx) => (
                <span key={idx} style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)',
                    borderRadius: 5, padding: '2px 6px 2px 8px', fontSize: 11.5, color: '#34d399', fontWeight: 500,
                }}>
                    {tag}
                    <button onClick={e => { e.stopPropagation(); removeTag(idx); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#52525b', padding: 0, lineHeight: 1, fontSize: 14 }}>×</button>
                </span>
            ))}
            <input
                ref={inputRef} value={inputValue} onChange={e => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown} onBlur={addTag}
                placeholder={tags.length === 0 ? 'Digite e pressione Enter...' : ''}
                style={{ flex: 1, minWidth: 80, background: 'none', border: 'none', outline: 'none', fontSize: 12.5, color: '#f4f4f5', fontFamily: 'var(--font-sans)' }}
            />
        </div>
    );
}

/* ── Buttons Editor ────────────────────────────────────── */
function ButtonsEditor({ buttons, onChange }: { buttons: ButtonDef[]; onChange: (b: ButtonDef[]) => void }) {
    const addButton = () => {
        if (buttons.length >= 3) return;
        onChange([...buttons, { id: `btn_${buttons.length + 1}`, text: '', type: 'quick_reply' }]);
    };

    const updateBtn = (idx: number, patch: Partial<ButtonDef>) =>
        onChange(buttons.map((b, i) => i === idx ? { ...b, ...patch } : b));

    const removeBtn = (idx: number) => onChange(buttons.filter((_, i) => i !== idx));

    const autoId = (idx: number, text: string) => {
        const base = slugify(text);
        if (!base) return;
        const newId = buttons.some((b, i) => i !== idx && b.id === base) ? `${base}_${idx + 1}` : base;
        updateBtn(idx, { text, id: newId });
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {buttons.map((btn, idx) => (
                <div key={idx} style={{ borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', padding: '10px 10px 8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
                        <span style={{ fontSize: 10.5, fontWeight: 600, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Botão {idx + 1}</span>
                        <button onClick={() => removeBtn(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#52525b', padding: 2, display: 'flex', alignItems: 'center' }}
                            onMouseEnter={e => (e.currentTarget.style.color = '#fca5a5')}
                            onMouseLeave={e => (e.currentTarget.style.color = '#52525b')}>
                            <Trash2 size={12} />
                        </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <input
                            value={btn.text} placeholder="Texto do botão (ex: Falar com Vendas)"
                            onChange={e => autoId(idx, e.target.value)}
                            style={{ ...inputStyle }}
                            onFocus={e => (e.currentTarget.style.borderColor = 'rgba(16,185,129,0.4)')}
                            onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)')}
                        />
                        <div style={{ display: 'flex', gap: 6 }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ position: 'relative' }}>
                                    <select value={btn.type || 'quick_reply'} onChange={e => updateBtn(idx, { type: e.target.value as any })}
                                        style={{ ...inputStyle, appearance: 'none', paddingRight: 24, fontSize: 11.5 }}>
                                        <option value="quick_reply">Resposta Rápida</option>
                                        <option value="url">Abrir URL</option>
                                    </select>
                                    <ChevronDown size={11} style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', color: '#52525b', pointerEvents: 'none' }} />
                                </div>
                            </div>
                            <div style={{ flex: 2 }}>
                                <input
                                    value={btn.id} placeholder="ID (auto-gerado)"
                                    onChange={e => updateBtn(idx, { id: e.target.value.replace(/\s/g, '_').toLowerCase() })}
                                    style={{ ...inputStyle, fontSize: 11.5, fontFamily: 'monospace' }}
                                    onFocus={e => (e.currentTarget.style.borderColor = 'rgba(16,185,129,0.4)')}
                                    onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)')}
                                />
                            </div>
                        </div>
                        {btn.type === 'url' && (
                            <input
                                value={btn.url || ''} placeholder="https://..."
                                onChange={e => updateBtn(idx, { url: e.target.value })}
                                style={{ ...inputStyle }}
                                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(16,185,129,0.4)')}
                                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)')}
                            />
                        )}
                    </div>
                </div>
            ))}
            {buttons.length < 3 && (
                <button onClick={addButton} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    padding: '7px 12px', borderRadius: 8, background: 'rgba(16,185,129,0.07)',
                    border: '1px dashed rgba(16,185,129,0.25)', color: '#10b981', fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'var(--font-sans)', width: '100%',
                }}>
                    <Plus size={12} /> Adicionar Botão (máx. 3)
                </button>
            )}
            {buttons.length === 0 && (
                <p style={{ margin: 0, fontSize: 11, color: '#52525b', textAlign: 'center', paddingTop: 4 }}>
                    Clique em "Adicionar Botão" para começar
                </p>
            )}
        </div>
    );
}

/* ── List Sections Editor ──────────────────────────────── */
function ListEditor({
    sections, buttonText, onChangeSections, onChangeButtonText,
}: {
    sections: ListSection[];
    buttonText: string;
    onChangeSections: (s: ListSection[]) => void;
    onChangeButtonText: (t: string) => void;
}) {
    const addSection = () => onChangeSections([...sections, { title: `Seção ${sections.length + 1}`, rows: [] }]);
    const removeSection = (si: number) => onChangeSections(sections.filter((_, i) => i !== si));
    const updateSection = (si: number, patch: Partial<ListSection>) =>
        onChangeSections(sections.map((s, i) => i === si ? { ...s, ...patch } : s));

    const addRow = (si: number) => {
        const sec = sections[si];
        const newRow: ListRow = { id: `row_${sec.rows.length + 1}`, title: '', description: '' };
        updateSection(si, { rows: [...sec.rows, newRow] });
    };
    const removeRow = (si: number, ri: number) =>
        updateSection(si, { rows: sections[si].rows.filter((_, i) => i !== ri) });
    const updateRow = (si: number, ri: number, patch: Partial<ListRow>) =>
        updateSection(si, { rows: sections[si].rows.map((r, i) => i === ri ? { ...r, ...patch } : r) });

    const autoRowId = (si: number, ri: number, title: string) => {
        const base = slugify(title);
        if (!base) return;
        const existing = sections[si].rows.some((r, i) => i !== ri && r.id === base);
        updateRow(si, ri, { title, id: existing ? `${base}_${ri + 1}` : base });
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Field label="Texto do Botão da Lista">
                <input
                    value={buttonText} placeholder="Ex: Ver opções"
                    onChange={e => onChangeButtonText(e.target.value)}
                    style={inputStyle}
                    onFocus={e => (e.currentTarget.style.borderColor = 'rgba(16,185,129,0.4)')}
                    onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)')}
                />
            </Field>

            {sections.map((sec, si) => (
                <div key={si} style={{ borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                        <input
                            value={sec.title} placeholder="Título da seção"
                            onChange={e => updateSection(si, { title: e.target.value })}
                            style={{ ...inputStyle, flex: 1, padding: '5px 8px', fontSize: 12 }}
                            onFocus={e => (e.currentTarget.style.borderColor = 'rgba(16,185,129,0.4)')}
                            onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)')}
                        />
                        <button onClick={() => removeSection(si)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#52525b', padding: 2, display: 'flex', alignItems: 'center' }}
                            onMouseEnter={e => (e.currentTarget.style.color = '#fca5a5')}
                            onMouseLeave={e => (e.currentTarget.style.color = '#52525b')}>
                            <Trash2 size={12} />
                        </button>
                    </div>
                    <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {sec.rows.map((row, ri) => (
                            <div key={ri} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '7px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                    <input
                                        value={row.title} placeholder="Título da opção"
                                        onChange={e => autoRowId(si, ri, e.target.value)}
                                        style={{ ...inputStyle, flex: 2, padding: '5px 8px', fontSize: 12 }}
                                        onFocus={e => (e.currentTarget.style.borderColor = 'rgba(16,185,129,0.4)')}
                                        onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)')}
                                    />
                                    <input
                                        value={row.id} placeholder="ID"
                                        onChange={e => updateRow(si, ri, { id: e.target.value.replace(/\s/g, '_').toLowerCase() })}
                                        style={{ ...inputStyle, flex: 1, padding: '5px 8px', fontSize: 11, fontFamily: 'monospace' }}
                                        onFocus={e => (e.currentTarget.style.borderColor = 'rgba(16,185,129,0.4)')}
                                        onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)')}
                                    />
                                    <button onClick={() => removeRow(si, ri)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#52525b', padding: 2, display: 'flex', alignItems: 'center', flexShrink: 0 }}
                                        onMouseEnter={e => (e.currentTarget.style.color = '#fca5a5')}
                                        onMouseLeave={e => (e.currentTarget.style.color = '#52525b')}>
                                        <Trash2 size={11} />
                                    </button>
                                </div>
                                <input
                                    value={row.description || ''} placeholder="Descrição (opcional)"
                                    onChange={e => updateRow(si, ri, { description: e.target.value })}
                                    style={{ ...inputStyle, padding: '5px 8px', fontSize: 11.5, color: '#a1a1aa' }}
                                    onFocus={e => (e.currentTarget.style.borderColor = 'rgba(16,185,129,0.4)')}
                                    onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)')}
                                />
                            </div>
                        ))}
                        <button onClick={() => addRow(si)} style={{
                            display: 'flex', alignItems: 'center', gap: 5, padding: '5px 8px',
                            borderRadius: 6, background: 'transparent', border: '1px dashed rgba(255,255,255,0.12)',
                            color: '#71717a', fontSize: 11.5, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                        }}>
                            <Plus size={11} /> Adicionar opção
                        </button>
                    </div>
                </div>
            ))}

            <button onClick={addSection} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '7px 12px', borderRadius: 8, background: 'rgba(16,185,129,0.07)',
                border: '1px dashed rgba(16,185,129,0.25)', color: '#10b981', fontSize: 12,
                fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)', width: '100%',
            }}>
                <Plus size={12} /> Adicionar Seção
            </button>
        </div>
    );
}

/* ── HTTP Config Panel ─────────────────────────────────── */
function HttpNodeConfig({ node, onUpdate }: { node: Node; onUpdate: (data: any) => void }) {
    const d = node.data as any;
    const [testLoading, setTestLoading] = useState(false);
    const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

    const testRequest = async () => {
        setTestLoading(true); setTestResult(null);
        try {
            const resp = await fetch(d.httpUrl || '', {
                method: d.httpMethod || 'GET',
                headers: JSON.parse(d.httpHeaders || '{}'),
                body: ['POST', 'PUT', 'PATCH'].includes(d.httpMethod || 'GET') && d.httpBody ? d.httpBody : undefined,
            });
            const text = await resp.text();
            let pretty: string;
            try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch { pretty = text; }
            setTestResult({ ok: resp.ok, text: `${resp.status} ${resp.statusText}\n\n${pretty.substring(0, 600)}` });
        } catch (e: any) {
            setTestResult({ ok: false, text: e.message });
        }
        setTestLoading(false);
    };

    const TextArea = ({ label, field, placeholder, rows = 4 }: { label: string; field: string; placeholder: string; rows?: number }) => (
        <Field label={label}>
            <textarea
                value={d[field] || ''}
                onChange={e => onUpdate({ [field]: e.target.value })}
                placeholder={placeholder}
                rows={rows}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.5 }}
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(249,115,22,0.4)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)')}
            />
        </Field>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Método + URL">
                <div style={{ display: 'flex', gap: 6 }}>
                    <SelectField value={d.httpMethod || 'GET'} onChange={v => onUpdate({ httpMethod: v })}>
                        {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => <option key={m}>{m}</option>)}
                    </SelectField>
                    <input
                        value={d.httpUrl || ''}
                        onChange={e => onUpdate({ httpUrl: e.target.value })}
                        placeholder="https://api.exemplo.com/endpoint"
                        style={{ ...inputStyle, flex: 1 }}
                        onFocus={e => (e.currentTarget.style.borderColor = 'rgba(249,115,22,0.4)')}
                        onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)')}
                    />
                </div>
                <p style={{ margin: 0, fontSize: 11, color: '#52525b', lineHeight: 1.5 }}>
                    Use {'{{variavel}}'} para interpolar variáveis do contato.
                </p>
            </Field>

            <TextArea label="Headers (JSON)" field="httpHeaders" placeholder={'{"Authorization": "Bearer {{token}}"}'} />

            {['POST', 'PUT', 'PATCH'].includes(d.httpMethod || 'GET') && (
                <TextArea label="Body (JSON/texto)" field="httpBody" placeholder={'{"cpf": "{{cpf}}"}'} />
            )}

            <Field label="Mapeamento de Variáveis">
                <textarea
                    value={d.httpVariableMap || ''}
                    onChange={e => onUpdate({ httpVariableMap: e.target.value })}
                    placeholder={'{"nome_contato": "data.name",\n"saldo": "data.balance"}'}
                    rows={3}
                    style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.5 }}
                    onFocus={e => (e.currentTarget.style.borderColor = 'rgba(249,115,22,0.4)')}
                    onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)')}
                />
                <p style={{ margin: 0, fontSize: 11, color: '#52525b', lineHeight: 1.5 }}>
                    JSON: chave = variável do contato, valor = caminho no JSON da resposta.
                </p>
            </Field>

            <TextArea label="Mensagem de Sucesso" field="httpSuccessMessage" placeholder="Olá {{nome_contato}}, seu saldo é {{saldo}}." rows={3} />
            <TextArea label="Mensagem de Erro" field="httpErrorMessage" placeholder="Não consegui buscar seus dados. Tente novamente." rows={2} />

            <button
                onClick={testRequest}
                disabled={testLoading || !d.httpUrl}
                style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    padding: '8px 14px', borderRadius: 8,
                    background: testLoading ? 'rgba(249,115,22,0.08)' : 'rgba(249,115,22,0.1)',
                    border: '1px solid rgba(249,115,22,0.25)', color: '#f97316', fontSize: 12.5, fontWeight: 600,
                    cursor: testLoading || !d.httpUrl ? 'not-allowed' : 'pointer',
                    opacity: !d.httpUrl ? 0.5 : 1, transition: 'all 0.15s', fontFamily: 'var(--font-sans)',
                }}
            >
                {testLoading ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                {testLoading ? 'Testando...' : 'Testar Requisição'}
            </button>

            {testResult && (
                <pre style={{
                    margin: 0, padding: '10px 12px', borderRadius: 8,
                    background: testResult.ok ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                    border: `1px solid ${testResult.ok ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
                    fontSize: 11, color: testResult.ok ? '#34d399' : '#fca5a5',
                    fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                    lineHeight: 1.5, maxHeight: 240, overflowY: 'auto',
                }}>
                    {testResult.text}
                </pre>
            )}
        </div>
    );
}

/* ── Main component ────────────────────────────────────── */
export default function NodeConfigSidebar({ node, allNodes, onUpdate, onClose }: Props) {
    const isHttpNode = (node.data as any)?.nodeType === 'httpRequest';
    const [tab, setTab] = useState<'interactions' | 'conditions' | 'http'>(isHttpNode ? 'http' : 'interactions');
    const [departments, setDepartments] = useState<any[]>([]);
    const [users, setUsers] = useState<any[]>([]);

    // Reset to the correct default tab whenever the selected node changes.
    // Without this, switching from an HTTP node to a message node leaves the
    // tab stuck on 'http' and the interactions panel is never shown.
    useEffect(() => {
        setTab(isHttpNode ? 'http' : 'interactions');
    }, [node.id, isHttpNode]);

    useEffect(() => {
        api.get('/departments').then(r => setDepartments(r.data)).catch(() => {});
        api.get('/users').then(r => setUsers(r.data)).catch(() => {});
    }, []);

    const d = node.data as any;
    const conditions: Condition[] = (d?.conditions as Condition[]) || [];
    const otherNodes = allNodes.filter(n => n.id !== node.id);
    const isStart = !!(d?.isStart);

    /* ── Message type & interactive content ─────────────── */
    const messageType: MessageType = d?.messageType || 'text';
    const buttons: ButtonDef[] = useMemo(() => parseButtons(d?.buttons), [d?.buttons]);
    const listSections: ListSection[] = useMemo(() => parseListSections(d?.listSections), [d?.listSections]);
    const buttonText: string = d?.buttonText || 'Ver opções';

    /* ── Derived available options for guided conditions ─── */
    const availableOptions = useMemo((): Array<{ value: string; label: string }> => {
        if (messageType === 'buttons') {
            return buttons.filter(b => b.id && b.text).map(b => ({ value: b.id, label: `${b.text} (${b.id})` }));
        }
        if (messageType === 'list') {
            return listSections.flatMap(s =>
                s.rows.filter(r => r.id && r.title).map(r => ({ value: r.id, label: `${r.title} (${r.id})` }))
            );
        }
        return [];
    }, [messageType, buttons, listSections]);

    const isInteractive = messageType === 'buttons' || messageType === 'list';

    /* ── Condition helpers ──────────────────────────────── */
    const addCondition = () => {
        onUpdate({
            conditions: [...conditions, {
                id: `cond-${Date.now()}`,
                matchType: isInteractive ? 'specific' : 'specific',
                values: '',
                action: 'step',
                targetId: '',
            }],
        });
    };

    const updateCondition = (condId: string, updates: Partial<Condition>) =>
        onUpdate({ conditions: conditions.map(c => c.id === condId ? { ...c, ...updates } : c) });

    const removeCondition = (condId: string) =>
        onUpdate({ conditions: conditions.filter(c => c.id !== condId) });

    /* ── Tab style ──────────────────────────────────────── */
    const tabStyle = (active: boolean, color = 'em'): React.CSSProperties => ({
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        padding: '8px 10px', background: active ? (color === 'http' ? 'rgba(249,115,22,0.12)' : 'rgba(16,185,129,0.1)') : 'transparent',
        border: 'none', borderBottom: active ? `2px solid ${color === 'http' ? '#f97316' : '#10b981'}` : '2px solid transparent',
        color: active ? (color === 'http' ? '#f97316' : '#10b981') : '#52525b',
        fontSize: 12, fontWeight: active ? 600 : 500, cursor: 'pointer', transition: 'all 0.15s',
        fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap',
    });

    /* ── Message type tab UI ────────────────────────────── */
    const msgTypeIcons: Record<MessageType, React.ReactNode> = {
        text: <Type size={11} />, buttons: <SquareMousePointer size={11} />, list: <List size={11} />,
    };
    const msgTypeLabels: Record<MessageType, string> = { text: 'Texto', buttons: 'Botões', list: 'Lista' };

    const handleMsgTypeChange = (t: MessageType) => {
        const patch: any = { messageType: t };
        // Always initialise the target type's data structure so the editor
        // shows an empty state rather than leftover data from a previous type.
        if (t === 'buttons') patch.buttons = buttons.length ? buttons : [];
        if (t === 'list') patch.listSections = listSections.length ? listSections : [{ title: 'Opções', rows: [] }];
        // Clear the other type's data so it doesn't silently persist in the node
        if (t !== 'buttons') patch.buttons = [];
        if (t !== 'list') patch.listSections = [];
        onUpdate(patch);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
                <input
                    value={(d?.label as string) || ''} onChange={e => onUpdate({ label: e.target.value })}
                    placeholder="Nome da etapa"
                    style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 14, fontWeight: 700, color: '#f4f4f5', fontFamily: 'var(--font-sans)' }}
                />
                {!isHttpNode && (
                    <button onClick={() => onUpdate({ isStart: !isStart })} title={isStart ? 'Remover como início' : 'Definir como início'}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 7, background: isStart ? 'rgba(16,185,129,0.15)' : 'transparent', border: isStart ? '1px solid rgba(16,185,129,0.3)' : '1px solid transparent', color: isStart ? '#10b981' : '#52525b', cursor: 'pointer', transition: 'all 0.15s' }}>
                        <Star size={14} fill={isStart ? '#10b981' : 'none'} />
                    </button>
                )}
                <button onClick={onClose}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 7, background: 'transparent', border: 'none', color: '#52525b', cursor: 'pointer', transition: 'color 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#f4f4f5')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#52525b')}>
                    <X size={15} />
                </button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
                {isHttpNode ? (
                    <button style={tabStyle(true, 'http')} onClick={() => setTab('http')}>
                        <Globe size={13} /> Requisição HTTP
                    </button>
                ) : (
                    <>
                        <button style={tabStyle(tab === 'interactions')} onClick={() => setTab('interactions')}>
                            <MessageSquare size={13} /> Interações
                        </button>
                        <button style={tabStyle(tab === 'conditions')} onClick={() => setTab('conditions')}>
                            <GitBranch size={13} /> Condições
                            {conditions.length > 0 && (
                                <span style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.25)', color: '#34d399', borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '0 5px', lineHeight: '16px' }}>
                                    {conditions.length}
                                </span>
                            )}
                        </button>
                    </>
                )}
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* ── HTTP tab ── */}
                {tab === 'http' && <HttpNodeConfig node={node} onUpdate={onUpdate} />}

                {/* ── Interactions tab ── */}
                {tab === 'interactions' && (
                    <>
                        {/* Message Type Selector */}
                        <Field label="Tipo de Mensagem">
                            <div style={{ display: 'flex', gap: 5 }}>
                                {(['text', 'buttons', 'list'] as MessageType[]).map(t => (
                                    <button key={t} onClick={() => handleMsgTypeChange(t)} style={{
                                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                                        padding: '7px 6px', borderRadius: 7, fontSize: 11.5, fontWeight: 600,
                                        fontFamily: 'var(--font-sans)', cursor: 'pointer', transition: 'all 0.15s',
                                        background: messageType === t ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.03)',
                                        border: messageType === t ? '1px solid rgba(16,185,129,0.35)' : '1px solid rgba(255,255,255,0.08)',
                                        color: messageType === t ? '#10b981' : '#71717a',
                                    }}>
                                        {msgTypeIcons[t]} {msgTypeLabels[t]}
                                    </button>
                                ))}
                            </div>
                        </Field>

                        {/* Body / Message field (common to all types) */}
                        <Field
                            label={messageType === 'text' ? 'Mensagem do Bot' : messageType === 'buttons' ? 'Corpo da Mensagem' : 'Corpo da Lista'}
                            hint={messageType === 'text' ? 'O bot enviará esta mensagem e aguardará a resposta.' : 'Texto principal exibido acima dos botões/lista.'}
                        >
                            <textarea
                                value={d?.message || ''}
                                onChange={e => onUpdate({ message: e.target.value })}
                                placeholder={
                                    messageType === 'text' ? 'Digite a mensagem que o bot enviará...'
                                    : messageType === 'buttons' ? 'Ex: Escolha uma das opções abaixo:'
                                    : 'Ex: Como podemos te ajudar hoje?'
                                }
                                rows={messageType === 'text' ? 9 : 4}
                                style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
                                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(16,185,129,0.4)')}
                                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)')}
                            />
                        </Field>

                        {/* Optional Title & Footer for buttons/list */}
                        {isInteractive && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                <Field label="Título (opcional)">
                                    <input
                                        value={d?.title || ''}
                                        onChange={e => onUpdate({ title: e.target.value })}
                                        placeholder="Cabeçalho"
                                        style={{ ...inputStyle }}
                                        onFocus={e => (e.currentTarget.style.borderColor = 'rgba(16,185,129,0.4)')}
                                        onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)')}
                                    />
                                </Field>
                                <Field label="Rodapé (opcional)">
                                    <input
                                        value={d?.footer || ''}
                                        onChange={e => onUpdate({ footer: e.target.value })}
                                        placeholder="Texto de rodapé"
                                        style={{ ...inputStyle }}
                                        onFocus={e => (e.currentTarget.style.borderColor = 'rgba(16,185,129,0.4)')}
                                        onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)')}
                                    />
                                </Field>
                            </div>
                        )}

                        {/* Buttons editor */}
                        {messageType === 'buttons' && (
                            <>
                                <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />
                                <Field label="Botões Interativos" hint="Máximo de 3 botões. O ID é usado para identificar qual botão o cliente clicou nas condições.">
                                    <ButtonsEditor
                                        buttons={buttons}
                                        onChange={b => onUpdate({ buttons: b })}
                                    />
                                </Field>
                            </>
                        )}

                        {/* List editor */}
                        {messageType === 'list' && (
                            <>
                                <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />
                                <Field label="Seções e Opções" hint="Cada opção tem um ID usado para identificar a escolha do cliente nas condições.">
                                    <ListEditor
                                        sections={listSections}
                                        buttonText={buttonText}
                                        onChangeSections={s => onUpdate({ listSections: s })}
                                        onChangeButtonText={t => onUpdate({ buttonText: t })}
                                    />
                                </Field>
                            </>
                        )}

                        {/* Link preview option for text type */}
                        {messageType === 'text' && (
                            <Field label="URL para Preview (opcional)">
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                    <Link2 size={13} style={{ color: '#52525b', flexShrink: 0 }} />
                                    <input
                                        value={d?.linkPreviewUrl || ''}
                                        onChange={e => onUpdate({ linkPreviewUrl: e.target.value })}
                                        placeholder="https://... (exibe preview de link)"
                                        style={{ ...inputStyle }}
                                        onFocus={e => (e.currentTarget.style.borderColor = 'rgba(16,185,129,0.4)')}
                                        onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)')}
                                    />
                                </div>
                            </Field>
                        )}
                    </>
                )}

                {/* ── Conditions tab ── */}
                {tab === 'conditions' && (
                    <>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#d4d4d8' }}>Regras de Roteamento</span>
                            <button onClick={addCondition} style={{
                                display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 7,
                                background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', color: '#10b981',
                                fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                            }}>
                                <Plus size={12} /> Condição
                            </button>
                        </div>

                        {/* Guidance banner for interactive nodes */}
                        {isInteractive && availableOptions.length > 0 && (
                            <div style={{
                                display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 11px',
                                borderRadius: 8, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)',
                            }}>
                                <GitBranch size={13} style={{ color: '#10b981', marginTop: 1, flexShrink: 0 }} />
                                <p style={{ margin: 0, fontSize: 11.5, color: '#52525b', lineHeight: 1.5 }}>
                                    Este nó tem <strong style={{ color: '#a1a1aa' }}>{availableOptions.length} {messageType === 'buttons' ? 'botão(ões)' : 'opção(ões)'}</strong> configurados.
                                    Em condições do tipo <strong style={{ color: '#a1a1aa' }}>Resposta Específica</strong>, selecione o botão/opção pelo dropdown.
                                </p>
                            </div>
                        )}

                        {conditions.length === 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '40px 20px', color: '#3f3f46', textAlign: 'center' }}>
                                <GitBranch size={28} />
                                <p style={{ margin: 0, fontSize: 12.5, color: '#52525b', lineHeight: 1.5 }}>
                                    Sem condições. Adicione regras para definir como o fluxo avança.
                                </p>
                            </div>
                        )}

                        {conditions.map((cond, idx) => (
                            <div key={cond.id} style={{ borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', overflow: 'hidden' }}>
                                {/* Condition header */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                                    <span style={{ fontSize: 11.5, fontWeight: 600, color: '#71717a' }}>Condição {idx + 1}</span>
                                    <button onClick={() => removeCondition(cond.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 6, background: 'transparent', border: 'none', color: '#52525b', cursor: 'pointer', transition: 'all 0.15s' }}
                                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.12)'; e.currentTarget.style.color = '#fca5a5'; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#52525b'; }}>
                                        <Trash2 size={12} />
                                    </button>
                                </div>

                                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    <Field label="Tipo de Match">
                                        <SelectField value={cond.matchType} onChange={v => updateCondition(cond.id, { matchType: v as any })}>
                                            <option value="specific">Resposta Específica</option>
                                            <option value="any">Qualquer Resposta</option>
                                            <option value="mask">Máscara (Regex)</option>
                                        </SelectField>
                                    </Field>

                                    {cond.matchType !== 'any' && (
                                        <Field label={cond.matchType === 'specific' ? (isInteractive ? 'Botão / Opção que dispara' : 'Valores Esperados') : 'Expressão Regular'}>
                                            {/* Guided dropdown for interactive nodes */}
                                            {cond.matchType === 'specific' && isInteractive && availableOptions.length > 0 ? (
                                                <SelectField value={cond.values} onChange={v => updateCondition(cond.id, { values: v })}>
                                                    <option value="">Selecione o botão/opção...</option>
                                                    {availableOptions.map(opt => (
                                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                    ))}
                                                </SelectField>
                                            ) : cond.matchType === 'specific' ? (
                                                <TagInput value={cond.values} onChange={v => updateCondition(cond.id, { values: v })} />
                                            ) : (
                                                <input
                                                    value={cond.values}
                                                    onChange={e => updateCondition(cond.id, { values: e.target.value })}
                                                    placeholder="Ex: ^\d{3}\.\d{3}\.\d{3}-\d{2}$"
                                                    style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 12 }}
                                                    onFocus={e => (e.currentTarget.style.borderColor = 'rgba(16,185,129,0.4)')}
                                                    onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)')}
                                                />
                                            )}
                                        </Field>
                                    )}

                                    <Field label="Ação de Roteamento">
                                        <SelectField value={cond.action} onChange={v => updateCondition(cond.id, { action: v as any, targetId: '' })}>
                                            <option value="step">Outra Etapa</option>
                                            <option value="department">Fila (Setor)</option>
                                            <option value="user">Usuário</option>
                                            <option value="flow">Outro Fluxo</option>
                                        </SelectField>
                                    </Field>

                                    <Field label="Destino">
                                        <SelectField value={cond.targetId} onChange={v => updateCondition(cond.id, { targetId: v })}>
                                            <option value="">Selecionar...</option>
                                            {cond.action === 'step' && otherNodes.map(n => (
                                                <option key={n.id} value={n.id}>{((n.data as any)?.label as string) || n.id}</option>
                                            ))}
                                            {cond.action === 'department' && departments.map(d => (
                                                <option key={d.id} value={d.id}>{d.name}</option>
                                            ))}
                                            {cond.action === 'user' && users.map(u => (
                                                <option key={u.id} value={u.id}>{u.name}</option>
                                            ))}
                                            {cond.action === 'flow' && (
                                                <option value="future" disabled>Em desenvolvimento</option>
                                            )}
                                        </SelectField>
                                    </Field>
                                </div>
                            </div>
                        ))}
                    </>
                )}
            </div>
        </div>
    );
}
