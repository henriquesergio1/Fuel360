import { VisitaPrevista } from '../types.ts';

// --- ROTEIRIZADOR (MOCK) ---
export const getMockVisitasPrevistas = (): VisitaPrevista[] => {
    // Gera algumas visitas fakes em SP
    const baseLat = -23.55052;
    const baseLng = -46.633308;
    
    return [
        {
            Cod_Vend: 550, Nome_Vendedor: "João da Silva", Cod_Supervisor: 700, Nome_Supervisor: "Carlos Sup",
            Cod_Cliente: 1001, Razao_Social: "Mercado Central", Dia_Semana: "Segunda", Periodicidade: "Semanal",
            Data_da_Visita: new Date().toISOString(), Endereco: "Av Paulista 1000", Bairro: "Bela Vista", Cidade: "São Paulo", CEP: "01310-100",
            Lat: baseLat, Long: baseLng
        },
        {
            Cod_Vend: 550, Nome_Vendedor: "João da Silva", Cod_Supervisor: 700, Nome_Supervisor: "Carlos Sup",
            Cod_Cliente: 1002, Razao_Social: "Padaria do Zé", Dia_Semana: "Segunda", Periodicidade: "Semanal",
            Data_da_Visita: new Date().toISOString(), Endereco: "Rua Augusta 500", Bairro: "Consolação", Cidade: "São Paulo", CEP: "01305-000",
            Lat: baseLat + 0.01, Long: baseLng + 0.01
        },
        {
            Cod_Vend: 550, Nome_Vendedor: "João da Silva", Cod_Supervisor: 700, Nome_Supervisor: "Carlos Sup",
            Cod_Cliente: 1003, Razao_Social: "Supermercado Extra", Dia_Semana: "Segunda", Periodicidade: "Semanal",
            Data_da_Visita: new Date().toISOString(), Endereco: "Rua da Consolação 2000", Bairro: "Consolação", Cidade: "São Paulo", CEP: "01301-000",
            Lat: baseLat - 0.01, Long: baseLng - 0.005
        }
    ];
};