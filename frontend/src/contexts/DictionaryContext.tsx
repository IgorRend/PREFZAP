import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getDictionary, DictionaryKey } from '../lib/dictionary';
import api from '../services/api';

interface DictionaryContextType {
    t: (key: DictionaryKey) => string;
    niche: string;
}

const DictionaryContext = createContext<DictionaryContextType>({
    t: (key) => key,
    niche: 'generic',
});

export function DictionaryProvider({ children }: { children: ReactNode }) {
    const [niche, setNiche] = useState('generic');

    useEffect(() => {
        api.get('/tenant-config')
            .then(r => setNiche(r.data.businessNiche || 'generic'))
            .catch(() => { });
    }, []);

    const dict = getDictionary(niche);
    const t = (key: DictionaryKey): string => dict[key] || key;

    return (
        <DictionaryContext.Provider value={{ t, niche }}>
            {children}
        </DictionaryContext.Provider>
    );
}

export function useDictionary() {
    return useContext(DictionaryContext);
}
