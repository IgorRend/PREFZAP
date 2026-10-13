import { useEffect, useRef, useCallback } from 'react';
import { useTicketStore } from '../store/ticketStore';

// ─── Web Audio API — Synthesize a soft "pop" tone ────────
// No .mp3 file required. Creates a short 80ms chime using
// OscillatorNode + GainNode for a pleasant notification sound.
function playSoftPop() {
    try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        gain.connect(ctx.destination);

        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);       // A5 — pleasant chime
        osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.15);
        osc.connect(gain);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
        osc.onended = () => ctx.close();
    } catch {
        // Browser may block AudioContext before user gesture; fail silently
    }
}

// ─── Constants ────────────────────────────────────────────
const BASE_TITLE = 'Atende Mafra';
const QUEUE_STATUS = ['QUEUE', 'OPEN', 'BOT']; // statuses that count as "active"

// ─── Hook ─────────────────────────────────────────────────
/**
 * useBackgroundAlerts
 *
 * Responsible for two background-awareness features:
 *  1. Sound notification (Web Audio API chime) on new incoming message
 *     when the browser tab is not in focus OR the message is from a
 *     different ticket than the currently selected one.
 *  2. Dynamic document.title badge showing the count of tickets in
 *     QUEUE or OPEN status: "(3) Cidadãos aguardando — SmartMafra"
 *     Resets to the base title when the tab regains focus.
 */
export function useBackgroundAlerts() {
    const tickets = useTicketStore(s => s.tickets);
    const selectedTicket = useTicketStore(s => s.selectedTicket);
    const messages = useTicketStore(s => s.messages);

    // Track the last known message count to detect new arrivals
    const prevMessageCountRef = useRef(messages.length);
    const isTabFocused = useRef(!document.hidden);
    const unreadRef = useRef(0);

    // ─── Tab visibility tracking ─────────────────────────
    useEffect(() => {
        const onVisibilityChange = () => {
            isTabFocused.current = !document.hidden;
            if (!document.hidden) {
                // User returned to tab — reset title
                document.title = BASE_TITLE;
                unreadRef.current = 0;
            }
        };
        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => document.removeEventListener('visibilitychange', onVisibilityChange);
    }, []);

    // ─── Sound on new incoming message ───────────────────
    useEffect(() => {
        const prev = prevMessageCountRef.current;
        const curr = messages.length;

        if (curr > prev) {
            // New message(s) detected
            const lastMsg = messages[messages.length - 1];
            const isFromContact = lastMsg?.origin === 'CONTACT';
            const isDifferentTicket = lastMsg?.ticketId !== selectedTicket?.id;

            if (isFromContact && (!isTabFocused.current || isDifferentTicket)) {
                playSoftPop();
                unreadRef.current += 1;
                if (!isTabFocused.current) {
                    document.title = `(${unreadRef.current}) Nova mensagem — ${BASE_TITLE}`;
                }
            }
        }

        prevMessageCountRef.current = curr;
    }, [messages, selectedTicket?.id]);

    // ─── Title badge: tickets waiting in queue ───────────
    useEffect(() => {
        // Only update title while tab is hidden (don't override unread badge)
        if (isTabFocused.current) {
            const waiting = tickets.filter(t => t.status === 'QUEUE').length;
            if (waiting > 0) {
                document.title = `(${waiting}) Aguardando — ${BASE_TITLE}`;
            } else {
                document.title = BASE_TITLE;
            }
        }
    }, [tickets]);

    // ─── Reset title on window focus ─────────────────────
    useEffect(() => {
        const onFocus = () => {
            document.title = BASE_TITLE;
            unreadRef.current = 0;
            isTabFocused.current = true;
        };
        const onBlur = () => { isTabFocused.current = false; };

        window.addEventListener('focus', onFocus);
        window.addEventListener('blur', onBlur);
        return () => {
            window.removeEventListener('focus', onFocus);
            window.removeEventListener('blur', onBlur);
        };
    }, []);
}
