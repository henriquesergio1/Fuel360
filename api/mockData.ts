
import { Colaborador, ConfigReembolso, Usuario, AuthResponse, SalvarCalculoPayload, ItemRelatorio, ItemRelatorioAnalitico, Ausencia } from '../types.ts';

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

// --- HELPER LOCAL STORAGE ---
const getStorage = (key: string, defaultVal: any) => {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultVal;
    } catch { return defaultVal; }
};

const setStorage = (key: string, val: any) => {
    localStorage.setItem(key, JSON.stringify(val));
};

// --- USUÁRIOS MOCK ---
let mockUsuarios: Usuario[] = [
    { ID_Usuario: 1, Nome: 'Administrador Mock', Usuario: 'admin', Perfil: 'Admin', Ativo: true },
    { ID_Usuario: 2, Nome: 'Operador Padrão', Usuario: 'operador', Perfil: 'Operador', Ativo: true }
];

export const mockLogin = async (usuario: string, senha: string): Promise<AuthResponse> => {
    await delay(500);
    const currentUsers = mockUsuarios; 
    const user = currentUsers.find(u => u.Usuario === usuario && u.Ativo);
    if (user && senha === usuario) {
        return { user: user, token: 'mock-jwt-token-xyz-123' };
    }
    throw new Error('Usuário ou senha incorretos (Mock: use admin/admin).');
};

export const getMockUsuarios = async (): Promise<Usuario[]> => { await delay(200); return [...mockUsuarios]; };
export const createMockUsuario = async (u: any): Promise<Usuario> => { await delay(300); const novo = { ...u, ID_Usuario: Math.random(), Ativo: true, Senha: '' }; mockUsuarios.push(novo); return novo; };
export const updateMockUsuario = async (id: number, u: any): Promise<Usuario> => { await delay(300); const idx = mockUsuarios.findIndex(us => us.ID_Usuario === id); if (idx > -1) { mockUsuarios[idx] = { ...mockUsuarios[idx], ...u }; return mockUsuarios[idx]; } throw new Error("Usuário não encontrado"); };

// --- DADOS REEMBOLSO ---
let mockColaboradores: Colaborador[] = getStorage('MOCK_COLABORADORES', [
    { ID_Colaborador: 1, ID_Pulsus: 550, CodigoSetor: 101, Nome: 'João da Silva', Grupo: 'Vendedor', TipoVeiculo: 'Carro', Ativo: true },
    { ID_Colaborador: 2, ID_Pulsus: 551, CodigoSetor: 102, Nome: 'Maria Oliveira', Grupo: 'Vendedor', TipoVeiculo: 'Carro', Ativo: true },
    { ID_Colaborador: 3, ID_Pulsus: 600, CodigoSetor: 201, Nome: 'Pedro Moto', Grupo: 'Promotor', TipoVeiculo: 'Moto', Ativo: true },
    { ID_Colaborador: 4, ID_Pulsus: 700, CodigoSetor: 301, Nome: 'Carlos Sup', Grupo: 'Supervisor', TipoVeiculo: 'Carro', Ativo: true },
]);

let mockConfig: ConfigReembolso = getStorage('MOCK_CONFIG', {
    PrecoCombustivel: 5.89,
    KmL_Carro: 10,
    KmL_Moto: 35
});

export const getMockColaboradores = async (): Promise<Colaborador[]> => { 
    await delay(100); 
    return [...mockColaboradores]; 
};

export const createMockColaborador = async (c: Colaborador): Promise<Colaborador> => { 
    await delay(100); 
    const novo = { ...c, ID_Colaborador: Date.now() }; 
    mockColaboradores.push(novo); 
    setStorage('MOCK_COLABORADORES', mockColaboradores);
    return novo; 
};

export const updateMockColaborador = async (id: number, c: Colaborador): Promise<Colaborador> => { 
    await delay(100); 
    const idx = mockColaboradores.findIndex(i => i.ID_Colaborador === id); 
    if (idx > -1) {
        mockColaboradores[idx] = c; 
        setStorage('MOCK_COLABORADORES', mockColaboradores);
    }
    return c; 
};

export const deleteMockColaborador = async (id: number): Promise<void> => { 
    await delay(100); 
    mockColaboradores = mockColaboradores.filter(c => c.ID_Colaborador !== id); 
    setStorage('MOCK_COLABORADORES', mockColaboradores);
};

export const getMockFuelConfig = async (): Promise<ConfigReembolso> => { await delay(50); return mockConfig; };
export const updateMockFuelConfig = async (c: ConfigReembolso): Promise<void> => { 
    await delay(50); 
    mockConfig = c; 
    setStorage('MOCK_CONFIG', mockConfig);
};

// --- GESTÃO DE AUSÊNCIAS (MOCK) ---
export const getMockAusencias = async (): Promise<Ausencia[]> => {
    await delay(100);
    const ausencias: Ausencia[] = getStorage('MOCK_AUSENCIAS', []);
    
    // Join manual para popular nomes e IDs pulsus
    return ausencias.map(a => {
        const colab = mockColaboradores.find(c => c.ID_Colaborador === a.ID_Colaborador);
        return {
            ...a,
            NomeColaborador: colab?.Nome || 'Desconhecido',
            ID_Pulsus: colab?.ID_Pulsus || 0
        };
    }).sort((a,b) => new Date(b.DataInicio).getTime() - new Date(a.DataInicio).getTime());
};

export const createMockAusencia = async (a: any): Promise<Ausencia> => {
    await delay(200);
    const ausencias: Ausencia[] = getStorage('MOCK_AUSENCIAS', []);
    const nova: Ausencia = {
        ID_Ausencia: Date.now(),
        ID_Colaborador: a.ID_Colaborador,
        DataInicio: a.DataInicio,
        DataFim: a.DataFim,
        Motivo: a.Motivo
    };
    ausencias.push(nova);
    setStorage('MOCK_AUSENCIAS', ausencias);
    
    // Retornar populado
    const colab = mockColaboradores.find(c => c.ID_Colaborador === a.ID_Colaborador);
    return {
        ...nova,
        NomeColaborador: colab?.Nome,
        ID_Pulsus: colab?.ID_Pulsus
    };
};

export const deleteMockAusencia = async (id: number, motivo: string): Promise<void> => {
    await delay(100);
    console.log(`[MOCK AUDIT] Deleting Absence ${id}. Reason: ${motivo}`);
    let ausencias: Ausencia[] = getStorage('MOCK_AUSENCIAS', []);
    ausencias = ausencias.filter(a => a.ID_Ausencia !== id);
    setStorage('MOCK_AUSENCIAS', ausencias);
};


// --- HISTÓRICO E RELATÓRIOS (MOCK) ---

interface MockHeader {
    ID_Calculo: number;
    DataGeracao: string;
    PeriodoReferencia: string;
    UsuarioGerador: string;
    TotalGeral: number;
}

interface MockDetail {
    ID_Detalhe: number;
    ID_Calculo: number;
    ID_Pulsus: number;
    NomeColaborador: string;
    Grupo: string;
    TipoVeiculo: string;
    TotalKM: number;
    ValorReembolso: number;
    ParametroPreco: number;
    ParametroKmL: number;
}

interface MockDaily {
    ID_Diario: number;
    ID_Detalhe: number;
    DataOcorrencia: string;
    KM_Dia: number;
    Valor_Dia: number;
    Observacao?: string; // Novo
}

// Verificação de Existência (Mock)
export const checkMockCalculoExists = async (periodo: string): Promise<{exists: boolean}> => {
    await delay(200);
    const headers: MockHeader[] = getStorage('MOCK_REL_HEADERS', []);
    return { exists: headers.some(h => h.PeriodoReferencia === periodo) };
};

export const saveMockCalculo = async (payload: SalvarCalculoPayload): Promise<{success: boolean, id: number}> => {
    await delay(800);
    
    let headers: MockHeader[] = getStorage('MOCK_REL_HEADERS', []);
    let details: MockDetail[] = getStorage('MOCK_REL_DETAILS', []);
    let daily: MockDaily[] = getStorage('MOCK_REL_DAILY', []);

    // Se overwrite, deletar registros antigos desse periodo
    if (payload.Overwrite) {
        // Log Mock Action
        console.log(`[MOCK AUDIT] Overwriting period: ${payload.Periodo}. Reason: ${payload.MotivoOverwrite}`);
        
        const idsToRemove = headers.filter(h => h.PeriodoReferencia === payload.Periodo).map(h => h.ID_Calculo);
        const idsSet = new Set(idsToRemove);

        headers = headers.filter(h => !idsSet.has(h.ID_Calculo));
        
        // Find details to remove to cleanup daily
        const detailIdsToRemove = details.filter(d => idsSet.has(d.ID_Calculo)).map(d => d.ID_Detalhe);
        const detailIdsSet = new Set(detailIdsToRemove);

        details = details.filter(d => !idsSet.has(d.ID_Calculo));
        daily = daily.filter(d => !detailIdsSet.has(d.ID_Detalhe));
    }

    const newId = Date.now();
    const userStr = localStorage.getItem('AUTH_USER');
    const user = userStr ? JSON.parse(userStr).Usuario : 'mock_user';

    const newHeader: MockHeader = {
        ID_Calculo: newId,
        DataGeracao: new Date().toISOString(),
        PeriodoReferencia: payload.Periodo,
        UsuarioGerador: user,
        TotalGeral: payload.TotalGeral
    };

    const newDetails: MockDetail[] = [];
    const newDaily: MockDaily[] = [];

    let detailIdCounter = Date.now();
    let dailyIdCounter = Date.now();

    payload.Itens.forEach((item) => {
        detailIdCounter++;
        const detId = detailIdCounter;

        newDetails.push({
            ID_Detalhe: detId,
            ID_Calculo: newId,
            ID_Pulsus: item.ID_Pulsus,
            NomeColaborador: item.Nome,
            Grupo: item.Grupo,
            TipoVeiculo: item.TipoVeiculo,
            TotalKM: item.TotalKM,
            ValorReembolso: item.ValorReembolso,
            ParametroPreco: item.ParametroPreco,
            ParametroKmL: item.ParametroKmL
        });

        if (item.RegistrosDiarios) {
            item.RegistrosDiarios.forEach(reg => {
                dailyIdCounter++;
                newDaily.push({
                    ID_Diario: dailyIdCounter,
                    ID_Detalhe: detId,
                    DataOcorrencia: reg.Data, // ISO String expected
                    KM_Dia: reg.KM,
                    Valor_Dia: reg.Valor,
                    Observacao: reg.Observacao
                });
            });
        }
    });

    headers.push(newHeader);
    const updatedDetails = [...details, ...newDetails];
    const updatedDaily = [...daily, ...newDaily];

    setStorage('MOCK_REL_HEADERS', headers);
    setStorage('MOCK_REL_DETAILS', updatedDetails);
    setStorage('MOCK_REL_DAILY', updatedDaily);

    return { success: true, id: newId };
};

export const getMockRelatorio = async (startDate: string, endDate: string, colabId?: string): Promise<ItemRelatorio[]> => {
    await delay(600);
    const headers: MockHeader[] = getStorage('MOCK_REL_HEADERS', []);
    const details: MockDetail[] = getStorage('MOCK_REL_DETAILS', []);

    const start = new Date(startDate + 'T00:00:00').getTime();
    const end = new Date(endDate + 'T23:59:59').getTime();

    const filteredHeaders = headers.filter(h => {
        const hDate = new Date(h.DataGeracao).getTime();
        return hDate >= start && hDate <= end;
    });

    const validCalculoIds = new Set(filteredHeaders.map(h => h.ID_Calculo));

    let result: ItemRelatorio[] = [];

    details.forEach(d => {
        if (validCalculoIds.has(d.ID_Calculo)) {
            if (colabId && d.ID_Pulsus.toString() !== colabId) return;

            const header = filteredHeaders.find(h => h.ID_Calculo === d.ID_Calculo);
            if (header) {
                result.push({
                    ID_Detalhe: d.ID_Detalhe,
                    DataGeracao: header.DataGeracao,
                    PeriodoReferencia: header.PeriodoReferencia,
                    UsuarioGerador: header.UsuarioGerador,
                    ID_Pulsus: d.ID_Pulsus,
                    NomeColaborador: d.NomeColaborador,
                    Grupo: d.Grupo,
                    TipoVeiculo: d.TipoVeiculo,
                    TotalKM: d.TotalKM,
                    ValorReembolso: d.ValorReembolso,
                    ParametroPreco: d.ParametroPreco,
                    ParametroKmL: d.ParametroKmL
                });
            }
        }
    });

    return result.sort((a, b) => new Date(b.DataGeracao).getTime() - new Date(a.DataGeracao).getTime());
};

export const getMockRelatorioAnalitico = async (startDate: string, endDate: string, colabId?: string): Promise<ItemRelatorioAnalitico[]> => {
    await delay(700);
    const headers: MockHeader[] = getStorage('MOCK_REL_HEADERS', []);
    const details: MockDetail[] = getStorage('MOCK_REL_DETAILS', []);
    const daily: MockDaily[] = getStorage('MOCK_REL_DAILY', []);

    const start = new Date(startDate + 'T00:00:00').getTime();
    const end = new Date(endDate + 'T23:59:59').getTime();

    const filteredHeaders = headers.filter(h => {
        const hDate = new Date(h.DataGeracao).getTime();
        return hDate >= start && hDate <= end;
    });

    const validCalculoIds = new Set(filteredHeaders.map(h => h.ID_Calculo));

    let result: ItemRelatorioAnalitico[] = [];

    // Filter details based on valid headers
    const filteredDetails = details.filter(d => {
        if(!validCalculoIds.has(d.ID_Calculo)) return false;
        if(colabId && d.ID_Pulsus.toString() !== colabId) return false;
        return true;
    });

    const validDetailIds = new Set(filteredDetails.map(d => d.ID_Detalhe));

    daily.forEach(dia => {
        if(validDetailIds.has(dia.ID_Detalhe)) {
            const detail = filteredDetails.find(d => d.ID_Detalhe === dia.ID_Detalhe);
            const header = filteredHeaders.find(h => h.ID_Calculo === detail?.ID_Calculo);

            if(detail && header) {
                result.push({
                    ID_Diario: dia.ID_Diario,
                    DataOcorrencia: dia.DataOcorrencia,
                    KM_Dia: dia.KM_Dia,
                    Valor_Dia: dia.Valor_Dia,
                    Observacao: dia.Observacao,
                    ID_Pulsus: detail.ID_Pulsus,
                    NomeColaborador: detail.NomeColaborador,
                    Grupo: detail.Grupo,
                    TipoVeiculo: detail.TipoVeiculo,
                    DataGeracao: header.DataGeracao,
                    PeriodoReferencia: header.PeriodoReferencia
                });
            }
        }
    });

    return result.sort((a, b) => {
        // Sort by Colaborador then Date
        if(a.NomeColaborador < b.NomeColaborador) return -1;
        if(a.NomeColaborador > b.NomeColaborador) return 1;
        return new Date(a.DataOcorrencia).getTime() - new Date(b.DataOcorrencia).getTime();
    });
};
