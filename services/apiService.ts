
import {
    Colaborador,
    ConfigReembolso,
    SystemConfig,
    Ausencia,
    Usuario,
    AuthResponse,
    LogSistema,
    ItemRelatorio,
    ItemRelatorioAnalitico,
    DiffItem,
    SalvarCalculoPayload,
    VisitaPrevista,
    LicenseStatus,
    IntegrationConfig,
    ImportPreviewResult
} from '../types';
import * as mockApiData from '../api/mockData.ts';

// LÓGICA DE URL DINÂMICA
// Se estiver rodando localmente (dev sem docker), usa a porta 3031 direta.
// Se estiver em produção (Docker/Nginx na porta 8081), usa o proxy relativo '/api'
const getBaseUrl = () => {
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost' && window.location.port !== '8081') {
        return 'http://localhost:3031';
    }
    return '/api';
};

const API_BASE_URL = getBaseUrl();
const MODE_KEY = 'FUEL360_API_MODE';

export const getCurrentMode = (): 'MOCK' | 'API' => {
    return (localStorage.getItem(MODE_KEY) as 'MOCK' | 'API') || 'MOCK';
};

export const toggleMode = (mode: 'MOCK' | 'API') => {
    localStorage.setItem(MODE_KEY, mode);
    window.location.reload();
};

const USE_MOCK = getCurrentMode() === 'MOCK';

async function apiRequest<T>(endpoint: string, method: string = 'GET', body?: any): Promise<T> {
    const token = localStorage.getItem('AUTH_TOKEN');
    const headers: HeadersInit = {
        'Content-Type': 'application/json'
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const config: RequestInit = {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
    };

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
        
        if (response.status === 401) {
            window.dispatchEvent(new Event('FUEL360_UNAUTHORIZED'));
            throw new Error('Sessão expirada');
        }

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Erro API: ${response.status}`);
        }

        return await response.json();
    } catch (error: any) {
        console.error(`API Call Error (${endpoint}):`, error);
        throw error;
    }
}

// --- API REAL IMPL ---
const RealService = {
    login: (usuario: string, senha: string): Promise<AuthResponse> => apiRequest('/login', 'POST', { usuario, senha }),
    
    getSystemStatus: (): Promise<LicenseStatus> => apiRequest('/system/status'),
    updateLicense: (key: string): Promise<{message: string}> => apiRequest('/system/license', 'POST', { key }),
    getSystemConfig: (): Promise<SystemConfig> => apiRequest('/system/config'),
    updateSystemConfig: (config: SystemConfig): Promise<void> => apiRequest('/system/config', 'PUT', config),
    getIntegrationConfig: (): Promise<IntegrationConfig> => apiRequest('/system/integration'),
    updateIntegrationConfig: (config: IntegrationConfig): Promise<void> => apiRequest('/system/integration', 'PUT', config),
    
    getUsuarios: (): Promise<Usuario[]> => apiRequest('/usuarios'),
    createUsuario: (usuario: Usuario): Promise<void> => apiRequest('/usuarios', 'POST', usuario),
    updateUsuario: (id: number, usuario: Usuario): Promise<void> => apiRequest(`/usuarios/${id}`, 'PUT', usuario),
    
    getColaboradores: (): Promise<Colaborador[]> => apiRequest('/colaboradores'),
    createColaborador: (colaborador: Colaborador): Promise<Colaborador> => apiRequest('/colaboradores', 'POST', colaborador),
    updateColaborador: (id: number, colaborador: Colaborador): Promise<Colaborador> => apiRequest(`/colaboradores/${id}`, 'PUT', colaborador),
    deleteColaborador: (id: number): Promise<void> => apiRequest(`/colaboradores/${id}`, 'DELETE'),
    moveColaboradoresToGroup: (ids: number[], group: string): Promise<void> => apiRequest('/colaboradores/move', 'POST', { ids, group }),
    bulkUpdateColaboradores: (ids: number[], field: string, value: any, reason: string): Promise<void> => apiRequest('/colaboradores/bulk-update', 'POST', { ids, field, value, reason }),
    getImportPreview: (): Promise<ImportPreviewResult> => apiRequest('/colaboradores/import-preview'),
    syncColaboradores: (items: DiffItem[]): Promise<void> => apiRequest('/colaboradores/sync', 'POST', { items }),
    getSugestoesVinculo: (ids: number[]): Promise<any[]> => apiRequest('/colaboradores/suggestions', 'POST', { ids }),
    
    getFuelConfig: (): Promise<ConfigReembolso> => apiRequest('/config/fuel'),
    updateFuelConfig: (config: ConfigReembolso): Promise<void> => apiRequest('/config/fuel', 'PUT', config),
    getFuelConfigHistory: (): Promise<LogSistema[]> => apiRequest('/config/fuel/history'),
    
    getAusencias: (): Promise<Ausencia[]> => apiRequest('/ausencias'),
    createAusencia: (ausencia: any): Promise<Ausencia> => apiRequest('/ausencias', 'POST', ausencia),
    deleteAusencia: (id: number, reason: string): Promise<void> => apiRequest(`/ausencias/${id}`, 'DELETE', { reason }),
    corrigirAusenciasHistorico: (ids: number[]): Promise<void> => apiRequest('/ausencias/fix-history', 'POST', { ids }),
    
    saveCalculo: (payload: SalvarCalculoPayload): Promise<void> => apiRequest('/calculo', 'POST', payload),
    checkCalculoExists: (periodo: string): Promise<boolean> => apiRequest(`/calculo/exists?periodo=${encodeURIComponent(periodo)}`),
    
    getRelatorioReembolso: (startDate: string, endDate: string, colab?: string, group?: string): Promise<ItemRelatorio[]> => {
        const q = new URLSearchParams({ startDate, endDate });
        if(colab) q.append('colab', colab);
        if(group) q.append('group', group);
        return apiRequest(`/relatorios/reembolso?${q.toString()}`);
    },
    getRelatorioAnalitico: (startDate: string, endDate: string, colab?: string, group?: string): Promise<ItemRelatorioAnalitico[]> => {
        const q = new URLSearchParams({ startDate, endDate });
        if(colab) q.append('colab', colab);
        if(group) q.append('group', group);
        return apiRequest(`/relatorios/analitico?${q.toString()}`);
    },
    
    logAction: (acao: string, detalhes: string): Promise<void> => apiRequest('/logs', 'POST', { acao, detalhes }),
    
    getVisitasPrevistas: (startDate?: string, endDate?: string): Promise<VisitaPrevista[]> => {
        let query = '/roteiro/previsao';
        if (startDate && endDate) {
            query += `?startDate=${startDate}&endDate=${endDate}`;
        }
        return apiRequest(query);
    }
};

// --- API MOCK IMPL ---
const MockService = {
    login: async (usuario: string, senha: string): Promise<AuthResponse> => {
        await new Promise(r => setTimeout(r, 500));
        if (usuario === 'admin' && senha === 'admin') {
            return { token: 'mock-token', user: { ID_Usuario: 1, Nome: 'Admin Mock', Usuario: 'admin', Perfil: 'Admin', Ativo: true } };
        }
        throw new Error('Credenciais inválidas (Mock: admin/admin)');
    },
    getSystemStatus: async (): Promise<LicenseStatus> => ({ status: 'ACTIVE', client: 'Mock Client', expiresAt: '2030-12-31' }),
    updateLicense: async () => ({ message: 'Licença ativada (Mock)' }),
    getSystemConfig: async (): Promise<SystemConfig> => ({ companyName: 'Fuel360 Mock', logoUrl: '' }),
    updateSystemConfig: async () => {},
    getIntegrationConfig: async (): Promise<IntegrationConfig> => ({ extDb_Host: 'localhost', extDb_Port: 3306, extDb_User: 'root', extDb_Pass: '', extDb_Database: 'db', extDb_Query: '' }),
    updateIntegrationConfig: async () => {},
    getUsuarios: async (): Promise<Usuario[]> => ([{ ID_Usuario: 1, Nome: 'Admin Mock', Usuario: 'admin', Perfil: 'Admin', Ativo: true }]),
    createUsuario: async () => {},
    updateUsuario: async () => {},
    getColaboradores: async (): Promise<Colaborador[]> => ([
        { ID_Colaborador: 1, ID_Pulsus: 100, CodigoSetor: 1, Nome: 'João Silva', Grupo: 'Vendedor', TipoVeiculo: 'Carro', Ativo: true },
        { ID_Colaborador: 2, ID_Pulsus: 101, CodigoSetor: 2, Nome: 'Maria Santos', Grupo: 'Promotor', TipoVeiculo: 'Moto', Ativo: true }
    ]),
    createColaborador: async (c: Colaborador) => ({ ...c, ID_Colaborador: Math.random() }),
    updateColaborador: async (id: number, c: Colaborador) => c,
    deleteColaborador: async () => {},
    moveColaboradoresToGroup: async () => {},
    bulkUpdateColaboradores: async () => {},
    getImportPreview: async (): Promise<ImportPreviewResult> => ({ novos: [], alterados: [], conflitos: [], totalExternal: 0 }),
    syncColaboradores: async () => {},
    getSugestoesVinculo: async () => [],
    getFuelConfig: async (): Promise<ConfigReembolso> => ({ PrecoCombustivel: 5.50, KmL_Carro: 10, KmL_Moto: 35 }),
    updateFuelConfig: async () => {},
    getFuelConfigHistory: async () => [],
    getAusencias: async (): Promise<Ausencia[]> => [],
    createAusencia: async (a: any) => ({ ...a, ID_Ausencia: Math.random() }),
    deleteAusencia: async () => {},
    corrigirAusenciasHistorico: async () => {},
    saveCalculo: async () => {},
    checkCalculoExists: async () => false,
    getRelatorioReembolso: async () => [],
    getRelatorioAnalitico: async () => [],
    logAction: async () => {},
    getVisitasPrevistas: async (startDate?: string, endDate?: string): Promise<VisitaPrevista[]> => {
        await new Promise(r => setTimeout(r, 1000));
        return mockApiData.getMockVisitasPrevistas();
    }
};

const Service = USE_MOCK ? MockService : RealService;

export const {
    login,
    getSystemStatus, updateLicense,
    getSystemConfig, updateSystemConfig,
    getIntegrationConfig, updateIntegrationConfig,
    getUsuarios, createUsuario, updateUsuario,
    getColaboradores, createColaborador, updateColaborador, deleteColaborador, moveColaboradoresToGroup, bulkUpdateColaboradores, getImportPreview, syncColaboradores, getSugestoesVinculo,
    getFuelConfig, updateFuelConfig, getFuelConfigHistory,
    getAusencias, createAusencia, deleteAusencia, corrigirAusenciasHistorico,
    saveCalculo, checkCalculoExists,
    getRelatorioReembolso, getRelatorioAnalitico,
    logAction,
    getVisitasPrevistas
} = Service;
