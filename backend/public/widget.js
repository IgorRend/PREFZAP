/**
 * OmniWidget SDK v1.0
 *
 * Usage on client website:
 *   <script>
 *     window.OmniWidgetConfig = {
 *       token: 'YOUR_WIDGET_TOKEN',
 *       serverUrl: 'https://YOUR_BACKEND_URL',
 *     };
 *   </script>
 *   <script src="https://YOUR_BACKEND_URL/widget.js" defer></script>
 *
 * This script is served as a static file from the backend (backend/public/widget.js).
 */
(function () {
    'use strict';

    const cfg = window.OmniWidgetConfig || {};
    const TOKEN = cfg.token;
    const SERVER_URL = (cfg.serverUrl || '').replace(/\/$/, '');
    const VISITOR_KEY = 'omni_visitor_id';

    if (!TOKEN || !SERVER_URL) {
        console.warn('[OmniWidget] Missing token or serverUrl in OmniWidgetConfig');
        return;
    }

    // ─── State ───────────────────────────────────────────
    let socket = null;
    let sessionId = null;
    let ticketId = null;
    let widgetConfig = {};
    let isOpen = false;
    let messages = [];
    let isConnected = false;
    let isTyping = false;
    let typingTimer = null;

    // Persistent visitor ID (UUID stored in localStorage)
    function getOrCreateVisitorId() {
        let id = localStorage.getItem(VISITOR_KEY);
        if (!id) {
            id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now();
            localStorage.setItem(VISITOR_KEY, id);
        }
        return id;
    }
    const VISITOR_ID = getOrCreateVisitorId();

    // ─── Styles ────────────────────────────────────────────
    const ACCENT = cfg.primaryColor || '#6366f1';
    const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

    function injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
        #omni-widget-root * { box-sizing: border-box; font-family: ${FONT}; }
        #omni-widget-fab {
            position: fixed; bottom: 24px; right: 24px; z-index: 99999;
            width: 56px; height: 56px; border-radius: 50%; border: none; cursor: pointer;
            background: ${ACCENT}; color: #fff;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            display: flex; align-items: center; justify-content: center;
            font-size: 24px; transition: transform 0.2s, box-shadow 0.2s;
        }
        #omni-widget-fab:hover { transform: scale(1.1); box-shadow: 0 6px 26px rgba(0,0,0,0.4); }
        #omni-widget-badge {
            position: absolute; top: -4px; right: -4px;
            background: #ea4335; color: #fff; border-radius: 50%;
            width: 18px; height: 18px; font-size: 11px; font-weight: 700;
            display: flex; align-items: center; justify-content: center; display: none;
        }
        #omni-widget-panel {
            position: fixed; bottom: 92px; right: 24px; z-index: 99998;
            width: 360px; max-width: calc(100vw - 48px);
            height: 520px; max-height: calc(100vh - 120px);
            border-radius: 16px; overflow: hidden;
            box-shadow: 0 12px 48px rgba(0,0,0,0.22);
            display: flex; flex-direction: column;
            background: #fff; border: 1px solid #e5e7eb;
            transform: scale(0.95) translateY(10px); opacity: 0;
            transition: transform 0.25s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s;
            pointer-events: none;
        }
        #omni-widget-panel.open {
            transform: scale(1) translateY(0); opacity: 1; pointer-events: all;
        }
        #omni-widget-header {
            background: ${ACCENT}; color: #fff;
            padding: 14px 16px; display: flex; align-items: center; gap: 10px;
        }
        #omni-widget-header .avatar {
            width: 36px; height: 36px; border-radius: 50%;
            background: rgba(255,255,255,0.25); display: flex; align-items: center; justify-content: center;
            font-size: 18px; font-weight: 700; flex-shrink: 0;
        }
        #omni-widget-header .info { flex: 1; }
        #omni-widget-header .agent-name { font-weight: 700; font-size: 14px; }
        #omni-widget-header .status { font-size: 11px; opacity: 0.85; display: flex; align-items: center; gap: 4px; }
        #omni-widget-header .status-dot {
            width: 7px; height: 7px; border-radius: 50%; background: #4ade80;
        }
        #omni-widget-close {
            background: none; border: none; color: #fff; cursor: pointer; opacity: 0.8; font-size: 20px; line-height: 1; padding: 4px;
        }
        #omni-widget-messages {
            flex: 1; overflow-y: auto; padding: 14px;
            display: flex; flex-direction: column; gap: 8px; background: #f9fafb;
        }
        .omni-msg {
            max-width: 78%; padding: 9px 13px; border-radius: 12px;
            font-size: 13.5px; line-height: 1.45; word-break: break-word;
            animation: omniSlideIn 0.18s ease;
        }
        @keyframes omniSlideIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .omni-msg.incoming { background: #fff; border: 1px solid #e5e7eb; align-self: flex-start; border-radius: 4px 12px 12px 12px; }
        .omni-msg.outgoing { background: ${ACCENT}; color: #fff; align-self: flex-end; border-radius: 12px 12px 4px 12px; }
        .omni-msg.system { align-self: center; font-size: 11px; color: #9ca3af; background: none; padding: 2px 8px; font-style: italic; }
        .omni-msg-meta { font-size: 10px; margin-top: 3px; opacity: 0.6; text-align: right; }
        .omni-typing {
            display: flex; align-items: center; gap: 4px; padding: 8px 12px;
            background: #fff; border: 1px solid #e5e7eb;
            border-radius: 4px 12px 12px 12px; align-self: flex-start;
            font-size: 12px; color: #6b7280;
        }
        .omni-typing span { animation: omniDot 1.2s infinite; }
        .omni-typing span:nth-child(2) { animation-delay: 0.2s; }
        .omni-typing span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes omniDot { 0%,80%,100% { transform: scale(1); } 40% { transform: scale(1.5); } }
        #omni-widget-input-row {
            padding: 10px 12px; border-top: 1px solid #e5e7eb; display: flex; gap: 8px;
            align-items: flex-end; background: #fff;
        }
        #omni-widget-input {
            flex: 1; border: 1px solid #e5e7eb; border-radius: 20px;
            padding: 9px 14px; font-size: 13px; outline: none; resize: none;
            max-height: 80px; overflow-y: auto; font-family: ${FONT};
            line-height: 1.4; color: #111827; background: #f9fafb;
            transition: border-color 0.15s;
        }
        #omni-widget-input:focus { border-color: ${ACCENT}; background: #fff; }
        #omni-widget-input::placeholder { color: #9ca3af; }
        #omni-widget-send {
            width: 38px; height: 38px; border-radius: 50%; border: none; cursor: pointer;
            background: ${ACCENT}; color: #fff; display: flex; align-items: center;
            justify-content: center; font-size: 18px; flex-shrink: 0;
            transition: opacity 0.15s; opacity: 0.4;
        }
        #omni-widget-send.active { opacity: 1; }
        #omni-widget-footer {
            padding: 4px 12px 8px; background: #fff;
            font-size: 10px; color: #d1d5db; text-align: center; letter-spacing: 0.3px;
        }
        `;
        document.head.appendChild(style);
    }

    // ─── DOM ───────────────────────────────────────────────
    function buildWidget() {
        const root = document.createElement('div');
        root.id = 'omni-widget-root';

        root.innerHTML = `
        <div id="omni-widget-fab" title="Chat com a gente">
            <div id="omni-widget-badge">0</div>
            <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
        </div>
        <div id="omni-widget-panel">
            <div id="omni-widget-header">
                <div class="avatar">🤝</div>
                <div class="info">
                    <div class="agent-name" id="omni-agent-name">Atendimento</div>
                    <div class="status"><div class="status-dot"></div> Online agora</div>
                </div>
                <button id="omni-widget-close">✕</button>
            </div>
            <div id="omni-widget-messages"></div>
            <div id="omni-widget-input-row">
                <textarea id="omni-widget-input" rows="1" placeholder="Digite uma mensagem..."></textarea>
                <button id="omni-widget-send">
                    <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                        <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                    </svg>
                </button>
            </div>
            <div id="omni-widget-footer">Powered by OmniAtend</div>
        </div>
        `;

        document.body.appendChild(root);

        const fab = document.getElementById('omni-widget-fab');
        const panel = document.getElementById('omni-widget-panel');
        const closeBtn = document.getElementById('omni-widget-close');
        const input = document.getElementById('omni-widget-input');
        const sendBtn = document.getElementById('omni-widget-send');

        fab.addEventListener('click', togglePanel);
        closeBtn.addEventListener('click', () => setOpen(false));

        input.addEventListener('input', () => {
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 80) + 'px';
            sendBtn.classList.toggle('active', !!input.value.trim());
            // Typing indicator
            if (socket && isConnected) {
                socket.emit('widget:typing');
                clearTimeout(typingTimer);
                typingTimer = setTimeout(() => socket.emit('widget:stop-typing'), 2000);
            }
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
        });

        sendBtn.addEventListener('click', doSend);
    }

    function setOpen(open) {
        isOpen = open;
        const panel = document.getElementById('omni-widget-panel');
        panel.classList.toggle('open', open);
        if (open) {
            clearBadge();
            document.getElementById('omni-widget-input')?.focus();
            scrollBottom();
        }
    }

    function togglePanel() { setOpen(!isOpen); }

    // ─── Messages DOM ──────────────────────────────────────
    function renderMessage(msg) {
        const isOutgoing = msg.origin === 'CONTACT';
        const isSystem = msg.origin === 'SYSTEM';
        const el = document.createElement('div');
        el.className = 'omni-msg ' + (isSystem ? 'system' : isOutgoing ? 'outgoing' : 'incoming');
        const time = new Date(msg.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        el.innerHTML = `${escHtml(msg.body || '')}${isSystem ? '' : `<div class="omni-msg-meta">${time}</div>`}`;
        el.dataset.id = msg.id;
        return el;
    }

    function appendMessage(msg) {
        const container = document.getElementById('omni-widget-messages');
        if (!container) return;
        if (document.querySelector(`[data-id="${msg.id}"]`)) return; // dedup
        container.appendChild(renderMessage(msg));
        scrollBottom();
        if (!isOpen) bumpBadge();
    }

    function loadMessages(msgs) {
        const container = document.getElementById('omni-widget-messages');
        if (!container) return;
        container.innerHTML = '';
        msgs.forEach(m => container.appendChild(renderMessage(m)));
        scrollBottom();
    }

    function showWelcome(text) {
        const container = document.getElementById('omni-widget-messages');
        if (!container || container.children.length > 0) return;
        const el = document.createElement('div');
        el.className = 'omni-msg incoming';
        el.textContent = text;
        container.appendChild(el);
    }

    let typingEl = null;
    function showTyping() {
        if (typingEl) return;
        const container = document.getElementById('omni-widget-messages');
        typingEl = document.createElement('div');
        typingEl.className = 'omni-typing';
        typingEl.innerHTML = `<span>•</span><span>•</span><span>•</span>&nbsp;digitando`;
        container.appendChild(typingEl);
        scrollBottom();
    }
    function hideTyping() { typingEl?.remove(); typingEl = null; }

    function scrollBottom() {
        const container = document.getElementById('omni-widget-messages');
        if (container) container.scrollTop = container.scrollHeight;
    }

    let badgeCount = 0;
    function bumpBadge() {
        badgeCount++;
        const b = document.getElementById('omni-widget-badge');
        if (b) { b.style.display = 'flex'; b.textContent = badgeCount > 9 ? '9+' : String(badgeCount); }
    }
    function clearBadge() {
        badgeCount = 0;
        const b = document.getElementById('omni-widget-badge');
        if (b) b.style.display = 'none';
    }

    function escHtml(str) { return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

    // ─── Send ──────────────────────────────────────────────
    function doSend() {
        const input = document.getElementById('omni-widget-input');
        const body = input.value.trim();
        if (!body || !socket || !isConnected) return;

        socket.emit('widget:message', { body });

        // Optimistic render
        appendMessage({ id: 'opt_' + Date.now(), body, origin: 'CONTACT', createdAt: new Date().toISOString() });

        input.value = '';
        input.style.height = 'auto';
        document.getElementById('omni-widget-send').classList.remove('active');
        input.focus();
    }

    // ─── Socket Connection ─────────────────────────────────
    function connect() {
        // Dynamically load socket.io client from the same server
        const script = document.createElement('script');
        script.src = SERVER_URL + '/socket.io/socket.io.js';
        script.onload = () => initSocket();
        script.onerror = () => console.error('[OmniWidget] Failed to load socket.io.js');
        document.head.appendChild(script);
    }

    function initSocket() {
        const visitorName = cfg.visitorName || document.title || 'Visitante';

        socket = window.io(SERVER_URL + '/widget', {
            auth: { token: TOKEN, visitorId: VISITOR_ID, visitorName },
            transports: ['websocket', 'polling'],
            reconnectionAttempts: 5,
            reconnectionDelay: 2000,
        });

        socket.on('connect', () => console.log('[OmniWidget] Connected'));
        socket.on('disconnect', () => { isConnected = false; });

        socket.on('widget:ready', async (data) => {
            isConnected = true;
            sessionId = data.sessionId;
            ticketId = data.ticketId;
            widgetConfig = data.widget || {};

            // Apply remote config
            const agentName = widgetConfig.agentName || cfg.agentName || 'Atendimento';
            const el = document.getElementById('omni-agent-name');
            if (el) el.textContent = agentName;

            // Load message history
            try {
                const resp = await fetch(`${SERVER_URL}/api/widgets/public/${TOKEN}/messages?visitorId=${VISITOR_ID}`);
                if (resp.ok) {
                    const json = await resp.json();
                    if (json.messages && json.messages.length > 0) {
                        loadMessages(json.messages);
                    } else {
                        showWelcome(widgetConfig.welcomeMessage || 'Olá! 👋 Como podemos ajudar?');
                    }
                }
            } catch { showWelcome(widgetConfig.welcomeMessage || 'Olá! 👋 Como podemos ajudar?'); }
        });

        // Agent message received
        socket.on('message:new', (msg) => {
            if (msg.origin !== 'CONTACT') { hideTyping(); appendMessage(msg); }
        });

        // Agent typing
        socket.on('agent:typing', () => { showTyping(); });
        socket.on('agent:stop-typing', () => { hideTyping(); });

        socket.on('widget:error', (err) => console.error('[OmniWidget] Error:', err.message));
    }

    // ─── Boot ──────────────────────────────────────────────
    function boot() {
        injectStyles();
        buildWidget();
        connect();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
