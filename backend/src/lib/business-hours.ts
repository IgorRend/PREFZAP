import { SettingsService } from '../modules/settings/settings.service';

interface Period {
    start: string;
    end: string;
}

// Cada dia pode ser: um período (formato antigo), uma lista de períodos (novo,
// até 2 para fechar no almoço) ou null (fechado).
interface BusinessHoursSchedule {
    [day: string]: Period | Period[] | null;
}

/**
 * Normaliza o valor de um dia para uma lista de períodos válidos.
 * Aceita o formato antigo (objeto único) e o novo (array), descartando
 * períodos sem start/end.
 */
function normalizePeriods(value: Period | Period[] | null | undefined): Period[] {
    if (!value) return [];
    const list = Array.isArray(value) ? value : [value];
    return list.filter((p): p is Period => !!p && !!p.start && !!p.end);
}

// Day-of-week names matching JS getDay() via Intl
const DOW_MAP: Record<number, string> = {
    0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat',
};

/**
 * Get the current time in the configured timezone.
 */
function getNowInTimezone(timezone: string): Date {
    const nowStr = new Date().toLocaleString('en-US', { timeZone: timezone });
    return new Date(nowStr);
}

/**
 * Parse "HH:MM" to total minutes since midnight.
 */
function timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
}

/**
 * Check if the business is currently open based on settings.
 * Returns { isOpen: boolean, awayMessage?: string }
 */
export async function checkBusinessHours(): Promise<{ isOpen: boolean; awayMessage?: string }> {
    const settings = await SettingsService.get();

    if (settings.businessHoursMode === 'always') {
        return { isOpen: true };
    }

    if (settings.businessHoursMode === 'closed') {
        return { isOpen: false, awayMessage: settings.awayMessage };
    }

    // "custom" mode — check schedule
    const tz = settings.timezone || 'America/Sao_Paulo';
    const now = getNowInTimezone(tz);
    const dayKey = DOW_MAP[now.getDay()];
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    let schedule: BusinessHoursSchedule = {};
    try {
        schedule = JSON.parse(settings.businessHoursJson);
    } catch {
        return { isOpen: true }; // Invalid JSON → treat as always open
    }

    const periods = normalizePeriods(schedule[dayKey]);
    if (periods.length === 0) {
        return { isOpen: false, awayMessage: settings.awayMessage }; // Day not configured → closed
    }

    // Aberto se o horário atual cair em qualquer um dos períodos do dia.
    const isOpen = periods.some(p => {
        const startMin = timeToMinutes(p.start);
        const endMin = timeToMinutes(p.end);
        return currentMinutes >= startMin && currentMinutes <= endMin;
    });

    return isOpen ? { isOpen: true } : { isOpen: false, awayMessage: settings.awayMessage };
}
