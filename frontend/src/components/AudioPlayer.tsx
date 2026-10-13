import { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, Volume2, RotateCcw } from 'lucide-react';

// ─── Utility ──────────────────────────────────────────────

function formatSecs(s: number) {
    if (!isFinite(s) || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
}

const SPEEDS = [1, 1.5, 2];

// ─── AudioPlayer Component ────────────────────────────────

interface AudioPlayerProps {
    src: string;
    isOutgoing?: boolean;
}

export default function AudioPlayer({ src, isOutgoing = false }: AudioPlayerProps) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [playing, setPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [speedIdx, setSpeedIdx] = useState(0);
    const [dragging, setDragging] = useState(false);
    const progressRef = useRef<HTMLDivElement>(null);

    const speed = SPEEDS[speedIdx];
    const progress = duration > 0 ? currentTime / duration : 0;

    // Sync audio element
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        const onTimeUpdate = () => { if (!dragging) setCurrentTime(audio.currentTime); };
        const onDuration = () => setDuration(audio.duration);
        const onEnded = () => { setPlaying(false); setCurrentTime(0); audio.currentTime = 0; };
        audio.addEventListener('timeupdate', onTimeUpdate);
        audio.addEventListener('loadedmetadata', onDuration);
        audio.addEventListener('durationchange', onDuration);
        audio.addEventListener('ended', onEnded);
        return () => {
            audio.removeEventListener('timeupdate', onTimeUpdate);
            audio.removeEventListener('loadedmetadata', onDuration);
            audio.removeEventListener('durationchange', onDuration);
            audio.removeEventListener('ended', onEnded);
        };
    }, [dragging]);

    // Revoke blob URLs when src changes or component unmounts
    useEffect(() => {
        return () => {
            if (src.startsWith('blob:')) {
                URL.revokeObjectURL(src);
            }
        };
    }, [src]);

    const togglePlay = useCallback(() => {
        const audio = audioRef.current;
        if (!audio) return;
        if (playing) { audio.pause(); setPlaying(false); }
        else { audio.play(); setPlaying(true); }
    }, [playing]);

    const cycleSpeed = useCallback(() => {
        const audio = audioRef.current;
        const next = (speedIdx + 1) % SPEEDS.length;
        setSpeedIdx(next);
        if (audio) audio.playbackRate = SPEEDS[next];
    }, [speedIdx]);

    const restart = useCallback(() => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.currentTime = 0;
        setCurrentTime(0);
    }, []);

    // Seek via click/drag on progress bar
    const seek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const bar = progressRef.current;
        const audio = audioRef.current;
        if (!bar || !audio || !duration) return;
        const rect = bar.getBoundingClientRect();
        const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
        audio.currentTime = ratio * duration;
        setCurrentTime(ratio * duration);
    }, [duration]);

    const dir = isOutgoing ? ' outgoing' : '';

    return (
        <div className={`audio-player${dir}`}>
            <audio ref={audioRef} src={src} preload="metadata" />

            {/* Play/Pause */}
            <button
                onClick={togglePlay}
                className={`audio-play-btn${dir}`}
            >
                {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
            </button>

            {/* Progress + time */}
            <div className="audio-progress-track">
                {/* Progress bar */}
                <div
                    ref={progressRef}
                    onClick={seek}
                    className={`audio-progress-bar${dir}`}
                >
                    <div
                        className={`audio-progress-fill${dir}`}
                        style={{ width: `${progress * 100}%` }}
                    />
                    {/* Thumb */}
                    <div
                        className={`audio-progress-thumb${dir}`}
                        style={{ left: `${progress * 100}%` }}
                    />
                </div>

                {/* Time row */}
                <div className={`audio-time${dir}`}>
                    <span>{formatSecs(currentTime)}</span>
                    <span>{formatSecs(duration)}</span>
                </div>
            </div>

            {/* Speed + Restart */}
            <div className="audio-controls-right">
                <button
                    onClick={cycleSpeed}
                    className={`audio-speed-btn${dir}`}
                    title="Velocidade"
                >
                    {speed}x
                </button>
                <button
                    onClick={restart}
                    className="btn-ghost btn-icon-sm"
                    style={{ padding: 2, color: isOutgoing ? 'rgba(255,255,255,0.7)' : undefined }}
                    title="Reiniciar"
                >
                    <RotateCcw size={12} />
                </button>
            </div>

            {/* Volume icon (visual indicator) */}
            <Volume2 size={14} className={`audio-volume-icon${dir}`} />
        </div>
    );
}
