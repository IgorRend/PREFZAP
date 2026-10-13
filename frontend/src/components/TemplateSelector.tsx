import { useState, useEffect } from 'react';
import api from '../services/api';
import { FileText, Send, ChevronDown } from 'lucide-react';

interface HsmTemplate {
    id: string;
    name: string;
    language: string;
    category?: string;
    components: any[];
    status: string;
}

interface TemplateSelectorProps {
    ticketId: string;
    onSent: () => void;
    onClose?: () => void;
}

export default function TemplateSelector({ ticketId, onSent, onClose }: TemplateSelectorProps) {
    const [templates, setTemplates] = useState<HsmTemplate[]>([]);
    const [selectedTemplate, setSelectedTemplate] = useState<HsmTemplate | null>(null);
    const [variables, setVariables] = useState<Record<string, string>>({});
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        loadTemplates();
    }, []);

    useEffect(() => {
        if (!onClose) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    const loadTemplates = async () => {
        try {
            const { data } = await api.get('/templates?status=APPROVED');
            setTemplates(data);
        } catch { }
    };

    const getVariables = (template: HsmTemplate): string[] => {
        const vars: string[] = [];
        for (const comp of template.components) {
            if (comp.type === 'BODY' && comp.text) {
                const matches = comp.text.match(/\{\{(\d+)\}\}/g);
                if (matches) {
                    for (const m of matches) {
                        vars.push(m.replace(/[{}]/g, ''));
                    }
                }
            }
        }
        return vars;
    };

    const getBodyPreview = (template: HsmTemplate): string => {
        for (const comp of template.components) {
            if (comp.type === 'BODY' && comp.text) return comp.text;
        }
        return template.name;
    };

    const handleSelect = (template: HsmTemplate) => {
        setSelectedTemplate(template);
        setVariables({});
        setError('');
    };

    const handleSend = async () => {
        if (!selectedTemplate) return;
        setSending(true);
        setError('');
        try {
            await api.post(`/messages/${ticketId}/template`, {
                templateName: selectedTemplate.name,
                variables,
            });
            setSelectedTemplate(null);
            setVariables({});
            onSent();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Erro ao enviar template');
        } finally {
            setSending(false);
        }
    };

    const templateVars = selectedTemplate ? getVariables(selectedTemplate) : [];

    return (
        <div className="template-selector">
            <div className="template-selector-header">
                <FileText size={16} color="var(--accent)" />
                <span>Selecione um Template HSM</span>
            </div>

            <div className="template-select-wrapper">
                <select
                    value={selectedTemplate?.id || ''}
                    onChange={e => {
                        const t = templates.find(t => t.id === e.target.value);
                        if (t) handleSelect(t);
                    }}
                >
                    <option value="">Escolha um template...</option>
                    {templates.map(t => (
                        <option key={t.id} value={t.id}>
                            {t.name} ({t.language}) {t.category ? `— ${t.category}` : ''}
                        </option>
                    ))}
                </select>
                <ChevronDown size={16} className="template-select-chevron" />
            </div>
            {templates.length === 0 && (
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '8px 0' }}>
                    Nenhum template aprovado disponível.
                </p>
            )}

            {selectedTemplate && (
                <div>
                    <div className="template-preview">
                        {getBodyPreview(selectedTemplate)}
                    </div>

                    {templateVars.length > 0 && (
                        <div className="template-variables">
                            <span className="template-variables-label">Variáveis:</span>
                            {templateVars.map(v => (
                                <input
                                    key={v}
                                    value={variables[v] || ''}
                                    onChange={e => setVariables({ ...variables, [v]: e.target.value })}
                                    placeholder={`Variável {{${v}}}`}
                                />
                            ))}
                        </div>
                    )}

                    {error && (
                        <div className="form-error-banner">{error}</div>
                    )}

                    <button
                        onClick={handleSend}
                        disabled={sending || (templateVars.length > 0 && !Object.values(variables).every(v => v.trim() !== ''))}
                        className="btn btn-primary"
                        style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            width: '100%', justifyContent: 'center',
                            opacity: (sending || (templateVars.length > 0 && !Object.values(variables).every(v => v.trim() !== ''))) ? 0.7 : 1,
                        }}
                    >
                        <Send size={14} />
                        {sending ? 'Enviando...' : 'Enviar Template'}
                    </button>
                </div>
            )}
        </div>
    );
}
