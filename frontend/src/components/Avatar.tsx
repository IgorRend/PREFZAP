import React, { useState, useEffect } from 'react';
import api from '../services/api';

interface AvatarProps {
    phone: string;
    name?: string;
    url?: string | null;
    size?: number;
    className?: string;
    style?: React.CSSProperties;
}

export default function Avatar({ phone, name, url, size = 40, className = '', style = {} }: AvatarProps) {
    const [avatarUrl, setAvatarUrl] = useState<string | null>(url || null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (url) {
            setAvatarUrl(url);
            setFailed(false);
            return;
        }
        
        // If no URL is provided, fetch it
        let mounted = true;
        api.get(`/contacts/${phone}/avatar`)
            .then(res => {
                if (!mounted) return;
                const fetchedUrl = res.data?.data?.url || res.data?.url || res.data?.data?.profilePictureUrl;
                if (fetchedUrl) {
                    setAvatarUrl(fetchedUrl);
                } else {
                    setFailed(true);
                }
            })
            .catch(() => {
                if (mounted) setFailed(true);
            });
            
        return () => { mounted = false; };
    }, [phone, url]);

    const fallbackInitials = (name || phone || '?').charAt(0).toUpperCase();

    if (avatarUrl && !failed) {
        return (
            <img 
                src={avatarUrl} 
                alt={name || phone}
                onError={() => setFailed(true)}
                className={className}
                style={{ 
                    width: size, height: size, borderRadius: '50%', 
                    objectFit: 'cover', display: 'block', ...style 
                }} 
            />
        );
    }

    // Fallback UI
    return (
        <div 
            className={className}
            style={{ 
                width: size, height: size, borderRadius: '50%', 
                background: 'var(--bg-tertiary)', 
                display: 'flex', alignItems: 'center', justifyContent: 'center', 
                fontSize: size * 0.35, fontWeight: 700, color: 'var(--accent)',
                ...style
            }}
        >
            {fallbackInitials}
        </div>
    );
}
