import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { Bot, MessageSquare, GitBranch, Globe, SquareMousePointer, List } from 'lucide-react';

interface BotNodeData {
    label?: string;
    message?: string;
    isStart?: boolean;
    conditions?: any[];
    nodeType?: 'message' | 'httpRequest';
    messageType?: 'text' | 'buttons' | 'list';
    httpMethod?: string;
    httpUrl?: string;
    buttons?: any[];
    listSections?: any[];
    [key: string]: unknown;
}

function parseButtons(raw: any): any[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return []; } }
    return [];
}

function parseListSections(raw: any): any[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return []; } }
    return [];
}

export default function BotNode({ data, selected }: NodeProps) {
    const d = data as BotNodeData;
    const conditionCount = d.conditions?.length || 0;
    const isHttp = d.nodeType === 'httpRequest';
    const msgType = d.messageType || 'text';
    const isButtons = msgType === 'buttons';
    const isList = msgType === 'list';

    const buttons = isButtons ? parseButtons(d.buttons) : [];
    const listSections = isList ? parseListSections(d.listSections) : [];
    const totalRows = listSections.reduce((acc: number, s: any) => acc + (s.rows?.length || 0), 0);

    const accentColor = isHttp ? '#f97316' : '#10b981';
    const accentAlpha = isHttp ? 'rgba(249,115,22,' : 'rgba(16,185,129,';

    const NodeIcon = isHttp ? Globe : d.isStart ? Bot : isButtons ? SquareMousePointer : isList ? List : MessageSquare;

    return (
        <div style={{
            minWidth: 210, maxWidth: 250, borderRadius: 12,
            background: selected ? 'rgba(22,22,24,0.98)' : 'rgba(17,17,19,0.95)',
            border: selected ? `1.5px solid ${accentAlpha}0.6)` : '1px solid rgba(255,255,255,0.10)',
            boxShadow: selected ? `0 0 0 3px ${accentAlpha}0.15), 0 8px 32px rgba(0,0,0,0.5)` : '0 4px 16px rgba(0,0,0,0.4)',
            backdropFilter: 'blur(16px)', transition: 'all 0.15s ease', fontFamily: 'var(--font-sans)',
        }}>
            <Handle type="target" position={Position.Top} style={{ background: accentColor, border: '2px solid rgba(0,0,0,0.5)', width: 10, height: 10 }} />

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px 8px', borderBottom: (conditionCount > 0 || d.message || d.httpUrl || isButtons || isList) ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                <div style={{
                    width: 26, height: 26, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    background: isHttp ? `${accentAlpha}0.15)` : d.isStart ? `${accentAlpha}0.2)` : `${accentAlpha}0.1)`,
                    border: `1px solid ${accentAlpha}0.25)`, color: accentColor,
                }}>
                    <NodeIcon size={13} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#f4f4f5', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.label || (isHttp ? 'HTTP Request' : 'Etapa')}
                </span>
                {d.isStart && !isHttp && (
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: '#10b981', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 4, padding: '2px 5px' }}>
                        INÍCIO
                    </span>
                )}
                {isHttp && (
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: '#f97316', background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.25)', borderRadius: 4, padding: '2px 5px' }}>
                        HTTP
                    </span>
                )}
                {isButtons && (
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: '#818cf8', background: 'rgba(129,140,248,0.12)', border: '1px solid rgba(129,140,248,0.25)', borderRadius: 4, padding: '2px 5px' }}>
                        BOTÕES
                    </span>
                )}
                {isList && (
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: '#fb923c', background: 'rgba(251,146,60,0.12)', border: '1px solid rgba(251,146,60,0.25)', borderRadius: 4, padding: '2px 5px' }}>
                        LISTA
                    </span>
                )}
            </div>

            {/* Body */}
            {(d.message || (isHttp && d.httpUrl) || conditionCount > 0 || isButtons || isList) && (
                <div style={{ padding: '8px 12px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {isHttp ? (
                        d.httpUrl && (
                            <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#f97316', background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.15)', borderRadius: 6, padding: '4px 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {(d.httpMethod || 'GET')} {d.httpUrl.length > 28 ? d.httpUrl.substring(0, 28) + '…' : d.httpUrl}
                            </div>
                        )
                    ) : (
                        d.message && (
                            <p style={{ fontSize: 11.5, color: '#a1a1aa', lineHeight: 1.5, margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                {d.message}
                            </p>
                        )
                    )}

                    {/* Button chips preview */}
                    {isButtons && buttons.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: d.message ? 2 : 0 }}>
                            {buttons.slice(0, 3).map((btn: any, i: number) => (
                                <span key={i} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: 'rgba(129,140,248,0.1)', border: '1px solid rgba(129,140,248,0.25)', color: '#818cf8', fontWeight: 500, maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {btn.text || btn.id || `btn ${i + 1}`}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* List rows count preview */}
                    {isList && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#fb923c', background: 'rgba(251,146,60,0.08)', border: '1px solid rgba(251,146,60,0.15)', borderRadius: 6, padding: '4px 8px' }}>
                            <List size={10} />
                            {listSections.length} seção(ões) · {totalRows} opção(ões)
                        </div>
                    )}

                    {conditionCount > 0 && !isHttp && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: (d.message || isButtons || isList) ? 0 : 0, fontSize: 11, color: '#34d399', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: 6, padding: '4px 8px' }}>
                            <GitBranch size={11} />
                            {conditionCount} condição{conditionCount !== 1 ? 'ões' : ''}
                        </div>
                    )}

                    {isHttp && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: d.httpUrl ? 4 : 0, fontSize: 10.5, color: '#71717a' }}>
                            <Globe size={10} /> Auto-avança após resposta
                        </div>
                    )}
                </div>
            )}

            <Handle type="source" position={Position.Bottom} style={{ background: accentColor, border: '2px solid rgba(0,0,0,0.5)', width: 10, height: 10 }} />
        </div>
    );
}
