import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';

interface ModulesContextType {
    modules: string[];
    hasModule: (name: string) => boolean;
    isLoaded: boolean;
}

const ModulesContext = createContext<ModulesContextType>({
    modules: [],
    hasModule: () => true,
    isLoaded: false,
});

export function ModulesProvider({ children }: { children: ReactNode }) {
    const [modules, setModules] = useState<string[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);
    const { token, managementContext } = useAuthStore();

    useEffect(() => {
        setIsLoaded(false);
        api.get('/tenant-config')
            .then(r => {
                setModules(r.data.activeModules || []);
                setIsLoaded(true);
            })
            .catch(() => {
                // Default: all modules enabled (backwards compat)
                setModules(['ticketing', 'bot_flow', 'analytics', 'internal_chat', 'nps', 'automations', 'hsm_templates', 'bulk_import']);
                setIsLoaded(true);
            });
    }, [token, managementContext]);

    const hasModule = (name: string): boolean => {
        if (!isLoaded) return true; // While loading, show everything
        return modules.includes(name);
    };

    return (
        <ModulesContext.Provider value={{ modules, hasModule, isLoaded }}>
            {children}
        </ModulesContext.Provider>
    );
}

export function useModules() {
    return useContext(ModulesContext);
}
