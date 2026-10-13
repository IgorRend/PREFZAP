import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
    theme: Theme;
    resolvedTheme: 'light' | 'dark';
    setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setTheme] = useState<Theme>(() => {
        const stored = localStorage.getItem('saas_theme');
        return (stored as Theme) || 'system';
    });
    const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

    useEffect(() => {
        localStorage.setItem('saas_theme', theme);

        const root = document.documentElement;
        let isDark = false;

        const applyTheme = (dark: boolean) => {
            if (dark) {
                root.setAttribute('data-theme', 'dark');
                root.classList.add('dark');
            } else {
                root.setAttribute('data-theme', 'light');
                root.classList.remove('dark');
            }
            setResolvedTheme(dark ? 'dark' : 'light');
        };

        if (theme === 'system') {
            const mql = window.matchMedia('(prefers-color-scheme: dark)');
            isDark = mql.matches;
            applyTheme(isDark);

            const listener = (e: MediaQueryListEvent) => {
                if (theme === 'system') applyTheme(e.matches);
            };
            mql.addEventListener('change', listener);
            return () => mql.removeEventListener('change', listener);
        } else {
            isDark = theme === 'dark';
            applyTheme(isDark);
        }
    }, [theme]);


    return (
        <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}
