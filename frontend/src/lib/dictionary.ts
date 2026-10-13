/**
 * Dynamic Dictionary — i18n labels per business niche.
 * Keys are used by the `t()` function from DictionaryContext.
 */

export type DictionaryKey =
    | 'CONTACT_LABEL' | 'CONTACT_PLURAL' | 'TICKET_LABEL' | 'TICKET_PLURAL'
    | 'SEARCH_CONTACT' | 'DEPARTMENT_LABEL' | 'DEPARTMENT_PLURAL' | 'AGENT_LABEL'
    | 'AGENT_PLURAL' // Added
    | 'SIDEBAR_SUBTITLE' | 'NO_CONTACT_FOUND' | 'CONTACT_INFO'
    | 'SELECT_TICKET' | 'MANAGE_TEAM' | 'MANAGE_DEPARTMENTS'
    | 'PERFORMANCE_ANALYSIS' | 'CONTACTS_BY_STATE' | 'SERVICE_MODE'
    | 'SETTINGS_LABEL' // Added
    | 'REPORTS_LABEL'; // Added

export type BusinessNiche = 'generic' | 'public_sector' | 'healthcare' | 'retail';

type DictionaryMap = Record<DictionaryKey, string>;

const dictionaries: Record<BusinessNiche, DictionaryMap> = {
    generic: {
        CONTACT_LABEL: 'Contato',
        CONTACT_PLURAL: 'Contatos',
        TICKET_LABEL: 'Atendimento',
        TICKET_PLURAL: 'Atendimentos',
        SEARCH_CONTACT: 'Buscar contato...',
        DEPARTMENT_LABEL: 'Departamento',
        DEPARTMENT_PLURAL: 'Setores',
        AGENT_LABEL: 'Atendente',
        AGENT_PLURAL: 'Atendentes', // Added
        SIDEBAR_SUBTITLE: 'Atendimento Inteligente',
        NO_CONTACT_FOUND: 'Nenhum contato encontrado',
        CONTACT_INFO: 'Informações do Contato',
        SELECT_TICKET: 'Selecione um ticket para iniciar o atendimento',
        MANAGE_TEAM: 'Gerencie sua equipe de atendimento',
        MANAGE_DEPARTMENTS: 'Gerencie os departamentos de atendimento',
        PERFORMANCE_ANALYSIS: 'Análise de desempenho do atendimento',
        CONTACTS_BY_STATE: 'Contatos por Estado (DDD)',
        SERVICE_MODE: 'Modo de Atendimento',
        SETTINGS_LABEL: 'Configurações', // Added
        REPORTS_LABEL: 'Relatórios', // Added
    },
    public_sector: {
        CONTACT_LABEL: 'Cidadão',
        CONTACT_PLURAL: 'Cidadãos',
        TICKET_LABEL: 'Protocolo',
        TICKET_PLURAL: 'Protocolos',
        SEARCH_CONTACT: 'Buscar cidadão...',
        DEPARTMENT_LABEL: 'Secretaria',
        DEPARTMENT_PLURAL: 'Secretarias',
        AGENT_LABEL: 'Servidor',
        AGENT_PLURAL: 'Servidores', // Added
        SIDEBAR_SUBTITLE: 'Ouvidoria Digital',
        NO_CONTACT_FOUND: 'Nenhum cidadão encontrado',
        CONTACT_INFO: 'Informações do Cidadão',
        SELECT_TICKET: 'Selecione um protocolo para iniciar o atendimento',
        MANAGE_TEAM: 'Gerencie sua equipe de servidores',
        MANAGE_DEPARTMENTS: 'Gerencie as secretarias',
        PERFORMANCE_ANALYSIS: 'Análise de desempenho da ouvidoria',
        CONTACTS_BY_STATE: 'Cidadãos por Estado (DDD)',
        SERVICE_MODE: 'Modo de Atendimento',
        SETTINGS_LABEL: 'Gestão do Órgão', // Added
        REPORTS_LABEL: 'Transparência/Dados', // Added
    },
    healthcare: {
        CONTACT_LABEL: 'Paciente',
        CONTACT_PLURAL: 'Pacientes',
        TICKET_LABEL: 'Consulta',
        TICKET_PLURAL: 'Consultas',
        SEARCH_CONTACT: 'Buscar paciente...',
        DEPARTMENT_LABEL: 'Setor',
        DEPARTMENT_PLURAL: 'Setores',
        AGENT_LABEL: 'Atendente',
        AGENT_PLURAL: 'Equipe Médica', // Added
        SIDEBAR_SUBTITLE: 'Gestão de Pacientes',
        NO_CONTACT_FOUND: 'Nenhum paciente encontrado',
        CONTACT_INFO: 'Informações do Paciente',
        SELECT_TICKET: 'Selecione uma consulta para iniciar o atendimento',
        MANAGE_TEAM: 'Gerencie sua equipe de atendimento',
        MANAGE_DEPARTMENTS: 'Gerencie os setores clínicos',
        PERFORMANCE_ANALYSIS: 'Análise de desempenho clínico',
        CONTACTS_BY_STATE: 'Pacientes por Estado (DDD)',
        SERVICE_MODE: 'Modo de Atendimento',
        SETTINGS_LABEL: 'Configuração da Clínica', // Added
        REPORTS_LABEL: 'Métricas da Clínica', // Added
    },
    retail: {
        CONTACT_LABEL: 'Cliente',
        CONTACT_PLURAL: 'Clientes',
        TICKET_LABEL: 'Atendimento',
        TICKET_PLURAL: 'Atendimentos',
        SEARCH_CONTACT: 'Buscar cliente...',
        DEPARTMENT_LABEL: 'Departamento',
        DEPARTMENT_PLURAL: 'Departamentos',
        AGENT_LABEL: 'Vendedor',
        AGENT_PLURAL: 'Vendedores', // Added
        SIDEBAR_SUBTITLE: 'CRM Omnichannel',
        NO_CONTACT_FOUND: 'Nenhum cliente encontrado',
        CONTACT_INFO: 'Informações do Cliente',
        SELECT_TICKET: 'Selecione um atendimento para iniciar',
        MANAGE_TEAM: 'Gerencie sua equipe de vendas',
        MANAGE_DEPARTMENTS: 'Gerencie os departamentos',
        PERFORMANCE_ANALYSIS: 'Análise de desempenho comercial',
        CONTACTS_BY_STATE: 'Clientes por Estado (DDD)',
        SERVICE_MODE: 'Modo de Atendimento',
        SETTINGS_LABEL: 'Configuração da Loja', // Added
        REPORTS_LABEL: 'Desempenho de Vendas', // Added
    },
};

export function getDictionary(niche: string): DictionaryMap {
    return dictionaries[niche as BusinessNiche] || dictionaries.generic;
}
