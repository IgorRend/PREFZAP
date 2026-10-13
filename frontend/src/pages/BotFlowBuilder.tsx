import { useCallback, useEffect, useState } from 'react';
import {
    ReactFlow,
    ReactFlowProvider,
    addEdge,
    useNodesState,
    useEdgesState,
    Controls,
    MiniMap,
    Background,
    BackgroundVariant,
    Connection,
    Node,
    Edge,
    MarkerType,
} from '@xyflow/react';
import api from '../services/api';
import BotNode from '../components/bot/BotNode';
import GlobalConfigSidebar from '../components/bot/GlobalConfigSidebar';
import NodeConfigSidebar from '../components/bot/NodeConfigSidebar';
import {
    Save, Plus, Power, PowerOff, Trash2, Settings, Globe,
    MessageSquare, ChevronDown, Loader2, Bot,
} from 'lucide-react';

const nodeTypes = { botStep: BotNode };

interface BotFlowData {
    id: string; name: string; isActive: boolean;
    nodes: any[]; edges: any[]; globalConfig: any;
}

const defaultGlobalConfig = {
    greetingMessage: '',
    invalidResponseMessage: 'Desculpe, não entendi. Tente novamente.',
    timeoutMinutes: 5,
    timeoutAction: 'close',
    timeoutTargetType: '',
    timeoutTargetId: '',
    maxRetries: 3,
    maxRetriesAction: 'route',
    maxRetriesTargetType: 'department',
    maxRetriesTargetId: '',
    autoDistribute: 'NONE',
};

export default function BotFlowBuilder() {
    return (
        <ReactFlowProvider>
            <BotFlowBuilderInner />
        </ReactFlowProvider>
    );
}

function BotFlowBuilderInner() {
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
    const [selectedNode, setSelectedNode] = useState<Node | null>(null);
    const [globalConfig, setGlobalConfig] = useState(defaultGlobalConfig);
    const [flows, setFlows] = useState<BotFlowData[]>([]);
    const [currentFlow, setCurrentFlow] = useState<BotFlowData | null>(null);
    const [flowName, setFlowName] = useState('Novo Fluxo');
    const [saving, setSaving] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showFlowDropdown, setShowFlowDropdown] = useState(false);
    const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

    const showToast = (msg: string, ok = true) => {
        setToast({ msg, ok });
        setTimeout(() => setToast(null), 3000);
    };

    useEffect(() => {
        api.get('/bot-flows').then(r => {
            setFlows(r.data);
            const active = r.data.find((f: BotFlowData) => f.isActive);
            if (active) loadFlow(active);
        }).catch(() => { });
    }, []);

    const loadFlow = (flow: BotFlowData) => {
        setCurrentFlow(flow);
        setFlowName(flow.name);
        setNodes(flow.nodes || []);
        setEdges(flow.edges || []);
        setGlobalConfig({ ...defaultGlobalConfig, ...(flow.globalConfig || {}) });
        setSelectedNode(null);
        setShowSettings(false);
    };

    const newFlow = () => {
        setCurrentFlow(null);
        setFlowName('Novo Fluxo');
        setNodes([]);
        setEdges([]);
        setGlobalConfig(defaultGlobalConfig);
        setSelectedNode(null);
        setShowSettings(false);
    };

    const onConnect = useCallback((params: Connection) => {
        setEdges(eds => addEdge({
            ...params,
            type: 'smoothstep',
            animated: true,
            style: { stroke: '#10b981', strokeWidth: 1.5 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#10b981' },
        }, eds));
    }, [setEdges]);

    const onNodeClick = useCallback((_: any, node: Node) => {
        setSelectedNode(node);
        setShowSettings(false);
    }, []);

    const onPaneClick = useCallback(() => setSelectedNode(null), []);

    const addNode = (nodeType: 'message' | 'httpRequest' = 'message') => {
        const id = `node-${Date.now()}`;
        const newNode: Node = {
            id,
            type: 'botStep',
            position: { x: 260 + Math.random() * 180, y: 100 + nodes.length * 130 },
            data: nodeType === 'httpRequest' ? {
                label: `HTTP ${nodes.length + 1}`,
                nodeType: 'httpRequest',
                httpMethod: 'GET',
                httpUrl: '',
                httpHeaders: '{}',
                httpBody: '',
                httpVariableMap: '{}',
                httpSuccessMessage: '',
                httpErrorMessage: 'Erro ao consultar serviço externo.',
            } : {
                label: `Etapa ${nodes.length + 1}`,
                message: '',
                conditions: [],
                isStart: nodes.length === 0,
            },
        };
        setNodes(nds => [...nds, newNode]);
    };

    const deleteSelectedNode = () => {
        if (!selectedNode) return;
        setNodes(nds => nds.filter(n => n.id !== selectedNode.id));
        setEdges(eds => eds.filter(e => e.source !== selectedNode.id && e.target !== selectedNode.id));
        setSelectedNode(null);
    };

    const updateNodeData = (nodeId: string, data: any) => {
        setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n));
        setSelectedNode(prev => prev?.id === nodeId ? { ...prev, data: { ...prev.data, ...data } } : prev);
    };

    const saveFlow = async () => {
        setSaving(true);
        try {
            const payload = { name: flowName, nodes, edges, globalConfig };
            if (currentFlow) {
                const { data } = await api.put(`/bot-flows/${currentFlow.id}`, payload);
                setCurrentFlow(data);
            } else {
                const { data } = await api.post('/bot-flows', payload);
                setCurrentFlow(data);
            }
            api.get('/bot-flows').then(r => setFlows(r.data));
            showToast('Fluxo salvo com sucesso!');
        } catch {
            showToast('Erro ao salvar fluxo', false);
        }
        setSaving(false);
    };

    const toggleActive = async () => {
        if (!currentFlow) return;
        try {
            const { data } = await api.put(`/bot-flows/${currentFlow.id}`, { isActive: !currentFlow.isActive });
            setCurrentFlow(data);
            api.get('/bot-flows').then(r => setFlows(r.data));
            showToast(data.isActive ? 'Fluxo ativado!' : 'Fluxo desativado!');
        } catch {
            showToast('Erro ao alterar status', false);
        }
    };

    /* ── Button helpers ──────────────────────────────────── */
    const BtnIcon = ({
        onClick, disabled, children, accent = false, danger = false, orange = false, title,
    }: {
        onClick: () => void; disabled?: boolean; children: React.ReactNode;
        accent?: boolean; danger?: boolean; orange?: boolean; title?: string;
    }) => (
        <button
            onClick={onClick}
            disabled={disabled}
            title={title}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 8,
                background: accent
                    ? 'rgba(16,185,129,0.12)'
                    : danger
                        ? 'rgba(239,68,68,0.1)'
                        : orange
                            ? 'rgba(249,115,22,0.1)'
                            : 'rgba(255,255,255,0.05)',
                border: `1px solid ${accent ? 'rgba(16,185,129,0.3)' : danger ? 'rgba(239,68,68,0.25)' : orange ? 'rgba(249,115,22,0.25)' : 'rgba(255,255,255,0.10)'}`,
                color: accent ? '#10b981' : danger ? '#fca5a5' : orange ? '#f97316' : '#a1a1aa',
                fontSize: 12.5,
                fontWeight: 600,
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.5 : 1,
                transition: 'all 0.15s',
                whiteSpace: 'nowrap',
                fontFamily: 'var(--font-sans)',
            }}
        >
            {children}
        </button>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--z-950)', overflow: 'hidden' }}>

            {/* ── Toolbar ───────────────────────────────────── */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 14px',
                    height: 52,
                    flexShrink: 0,
                    background: 'var(--z-925)',
                    borderBottom: '1px solid rgba(255,255,255,0.07)',
                    gap: 10,
                }}
            >
                {/* Left: name + status */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <div
                        style={{
                            width: 30,
                            height: 30,
                            borderRadius: 8,
                            background: 'rgba(16,185,129,0.12)',
                            border: '1px solid rgba(16,185,129,0.2)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#10b981',
                            flexShrink: 0,
                        }}
                    >
                        <Bot size={15} />
                    </div>
                    <input
                        value={flowName}
                        onChange={e => setFlowName(e.target.value)}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            outline: 'none',
                            fontSize: 14,
                            fontWeight: 700,
                            color: '#f4f4f5',
                            fontFamily: 'var(--font-sans)',
                            width: 180,
                        }}
                    />
                    {currentFlow && (
                        <span
                            style={{
                                fontSize: 10,
                                fontWeight: 700,
                                letterSpacing: '0.06em',
                                padding: '2px 8px',
                                borderRadius: 20,
                                background: currentFlow.isActive ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.06)',
                                border: `1px solid ${currentFlow.isActive ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.10)'}`,
                                color: currentFlow.isActive ? '#34d399' : '#52525b',
                                flexShrink: 0,
                            }}
                        >
                            {currentFlow.isActive ? 'ATIVO' : 'INATIVO'}
                        </span>
                    )}
                </div>

                {/* Right: actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    {/* Flow selector dropdown */}
                    <div style={{ position: 'relative' }}>
                        <button
                            onClick={() => setShowFlowDropdown(v => !v)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '6px 10px',
                                borderRadius: 8,
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.10)',
                                color: '#a1a1aa',
                                fontSize: 12.5,
                                fontWeight: 500,
                                cursor: 'pointer',
                                fontFamily: 'var(--font-sans)',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {currentFlow?.name || 'Selecionar fluxo'}
                            <ChevronDown size={13} />
                        </button>
                        {showFlowDropdown && (
                            <>
                                <div
                                    style={{ position: 'fixed', inset: 0, zIndex: 40 }}
                                    onClick={() => setShowFlowDropdown(false)}
                                />
                                <div
                                    style={{
                                        position: 'absolute',
                                        top: 'calc(100% + 6px)',
                                        right: 0,
                                        minWidth: 200,
                                        background: 'var(--z-850)',
                                        border: '1px solid rgba(255,255,255,0.10)',
                                        borderRadius: 10,
                                        boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
                                        zIndex: 50,
                                        overflow: 'hidden',
                                        padding: '4px',
                                    }}
                                >
                                    <button
                                        onClick={() => { newFlow(); setShowFlowDropdown(false); }}
                                        style={{
                                            width: '100%',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 8,
                                            padding: '8px 10px',
                                            borderRadius: 7,
                                            background: 'transparent',
                                            border: 'none',
                                            color: '#10b981',
                                            fontSize: 12.5,
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            fontFamily: 'var(--font-sans)',
                                        }}
                                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(16,185,129,0.08)')}
                                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                    >
                                        <Plus size={13} /> Novo Fluxo
                                    </button>
                                    {flows.length > 0 && (
                                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', margin: '4px 0' }} />
                                    )}
                                    {flows.map(f => (
                                        <button
                                            key={f.id}
                                            onClick={() => { loadFlow(f); setShowFlowDropdown(false); }}
                                            style={{
                                                width: '100%',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: 8,
                                                padding: '8px 10px',
                                                borderRadius: 7,
                                                background: currentFlow?.id === f.id ? 'rgba(255,255,255,0.05)' : 'transparent',
                                                border: 'none',
                                                color: currentFlow?.id === f.id ? '#f4f4f5' : '#a1a1aa',
                                                fontSize: 12.5,
                                                cursor: 'pointer',
                                                textAlign: 'left',
                                                fontFamily: 'var(--font-sans)',
                                            }}
                                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                                            onMouseLeave={e => (e.currentTarget.style.background = currentFlow?.id === f.id ? 'rgba(255,255,255,0.05)' : 'transparent')}
                                        >
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                                            {f.isActive && (
                                                <span style={{ fontSize: 9, fontWeight: 700, color: '#10b981', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 10, padding: '1px 6px', flexShrink: 0 }}>ATIVO</span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Divider */}
                    <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />

                    <BtnIcon onClick={() => { setShowSettings(s => !s); setSelectedNode(null); }} accent={showSettings}>
                        <Settings size={13} /> Config
                    </BtnIcon>

                    <BtnIcon onClick={() => addNode('message')}>
                        <MessageSquare size={13} /> Etapa
                    </BtnIcon>

                    <BtnIcon onClick={() => addNode('httpRequest')} orange>
                        <Globe size={13} /> HTTP
                    </BtnIcon>

                    {selectedNode && (
                        <BtnIcon onClick={deleteSelectedNode} danger title="Deletar etapa selecionada">
                            <Trash2 size={13} />
                        </BtnIcon>
                    )}

                    {currentFlow && (
                        <BtnIcon onClick={toggleActive} danger={currentFlow.isActive} accent={!currentFlow.isActive}>
                            {currentFlow.isActive
                                ? <><PowerOff size={13} /> Desativar</>
                                : <><Power size={13} /> Ativar</>
                            }
                        </BtnIcon>
                    )}

                    {/* Save */}
                    <button
                        onClick={saveFlow}
                        disabled={saving}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 7,
                            padding: '6px 14px',
                            borderRadius: 8,
                            background: saving ? 'var(--em-600)' : 'linear-gradient(135deg, var(--em-600), var(--em-500))',
                            border: 'none',
                            color: '#fff',
                            fontSize: 12.5,
                            fontWeight: 700,
                            cursor: saving ? 'not-allowed' : 'pointer',
                            opacity: saving ? 0.8 : 1,
                            boxShadow: saving ? 'none' : 'var(--shadow-em)',
                            transition: 'all 0.15s',
                            fontFamily: 'var(--font-sans)',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                        {saving ? 'Salvando...' : 'Salvar'}
                    </button>
                </div>
            </div>

            {/* ── Body ─────────────────────────────────────── */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

                {/* Canvas */}
                <div style={{ flex: 1, position: 'relative' }}>
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        onNodeClick={onNodeClick}
                        onPaneClick={onPaneClick}
                        nodeTypes={nodeTypes}
                        fitView
                        defaultEdgeOptions={{
                            type: 'smoothstep',
                            animated: true,
                            style: { stroke: '#10b981', strokeWidth: 1.5 },
                            markerEnd: { type: MarkerType.ArrowClosed, color: '#10b981' },
                        }}
                        style={{ background: 'var(--z-950)' }}
                    >
                        <Background
                            variant={BackgroundVariant.Dots}
                            gap={24}
                            size={1}
                            color="rgba(255,255,255,0.06)"
                        />
                        <Controls
                            style={{
                                background: 'var(--z-850)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: 10,
                                overflow: 'hidden',
                            }}
                        />
                        <MiniMap
                            nodeColor={n => (n.data as any)?.nodeType === 'httpRequest' ? '#f97316' : '#10b981'}
                            maskColor="rgba(9,9,11,0.7)"
                            style={{
                                background: 'var(--z-900)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: 10,
                            }}
                        />
                    </ReactFlow>

                    {/* Empty state */}
                    {nodes.length === 0 && (
                        <div
                            style={{
                                position: 'absolute',
                                inset: 0,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 16,
                                pointerEvents: 'none',
                            }}
                        >
                            <div
                                style={{
                                    width: 56,
                                    height: 56,
                                    borderRadius: 16,
                                    background: 'rgba(16,185,129,0.08)',
                                    border: '1px solid rgba(16,185,129,0.15)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#10b981',
                                }}
                            >
                                <Bot size={26} />
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#3f3f46' }}>Canvas vazio</p>
                                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#27272a' }}>
                                    Clique em <strong style={{ color: '#3f3f46' }}>Etapa</strong> ou <strong style={{ color: '#3f3f46' }}>HTTP</strong> na barra para adicionar um nó
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Sidebar */}
                <div
                    style={{
                        width: 340,
                        minWidth: 340,
                        borderLeft: '1px solid rgba(255,255,255,0.07)',
                        background: 'var(--z-925)',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                    }}
                >
                    {selectedNode && !showSettings ? (
                        <NodeConfigSidebar
                            node={selectedNode}
                            allNodes={nodes}
                            onUpdate={data => updateNodeData(selectedNode.id, data)}
                            onClose={() => setSelectedNode(null)}
                        />
                    ) : (
                        <GlobalConfigSidebar config={globalConfig} onChange={setGlobalConfig} />
                    )}
                </div>
            </div>

            {/* ── Toast ────────────────────────────────────── */}
            {toast && (
                <div
                    style={{
                        position: 'fixed',
                        bottom: 24,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 18px',
                        borderRadius: 10,
                        background: toast.ok ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                        border: `1px solid ${toast.ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                        backdropFilter: 'blur(16px)',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                        color: toast.ok ? '#34d399' : '#fca5a5',
                        fontSize: 13,
                        fontWeight: 600,
                        zIndex: 9999,
                        pointerEvents: 'none',
                        fontFamily: 'var(--font-sans)',
                        whiteSpace: 'nowrap',
                    }}
                >
                    <div
                        style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: toast.ok ? '#10b981' : '#ef4444',
                            flexShrink: 0,
                        }}
                    />
                    {toast.msg}
                </div>
            )}
        </div>
    );
}
