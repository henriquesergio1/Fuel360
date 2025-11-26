

// Tipos Básicos do Sistema
export interface SystemConfig {
    companyName: string;
    logoUrl: string;
}

export interface LicenseStatus {
    status: 'ACTIVE' | 'EXPIRED' | 'INVALID' | 'MISSING';
    client?: string;
    expiresAt?: Date;
}

export interface Usuario {
    ID_Usuario: number;
    Nome: string;
    Usuario: string;
    Perfil: 'Admin' | 'Operador';
    Ativo: boolean;
    Senha?: string;
    DataCriacao?: string;
}

export interface AuthResponse {
    user: Usuario;
    token: string;
}

// --- FUEL360: REEMBOLSO ---

export type TipoVeiculoReembolso = 'Carro' | 'Moto';

export interface Colaborador {
    ID_Colaborador: number;
    ID_Pulsus: number; // ID vindo do CSV. Único Globalmente.
    CodigoSetor: number; // Código do setor (ex: 101). Único por Grupo.
    Nome: string;
    Grupo: string; // Vendedor, Promotor, Supervisor
    TipoVeiculo: TipoVeiculoReembolso;
    Ativo: boolean;
    
    // Auditoria
    UsuarioCriacao?: string;
    DataCriacao?: string;
    UsuarioAlteracao?: string;
    DataAlteracao?: string;
    MotivoAlteracao?: string;
}

// Novo v1.4.6: Importação Externa Refatorada
export interface IntegrationConfig {
    extDb_Host: string;
    extDb_Port: number;
    extDb_User: string;
    extDb_Pass?: string; // Opcional no retorno do get
    extDb_Database: string;
    extDb_Query: string;
}

export interface DiffItem {
    id_pulsus: number;
    nome: string;
    changes: {
        field: string;
        oldValue: any;
        newValue: any;
    }[];
    newData: {
        id_pulsus: number;
        nome: string;
        codigo_setor: number;
        grupo: string;
    }
}

export interface ImportPreviewResult {
    novos: DiffItem[];
    alterados: DiffItem[];
    totalExternal: number;
}

// Novo v1.3.7: Gestão de Ausências
export interface Ausencia {
    ID_Ausencia: number;
    ID_Colaborador: number;
    ID_Pulsus?: number; // Auxiliar para exibição/lógica
    NomeColaborador?: string; // Auxiliar para exibição
    DataInicio: string; // YYYY-MM-DD
    DataFim: string; // YYYY-MM-DD
    Motivo: string;
}

export interface ConfigReembolso {
    PrecoCombustivel: number;
    KmL_Carro: number;
    KmL_Moto: number;
    
    // Auditoria
    UsuarioAlteracao?: string;
    DataAlteracao?: string;
    MotivoAlteracao?: string;
}

export interface LogSistema {
    ID_Log: number;
    DataHora: string;
    Usuario: string;
    Acao: string;
    Detalhes: string;
}

export interface RegistroKM {
    ID_Pulsus: number;
    Nome: string;
    Grupo: string;
    Data: string;
    KM: number;
    ValorCalculado?: number; // Auxiliar
    // Novo v1.4.0
    Observacao?: string;
}

export interface CalculoReembolso {
    Colaborador: Colaborador;
    TotalKM: number;
    LitrosEstimados: number;
    ValorPagar: number;
    Registros: RegistroKM[]; // Detalhe dos dias
}

// --- RELATÓRIOS E HISTÓRICO ---

export interface SalvarCalculoPayload {
    Periodo: string;
    TotalGeral: number;
    Overwrite?: boolean; // Novo v1.3.8: Sobrescrever se existir
    MotivoOverwrite?: string; // Novo v1.3.9: Justificativa obrigatória para auditoria
    Itens: {
        ID_Pulsus: number;
        Nome: string;
        Grupo: string;
        TipoVeiculo: string;
        TotalKM: number;
        ValorReembolso: number;
        ParametroPreco: number;
        ParametroKmL: number;
        // Novo v1.3.6: Detalhamento diário para salvar
        RegistrosDiarios: {
            Data: string;
            KM: number;
            Valor: number;
            Observacao?: string; // Novo v1.4.0
        }[];
    }[];
}

// Relatório Sintético (Resumido por colaborador)
export interface ItemRelatorio {
    ID_Detalhe: number;
    DataGeracao: string;
    PeriodoReferencia: string;
    UsuarioGerador: string;
    ID_Pulsus: number;
    NomeColaborador: string;
    Grupo: string;
    TipoVeiculo: string;
    TotalKM: number;
    ValorReembolso: number;
    ParametroPreco: number;
    ParametroKmL: number;
}

// Relatório Analítico (Detalhado dia a dia) - Novo v1.3.6
export interface ItemRelatorioAnalitico {
    ID_Diario: number;
    DataOcorrencia: string;
    KM_Dia: number;
    Valor_Dia: number;
    Observacao?: string; // Novo v1.4.0
    // Dados 'flattened' do pai
    ID_Pulsus: number;
    NomeColaborador: string;
    Grupo: string;
    TipoVeiculo: string;
    DataGeracao: string;
    PeriodoReferencia: string;
}