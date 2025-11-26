
import { Colaborador, ConfigReembolso, Usuario, AuthResponse, LicenseStatus, SystemConfig, LogSistema, SalvarCalculoPayload, ItemRelatorio, ItemRelatorioAnalitico, Ausencia } from '../types.ts';
import * as mockApi from '../api/mockData.ts';

declare global { interface Window { __FRETE_MODO_MOCK__?: boolean; } }

const getStoredMode = (): boolean | null => {
    try {
        const stored = localStorage.getItem('APP_MODE');
        if (stored === 'MOCK') return true;
        if (stored === 'API') return false;
    } catch (e) { console.warn('LocalStorage inacessível:', e); }
    return null;
};

const getHtmlConfig = (): boolean => {
    if (typeof window !== 'undefined' && window.__FRETE_MODO_MOCK__ !== undefined) return window.__FRETE_MODO_MOCK__;
    return false;
};

const USE_MOCK = getStoredMode() ?? getHtmlConfig();
const API_BASE_URL = '/api';

export const toggleMode = (mode: 'MOCK' | 'API') => {
    localStorage.setItem('APP_MODE', mode);
    window.location.reload();
};
export const getCurrentMode = () => USE_MOCK ? 'MOCK' : 'API';

// --- HELPER API REAL ---
const getToken = () => localStorage.getItem('AUTH_TOKEN');

const handleResponse = async (response: Response, isLoginRequest: boolean = false) => {
    if (response.status === 401 || response.status === 403) {
        if (isLoginRequest) throw new Error('Falha na autenticação.');
        localStorage.removeItem('AUTH_TOKEN');
        localStorage.removeItem('AUTH_USER');
        window.location.reload();
        throw new Error('Sessão expirada.');
    }
    if (response.status === 402) {
        const errorData = await response.json();
        const codeTag = errorData.code ? `[${errorData.code}] ` : '';
        throw new Error(`${codeTag}${errorData.message || 'Modo Somente Leitura.'}`);
    }
    if (!response.ok) {
        let errorMessage = response.statusText;
        try { const errorData = await response.json(); if (errorData && errorData.message) errorMessage = errorData.message; } catch (e) {}
        throw new Error(`Erro na API (${response.status}): ${errorMessage}`);
    }
    if (response.status === 204) return null;
    return await response.json();
};

const apiRequest = async (endpoint: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', body?: any) => {
    const url = `${API_BASE_URL}/${endpoint.replace(/^\//, '')}`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const options: RequestInit = { 
        method, headers, 
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store' 
    };
    
    const response = await fetch(url, options);
    const isLogin = endpoint === '/login';
    
    const licenseStatus = response.headers.get('X-License-Status');
    if (licenseStatus === 'EXPIRED') window.dispatchEvent(new CustomEvent('FRETE360_LICENSE_EXPIRED'));

    return handleResponse(response, isLogin);
};

// --- API REAL IMPL ---
const RealService = {
    getSystemStatus: (): Promise<LicenseStatus> => apiRequest('/system/status', 'GET'),
    updateLicense: (licenseKey: string): Promise<any> => apiRequest('/license', 'POST', { licenseKey }),
    getSystemConfig: (): Promise<SystemConfig> => apiRequest('/system/config', 'GET'),
    updateSystemConfig: (config: SystemConfig): Promise<any> => apiRequest('/system/config', 'PUT', config),
    login: (usuario: string, senha: string): Promise<AuthResponse> => apiRequest('/login', 'POST', { usuario, senha }),
    getUsuarios: (): Promise<Usuario[]> => apiRequest('/usuarios', 'GET'),
    createUsuario: (u: any): Promise<Usuario> => apiRequest('/usuarios', 'POST', u),
    updateUsuario: (id: number, u: any): Promise<Usuario> => apiRequest(`/usuarios/${id}`, 'PUT', u),

    // FUEL360
    getColaboradores: (): Promise<Colaborador[]> => apiRequest('/colaboradores', 'GET'),
    createColaborador: (c: Colaborador): Promise<Colaborador> => apiRequest('/colaboradores', 'POST', c),
    updateColaborador: (id: number, c: Colaborador): Promise<Colaborador> => apiRequest(`/colaboradores/${id}`, 'PUT', c),
    deleteColaborador: (id: number): Promise<void> => apiRequest(`/colaboradores/${id}`, 'DELETE'),
    
    getFuelConfig: (): Promise<ConfigReembolso> => apiRequest('/fuel-config', 'GET'),
    updateFuelConfig: (c: ConfigReembolso): Promise<void> => apiRequest('/fuel-config', 'PUT', c),
    getFuelConfigHistory: (): Promise<LogSistema[]> => apiRequest('/fuel-config/history', 'GET'),

    // Ausências
    getAusencias: (): Promise<Ausencia[]> => apiRequest('/ausencias', 'GET'),
    createAusencia: (a: any): Promise<Ausencia> => apiRequest('/ausencias', 'POST', a),
    deleteAusencia: (id: number, motivo: string): Promise<void> => apiRequest(`/ausencias/${id}`, 'DELETE', { motivo }),

    // Histórico e Relatórios
    checkCalculoExists: (periodo: string): Promise<boolean> => apiRequest(`/calculos/check-periodo?periodo=${encodeURIComponent(periodo)}`, 'GET').then(r => r.exists),
    saveCalculo: (payload: SalvarCalculoPayload): Promise<any> => apiRequest('/calculos', 'POST', payload),
    getRelatorioReembolso: (start: string, end: string, colabId?: string): Promise<ItemRelatorio[]> => {
        const query = new URLSearchParams({ startDate: start, endDate: end });
        if(colabId) query.append('colaboradorId', colabId);
        return apiRequest(`/relatorios/reembolso?${query.toString()}`, 'GET');
    },
    getRelatorioAnalitico: (start: string, end: string, colabId?: string): Promise<ItemRelatorioAnalitico[]> => {
        const query = new URLSearchParams({ startDate: start, endDate: end });
        if(colabId) query.append('colaboradorId', colabId);
        return apiRequest(`/relatorios/analitico?${query.toString()}`, 'GET');
    },

    // Logs
    logAction: (acao: string, detalhes: string): Promise<void> => apiRequest('/logs', 'POST', { acao, detalhes })
};

// --- API MOCK IMPL ---
const MockService = {
    getSystemStatus: async (): Promise<LicenseStatus> => ({ status: 'ACTIVE', client: 'Mock Client', expiresAt: new Date(Date.now() + 31536000000) }),
    updateLicense: async () => ({ success: true, message: 'Licença Mock Ativada' }),
    getSystemConfig: async () => ({ companyName: 'Mock Transportes', logoUrl: '' }),
    updateSystemConfig: async () => ({ success: true }),
    login: mockApi.mockLogin,
    getUsuarios: mockApi.getMockUsuarios,
    createUsuario: mockApi.createMockUsuario,
    updateUsuario: mockApi.updateMockUsuario,

    getColaboradores: mockApi.getMockColaboradores,
    createColaborador: mockApi.createMockColaborador,
    updateColaborador: (id: number, c: Colaborador) => mockApi.updateMockColaborador(id, c),
    deleteColaborador: mockApi.deleteMockColaborador,
    
    getFuelConfig: mockApi.getMockFuelConfig,
    updateFuelConfig: mockApi.updateMockFuelConfig,
    getFuelConfigHistory: async () => [],

    getAusencias: mockApi.getMockAusencias,
    createAusencia: mockApi.createMockAusencia,
    deleteAusencia: mockApi.deleteMockAusencia,

    checkCalculoExists: (periodo: string) => mockApi.checkMockCalculoExists(periodo).then(r => r.exists),
    saveCalculo: mockApi.saveMockCalculo,
    getRelatorioReembolso: (start: string, end: string, colabId?: string) => mockApi.getMockRelatorio(start, end, colabId),
    getRelatorioAnalitico: (start: string, end: string, colabId?: string) => mockApi.getMockRelatorioAnalitico(start, end, colabId),

    logAction: async () => {} 
};

// --- EXPORT ---
export const getSystemStatus = USE_MOCK ? MockService.getSystemStatus : RealService.getSystemStatus;
export const updateLicense = USE_MOCK ? MockService.updateLicense : RealService.updateLicense;
export const getSystemConfig = USE_MOCK ? MockService.getSystemConfig : RealService.getSystemConfig;
export const updateSystemConfig = USE_MOCK ? MockService.updateSystemConfig : RealService.updateSystemConfig;
export const login = USE_MOCK ? MockService.login : RealService.login;
export const getUsuarios = USE_MOCK ? MockService.getUsuarios : RealService.getUsuarios;
export const createUsuario = USE_MOCK ? MockService.createUsuario : RealService.createUsuario;
export const updateUsuario = USE_MOCK ? MockService.updateUsuario : RealService.updateUsuario;

export const getColaboradores = USE_MOCK ? MockService.getColaboradores : RealService.getColaboradores;
export const createColaborador = USE_MOCK ? MockService.createColaborador : RealService.createColaborador;
export const updateColaborador = USE_MOCK ? MockService.updateColaborador : RealService.updateColaborador;
export const deleteColaborador = USE_MOCK ? MockService.deleteColaborador : RealService.deleteColaborador;

export const getFuelConfig = USE_MOCK ? MockService.getFuelConfig : RealService.getFuelConfig;
export const updateFuelConfig = USE_MOCK ? MockService.updateFuelConfig : RealService.updateFuelConfig;
export const getFuelConfigHistory = USE_MOCK ? MockService.getFuelConfigHistory : RealService.getFuelConfigHistory;

export const getAusencias = USE_MOCK ? MockService.getAusencias : RealService.getAusencias;
export const createAusencia = USE_MOCK ? MockService.createAusencia : RealService.createAusencia;
export const deleteAusencia = USE_MOCK ? MockService.deleteAusencia : RealService.deleteAusencia;

export const checkCalculoExists = USE_MOCK ? MockService.checkCalculoExists : RealService.checkCalculoExists;
export const saveCalculo = USE_MOCK ? MockService.saveCalculo : RealService.saveCalculo;
export const getRelatorioReembolso = USE_MOCK ? MockService.getRelatorioReembolso : RealService.getRelatorioReembolso;
export const getRelatorioAnalitico = USE_MOCK ? MockService.getRelatorioAnalitico : RealService.getRelatorioAnalitico;

export const logAction = USE_MOCK ? MockService.logAction : RealService.logAction;
