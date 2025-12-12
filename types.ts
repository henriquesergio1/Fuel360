
export interface Usuario {
    ID_Usuario: number;
    Nome: string;
    Usuario: string;
    Senha?: string;
    Perfil: 'Admin' | 'Operador';
    Ativo: boolean;
}

export interface AuthResponse {
    token: string;
    user: Usuario;
}

export type TipoVeiculoReembolso = 'Carro' | 'Moto';

export interface Colaborador {
    ID_Colaborador: number;
    ID_Pulsus: number;
    CodigoSetor: number;
    Nome: string;
    Grupo: string;
    TipoVeiculo: TipoVeiculoReembolso;
    Ativo: boolean;
    UsuarioAlteracao?: string;
    MotivoAlteracao?: string;
}

export interface ConfigReembolso {
    PrecoCombustivel: number;
    KmL_Carro: number;
    KmL_Moto: number;
    MotivoAlteracao?: string;
}

export interface LicenseStatus {
    status: 'ACTIVE' | 'EXPIRED' | 'INVALID';
    client?: string;
    expiresAt?: string;
}

export interface SystemConfig {
    companyName: string;
    logoUrl: string;
}

export interface LogSistema {
    ID_Log: number;
    DataHora: string;
    Usuario: string;
    Acao: string;
    Detalhes: string;
}

export interface Ausencia {
    ID_Ausencia: number;
    ID_Colaborador: number;
    NomeColaborador?: string;
    ID_Pulsus?: number;
    DataInicio: string; // ISO Date YYYY-MM-DD
    DataFim: string; // ISO Date YYYY-MM-DD
    Motivo: string;
}

export interface DbConnectionConfig {
    host: string;
    port: number;
    user: string;
    pass: string;
    database: string;
    query: string;
    type: 'MARIADB' | 'MSSQL'; // Tipo do banco
}

export interface IntegrationConfig {
    colab: DbConnectionConfig;
    route: DbConnectionConfig;
}

export interface DiffItem {
    id_pulsus: number;
    nome: string;
    matchType: 'FULL_MATCH' | 'ID_MATCH' | 'NAME_MATCH' | 'NO_MATCH';
    newData: {
        codigo_setor: number;
        grupo: string;
    };
    existingColab?: Colaborador;
    changes: { field: string, oldValue: any, newValue: any }[];
    syncAction?: 'UPDATE_DATA' | 'UPDATE_ID' | 'INSERT';
}

export interface ImportPreviewResult {
    novos: DiffItem[];
    alterados: DiffItem[];
    conflitos: DiffItem[];
    totalExternal: number;
}

export interface SalvarCalculoPayload {
    Periodo: string;
    TotalGeral: number;
    Overwrite?: boolean;
    MotivoOverwrite?: string;
    Itens: {
        ID_Pulsus: number;
        Nome: string;
        Grupo: string;
        TipoVeiculo: string;
        TotalKM: number;
        ValorReembolso: number;
        ParametroPreco: number;
        ParametroKmL: number;
        RegistrosDiarios: {
            Data: string;
            KM: number;
            Valor: number;
            Observacao?: string;
        }[];
    }[];
}

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

export interface ItemRelatorioAnalitico {
    ID_Diario: number;
    DataOcorrencia: string;
    KM_Dia: number;
    Valor_Dia: number;
    Observacao?: string;
    ID_Pulsus: number;
    NomeColaborador: string;
    Grupo: string;
    TipoVeiculo: string;
    DataGeracao: string;
    PeriodoReferencia: string;
    TemAusencia?: boolean;
    MotivoAusencia?: string;
}

export interface VisitaPrevista {
    Cod_Vend: number;
    Nome_Vendedor: string;
    Cod_Supervisor: number;
    Nome_Supervisor: string;
    Cod_Cliente: number;
    Razao_Social: string;
    Dia_Semana: string;
    Periodicidade: string;
    Data_da_Visita: string; // ISO Date
    Endereco: string;
    Bairro: string;
    Cidade: string;
    CEP: string;
    Lat: number;
    Long: number;
}

export interface RotaCalculada {
    Vendedor: string;
    Data: string;
    Visitas: VisitaPrevista[];
    DistanciaReta: number;
    DistanciaEstimada: number; // Com fator de tortuosidade
}

export interface CalculoReembolso {
    Colaborador: Colaborador;
    TotalKM: number;
    LitrosEstimados: number;
    ValorPagar: number;
    Registros: RegistroKM[];
}

export interface RegistroKM {
    ID_Pulsus: number;
    Nome: string;
    Grupo: string;
    Data: string;
    KM: number;
    ValorCalculado: number;
    Observacao: string;
}

export interface StagingRecord {
    id: string;
    id_pulsus: number;
    nome: string;
    dataOriginal: string;
    dataISO: string;
    kmOriginal: number;
    kmConsiderado: number;
    isLowKm: boolean;
    isBlocked: boolean;
    blockReason: string;
    isEdited: boolean;
    editReason?: string;
    colaboradorRef?: Colaborador;
}
