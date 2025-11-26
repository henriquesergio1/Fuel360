













import React, { useState, useContext } from 'react';
import { DataContext } from '../context/DataContext.tsx';
import { UploadIcon, DropIcon, CarIcon, MotoIcon, PrinterIcon, ExclamationIcon, CheckCircleIcon, SpinnerIcon, DocumentReportIcon, CalculatorIcon } from './icons.tsx';
import { CalculoReembolso, RegistroKM, SalvarCalculoPayload } from '../types.ts';
import { saveCalculo, checkCalculoExists } from '../services/apiService.ts';
import Papa from 'papaparse';

const ReportPrint: React.FC<{ dados: CalculoReembolso[], periodo: string, onClose: () => void }> = ({ dados, periodo, onClose }) => {
    const { configReembolso, logSystemAction } = useContext(DataContext);
    
    const handlePrint = () => {
        logSystemAction('IMPRESSAO_RELATORIO', `Imprimiu relatório de reembolso. Período: ${periodo}. Total Colaboradores: ${dados.length}`);
        window.print();
    };

    const totalPagar = dados.reduce((acc, item) => acc + item.ValorPagar, 0);
    const totalKM = dados.reduce((acc, item) => acc + item.TotalKM, 0);

    return (
        <div className="fixed inset-0 z-[100] bg-white text-black overflow-auto">
            <div className="p-4 bg-slate-900 flex justify-between items-center print:hidden sticky top-0 border-b border-slate-800 shadow-md">
                <h2 className="text-white font-bold text-lg">Visualização de Impressão</h2>
                <div className="space-x-3">
                    <button onClick={handlePrint} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-500 transition">Imprimir</button>
                    <button onClick={onClose} className="bg-slate-700 text-white px-6 py-2 rounded-lg font-bold hover:bg-slate-600 transition">Fechar</button>
                </div>
            </div>

            <div className="p-10 max-w-5xl mx-auto print:p-0 print:max-w-none font-sans">
                <div className="text-center border-b-2 border-black pb-6 mb-8">
                    <h1 className="text-3xl font-extrabold uppercase tracking-wide text-slate-900">Relatório de Reembolso</h1>
                    <p className="text-sm text-slate-600 mt-1">Período de Referência: {periodo || 'Geral'}</p>
                </div>

                <div className="flex justify-between mb-8 text-sm bg-slate-100 p-6 rounded-xl print:bg-transparent print:border print:border-slate-300">
                    <div className="space-y-1 text-slate-800">
                        <p><strong>Preço Combustível:</strong> R$ {configReembolso.PrecoCombustivel.toFixed(2)} / Litro</p>
                        <p><strong>Média Carro:</strong> {configReembolso.KmL_Carro} km/l</p>
                        <p><strong>Média Moto:</strong> {configReembolso.KmL_Moto} km/l</p>
                    </div>
                    <div className="text-right text-slate-800">
                        <p><strong>Total KM Percorrido:</strong> {totalKM.toFixed(2)} km</p>
                        <p className="text-2xl font-bold mt-2 text-slate-900">Total Geral: R$ {totalPagar.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    </div>
                </div>

                <table className="w-full text-sm border-collapse border border-slate-300">
                    <thead>
                        <tr className="bg-slate-200 text-slate-700 uppercase text-xs tracking-wider">
                            <th className="border border-slate-300 p-3 text-left">Colaborador</th>
                            <th className="border border-slate-300 p-3 text-left">Setor / Grupo</th>
                            <th className="border border-slate-300 p-3 text-center">Veículo</th>
                            <th className="border border-slate-300 p-3 text-right">Total KM</th>
                            <th className="border border-slate-300 p-3 text-right">Litros Est.</th>
                            <th className="border border-slate-300 p-3 text-right">Valor (R$)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {dados.map((item) => (
                            <tr key={item.Colaborador.ID_Pulsus} className="even:bg-slate-50 hover:bg-slate-100 transition-colors">
                                <td className="border border-slate-300 p-3">
                                    <div className="font-bold text-slate-800">{item.Colaborador.Nome}</div>
                                    <div className="text-xs text-slate-500">ID: {item.Colaborador.ID_Pulsus}</div>
                                </td>
                                <td className="border border-slate-300 p-3">
                                    <div className="font-medium text-slate-700">{item.Colaborador.Grupo}</div>
                                    <div className="text-xs text-slate-500">Setor: {item.Colaborador.CodigoSetor}</div>
                                </td>
                                <td className="border border-slate-300 p-3 text-center">
                                    <span className="font-bold text-slate-700">{item.Colaborador.TipoVeiculo}</span>
                                    <div className="text-[10px] text-slate-500 mt-0.5">
                                        {item.Colaborador.TipoVeiculo === 'Carro' ? configReembolso.KmL_Carro : configReembolso.KmL_Moto} km/l
                                    </div>
                                </td>
                                <td className="border border-slate-300 p-3 text-right font-mono text-slate-800">{item.TotalKM.toFixed(2)}</td>
                                <td className="border border-slate-300 p-3 text-right font-mono text-slate-800">{item.LitrosEstimados.toFixed(2)}</td>
                                <td className="border border-slate-300 p-3 text-right font-bold text-slate-900 bg-slate-100 print:bg-transparent">
                                    {item.ValorPagar.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                
                <div className="mt-12 text-[10px] text-slate-400 text-center uppercase tracking-widest">
                    Gerado pelo sistema Fuel360 em {new Date().toLocaleDateString()}
                </div>
            </div>
        </div>
    );
};

// --- MODAL DE CONFIRMAÇÃO DE SOBRESCRITA COM AUDITORIA ---
const OverwriteModal: React.FC<{ 
    isOpen: boolean; 
    periodo: string; 
    onClose: () => void; 
    onConfirm: (motivo: string) => void; 
    isLoading: boolean;
}> = ({ isOpen, periodo, onClose, onConfirm, isLoading }) => {
    const [motivo, setMotivo] = useState('');

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-8 w-full max-w-md">
                <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-6">
                    <ExclamationIcon className="w-8 h-8 text-amber-500"/>
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2 text-center">Cálculo Já Existente</h3>
                <p className="text-slate-600 text-sm mb-4 text-center">
                    Já existe um cálculo salvo para o período <strong>{periodo}</strong>. 
                    <br/>
                    Para sobrescrever os dados anteriores, é obrigatório informar o motivo para auditoria.
                </p>
                
                <textarea 
                    value={motivo}
                    onChange={e => setMotivo(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-4 text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent mb-6 resize-none outline-none"
                    placeholder="Motivo da sobrescrita (Obrigatório)..."
                    rows={3}
                    autoFocus
                />

                <div className="flex space-x-3 justify-center">
                    <button onClick={onClose} disabled={isLoading} className="bg-white hover:bg-slate-50 text-slate-700 px-6 py-3 rounded-xl font-bold text-sm border border-slate-200 shadow-sm transition">Cancelar</button>
                    <button 
                        onClick={() => onConfirm(motivo)} 
                        disabled={isLoading || !motivo.trim()} 
                        className="bg-amber-500 hover:bg-amber-600 text-white px-6 py-3 rounded-xl font-bold text-sm flex items-center disabled:opacity-50 shadow-lg shadow-amber-500/20 transition"
                    >
                        {isLoading ? <SpinnerIcon className="w-4 h-4 mr-2"/> : 'Confirmar e Sobrescrever'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export const Importacao: React.FC = () => {
    const { colaboradores, configReembolso, ausencias, logSystemAction } = useContext(DataContext);
    const [calculos, setCalculos] = useState<CalculoReembolso[]>([]);
    
    // Listas de bloqueios/ignorar
    const [ignoredList, setIgnoredList] = useState<{id: number, nome: string}[]>([]);
    const [blockedList, setBlockedList] = useState<{id: number, nome: string, data: string, motivo: string}[]>([]);
    
    const [isProcessing, setIsProcessing] = useState(false);
    const [showReport, setShowReport] = useState(false);
    const [periodo, setPeriodo] = useState('');
    
    // Saving states
    const [isSaving, setIsSaving] = useState(false);
    const [savedSuccess, setSavedSuccess] = useState(false);
    
    // Overwrite Logic
    const [isOverwriteModalOpen, setIsOverwriteModalOpen] = useState(false);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsProcessing(true);
        setCalculos([]);
        setIgnoredList([]);
        setBlockedList([]);
        setSavedSuccess(false); // Reset saved status on new file
        
        Papa.parse(file, {
            header: true,
            delimiter: ";",
            skipEmptyLines: true,
            complete: (results) => {
                logSystemAction('IMPORTACAO_CSV', `Arquivo importado: ${file.name}. Linhas processadas: ${results.data.length}`);
                processarDados(results.data);
                setIsProcessing(false);
            },
            error: (err) => {
                alert("Erro ao ler CSV: " + err.message);
                setIsProcessing(false);
            }
        });
    };

    /**
     * Função Universal para Normalizar Datas em Chaves de Comparação (YYYY-MM-DD)
     * Robustez extrema para evitar problemas de fuso horário ou formato.
     */
    const toIsoDateKey = (input: string | Date): string | null => {
        if (!input) return null;
        
        const s = input.toString().trim();
        
        // 1. Já é ISO Date (YYYY-MM-DD)
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

        // 2. É ISO DateTime (YYYY-MM-DDTHH:mm:ss...)
        if (s.includes('T')) return s.split('T')[0];
        
        // 3. É BR Date (DD/MM/YYYY) ou (DD-MM-YYYY)
        // Substitui traços por barras para unificar lógica
        const normalizedS = s.replace(/-/g, '/').replace(/\./g, '/');
        
        if (normalizedS.includes('/')) {
             const parts = normalizedS.split('/');
             if (parts.length === 3) {
                 const d = parts[0].padStart(2, '0');
                 const m = parts[1].padStart(2, '0');
                 const y = parts[2];
                 // Se ano for 2 digitos (ex: 25), assume 2025
                 const fullYear = y.length === 2 ? `20${y}` : y;
                 return `${fullYear}-${m}-${d}`;
             }
        }
        
        return null;
    };

    // Helper para gerar objeto Date apenas para ordenação visual do período
    const createDateFromYmd = (ymd: string): Date => {
        const [y, m, d] = ymd.split('-').map(Number);
        return new Date(y, m - 1, d);
    }

    const processarDados = (rows: any[]) => {
        const agrupado = new Map<number, RegistroKM[]>();
        const allDateKeys: string[] = [];
        const registrosBloqueados: {id: number, nome: string, data: string, motivo: string}[] = [];

        console.log("--- INICIANDO PROCESSAMENTO DO CSV ---");
        console.log(`Colaboradores cadastrados: ${colaboradores.length}`);
        console.log(`Ausências cadastradas: ${ausencias.length}`);

        rows.forEach((row, index) => {
            const id = parseInt(row['ID Pulsus']);
            const nome = row['Nome'] && row['Nome'].trim() ? row['Nome'].trim() : `Colaborador ${id}`;
            const kmStr = row['Estimativa de distância percorrida (KM)'];
            const km = parseFloat(kmStr ? kmStr.replace(',', '.') : '0'); 
            const dateStr = row['Data']; // Ex: 17/11/2025

            if (!isNaN(id) && !isNaN(km)) {
                
                // Normaliza a data do CSV para string YYYY-MM-DD (Chave de Comparação)
                const csvDateKey = toIsoDateKey(dateStr);
                
                let kmConsiderado = km;
                let observacao = '';
                
                // --- LÓGICA DE BLOQUEIO POR AUSÊNCIA ---
                const colabCadastrado = colaboradores.find(c => c.ID_Pulsus === id);
                
                if (csvDateKey && colabCadastrado) {
                    
                    const ausenciaEncontrada = ausencias.find(aus => {
                        // 1. Verifica se a ausência pertence a este colaborador (Comparando Internal IDs)
                        // IMPORTANTE: Garantir que comparação seja number vs number
                        if (Number(aus.ID_Colaborador) !== Number(colabCadastrado.ID_Colaborador)) return false;
                        
                        // 2. Normaliza datas da ausência para YYYY-MM-DD
                        const startKey = toIsoDateKey(aus.DataInicio);
                        const endKey = toIsoDateKey(aus.DataFim);
                        
                        // Se as datas da ausência forem inválidas, ignora
                        if (!startKey || !endKey) return false;
                        
                        // 3. Comparação de Strings (YYYY-MM-DD permite comparação lexicográfica correta)
                        const match = csvDateKey >= startKey && csvDateKey <= endKey;
                        
                        if (match) {
                            console.log(`[DEBUG AUSENCIA] BLOQUEIO DETECTADO!`);
                            console.log(`  Row ${index}: Colab ID ${id} (${colabCadastrado.Nome})`);
                            console.log(`  Data CSV: ${dateStr} -> Chave: ${csvDateKey}`);
                            console.log(`  Ausência: ${aus.Motivo} | ${aus.DataInicio} -> ${startKey} até ${aus.DataFim} -> ${endKey}`);
                        }

                        return match;
                    });

                    if (ausenciaEncontrada) {
                        registrosBloqueados.push({
                            id,
                            nome,
                            data: dateStr, // Mantém original para exibição
                            motivo: ausenciaEncontrada.Motivo
                        });
                        
                        // ZERAR VALORES
                        kmConsiderado = 0;
                        observacao = osbFormat(ausenciaEncontrada.Motivo);
                    }
                    
                    allDateKeys.push(csvDateKey);
                }
                // ----------------------------------------

                if (!agrupado.has(id)) {
                    agrupado.set(id, []);
                }
                
                // Preparando registro
                const registro: RegistroKM = {
                    ID_Pulsus: id,
                    Nome: nome,
                    Grupo: row['Grupo'] || 'Geral',
                    Data: dateStr, // Guarda string original PT-BR
                    KM: kmConsiderado,
                    Observacao: observacao
                };

                agrupado.get(id)?.push(registro);
            }
        });

        // Determinar Período
        if(allDateKeys.length > 0) {
            allDateKeys.sort();
            const minKey = allDateKeys[0];
            const maxKey = allDateKeys[allDateKeys.length - 1];
            
            const minDate = createDateFromYmd(minKey);
            const maxDate = createDateFromYmd(maxKey);
            
            setPeriodo(`${minDate.toLocaleDateString('pt-BR')} até ${maxDate.toLocaleDateString('pt-BR')}`);
        } else {
            setPeriodo('Período não identificado');
        }

        const resultadoFinal: CalculoReembolso[] = [];
        const ignorados: {id: number, nome: string}[] = [];

        agrupado.forEach((registros, id) => {
            let colaborador = colaboradores.find(c => c.ID_Pulsus === id);
            
            if (!colaborador) {
                ignorados.push({ id, nome: registros[0].Nome });
                return; 
            }

            const totalKM = registros.reduce((sum, r) => sum + r.KM, 0);
            const eficiencia = colaborador.TipoVeiculo === 'Moto' ? configReembolso.KmL_Moto : configReembolso.KmL_Carro;
            const litros = totalKM / eficiencia;
            const valor = litros * configReembolso.PrecoCombustivel;
            
            // Calculando valor individual (se KM=0, valor=0)
            const valorPorKm = configReembolso.PrecoCombustivel / eficiencia;
            const registrosComValor = registros.map(r => ({
                ...r,
                ValorCalculado: r.KM * valorPorKm
            }));

            resultadoFinal.push({
                Colaborador: colaborador,
                TotalKM: totalKM,
                LitrosEstimados: litros,
                ValorPagar: valor,
                Registros: registrosComValor
            });
        });

        setIgnoredList(ignorados);
        setBlockedList(registrosBloqueados);
        setCalculos(resultadoFinal);
    };

    const osbFormat = (motivo: string) => {
        if(motivo === 'Falta Justificada') return 'Falta Just.';
        if(motivo === 'Falta Injustificada') return 'Falta Inj.';
        if(motivo === 'Atestado Médico') return 'Atestado';
        return motivo;
    }

    const initiateSave = async () => {
        if (!calculos.length) return;
        
        setIsSaving(true);
        try {
            const exists = await checkCalculoExists(periodo);
            if (exists) {
                setIsOverwriteModalOpen(true);
                setIsSaving(false);
            } else {
                performSave(false);
            }
        } catch (e: any) {
             alert("Erro ao verificar histórico: " + e.message);
             setIsSaving(false);
        }
    };

    const performSave = async (overwrite: boolean, motivoOverwrite?: string) => {
        setIsSaving(true);
        try {
            const payload: SalvarCalculoPayload = {
                Periodo: periodo || 'Período Desconhecido',
                TotalGeral: calculos.reduce((acc, curr) => acc + curr.ValorPagar, 0),
                Overwrite: overwrite,
                MotivoOverwrite: motivoOverwrite,
                Itens: calculos.map(c => ({
                    ID_Pulsus: c.Colaborador.ID_Pulsus,
                    Nome: c.Colaborador.Nome,
                    Grupo: c.Colaborador.Grupo,
                    TipoVeiculo: c.Colaborador.TipoVeiculo,
                    TotalKM: c.TotalKM,
                    ValorReembolso: c.ValorPagar,
                    ParametroPreco: configReembolso.PrecoCombustivel,
                    ParametroKmL: c.Colaborador.TipoVeiculo === 'Carro' ? configReembolso.KmL_Carro : configReembolso.KmL_Moto,
                    
                    RegistrosDiarios: c.Registros.map(reg => {
                        // Assegura que salvamos no banco o formato YYYY-MM-DD
                        const normalized = toIsoDateKey(reg.Data);
                        return {
                            Data: normalized || new Date().toISOString().split('T')[0],
                            KM: reg.KM,
                            Valor: reg.ValorCalculado || 0,
                            Observacao: reg.Observacao
                        };
                    })
                }))
            };

            await saveCalculo(payload);
            setSavedSuccess(true);
            setIsOverwriteModalOpen(false);
            alert("Cálculo salvo no histórico com sucesso!");
        } catch (e: any) {
            alert("Erro ao salvar: " + e.message);
        } finally {
            setIsSaving(false);
        }
    };

    const totalCalculado = calculos.reduce((acc, curr) => acc + curr.ValorPagar, 0);
    const totalKMCalculado = calculos.reduce((acc, curr) => acc + curr.TotalKM, 0);

    return (
        <div className="space-y-8">
            {showReport && <ReportPrint dados={calculos} periodo={periodo} onClose={() => setShowReport(false)} />}
            
            <OverwriteModal 
                isOpen={isOverwriteModalOpen} 
                periodo={periodo} 
                onClose={() => setIsOverwriteModalOpen(false)} 
                onConfirm={(motivo) => performSave(true, motivo)}
                isLoading={isSaving}
            />

            {/* Upload Card - Clean White Theme */}
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-40 h-40 bg-blue-50 rounded-full -mr-10 -mt-10 blur-2xl opacity-50"></div>
                
                <div className="flex items-center mb-8 relative z-10">
                    <div className="p-3 bg-white rounded-xl border border-slate-100 shadow-sm mr-5">
                        <DropIcon className="w-8 h-8 text-blue-600" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Importar Arquivo de KM</h2>
                        <p className="text-slate-500 mt-1 font-medium text-sm">O sistema calculará o reembolso apenas para colaboradores cadastrados e ativos.</p>
                    </div>
                </div>

                <label className={`flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-300 ${isProcessing ? 'bg-slate-50 border-slate-300 opacity-50 cursor-not-allowed' : 'bg-slate-50/50 border-slate-300 hover:bg-blue-50/50 hover:border-blue-300 hover:shadow-sm'}`}>
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <div className="mb-3 p-3 rounded-full bg-white border border-slate-100 text-slate-400 transition-colors group-hover:text-blue-600 shadow-sm">
                            <UploadIcon className="w-8 h-8" />
                        </div>
                        <p className="text-sm text-slate-700 font-semibold mb-1">Clique para selecionar o CSV</p>
                        <p className="text-xs text-slate-400 font-mono">Formato: Grupo;ID;Nome;Data;KM...</p>
                    </div>
                    <input type="file" className="hidden" accept=".csv" onChange={handleFileUpload} disabled={isProcessing} />
                </label>
            </div>

            {/* AVISO DE REGISTROS ZERADOS POR AUSÊNCIA */}
            {blockedList.length > 0 && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 shadow-sm animate-fade-in-up">
                    <div className="flex items-start">
                        <ExclamationIcon className="w-6 h-6 text-blue-500 mr-3 shrink-0 mt-1"/>
                        <div className="flex-1">
                            <h3 className="text-blue-800 font-bold text-lg">Nota: {blockedList.length} Registros com Ausência (R$ 0,00)</h3>
                            <p className="text-blue-700/80 text-sm mb-3">
                                Os registros abaixo coincidem com períodos de afastamento. O valor do reembolso foi <strong>zerado</strong> para estes dias, mas o registro será salvo no histórico para conferência.
                            </p>
                            <div className="max-h-32 overflow-y-auto text-xs font-mono text-blue-800 bg-white p-3 rounded-lg border border-blue-200 scrollbar-thin scrollbar-thumb-blue-200">
                                {blockedList.map((bg, idx) => (
                                    <div key={`blk-${idx}`} className="py-0.5 border-b border-blue-50 last:border-0 flex justify-between">
                                        <span>{bg.data} - {bg.nome}</span>
                                        <span className="font-bold uppercase text-[10px] bg-blue-100 px-1 rounded">{bg.motivo}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {ignoredList.length > 0 && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-5 shadow-sm animate-fade-in-up">
                    <div className="flex items-start">
                        <ExclamationIcon className="w-6 h-6 text-amber-500 mr-3 shrink-0 mt-1"/>
                        <div className="flex-1">
                            <h3 className="text-amber-800 font-bold text-lg">Atenção: {ignoredList.length} Registros Ignorados (Sem Cadastro)</h3>
                            <p className="text-amber-700/80 text-sm mb-3">Os seguintes IDs constam no CSV mas <strong>não possuem cadastro</strong> no sistema. Cadastre-os na tela "Equipe" para incluir no cálculo.</p>
                            <div className="max-h-32 overflow-y-auto text-xs font-mono text-amber-800 bg-white p-3 rounded-lg border border-amber-200 scrollbar-thin scrollbar-thumb-amber-200">
                                {ignoredList.map((ig, idx) => (
                                    <div key={`${ig.id}-${idx}`} className="py-0.5 border-b border-amber-50 last:border-0">ID: {ig.id} - {ig.nome}</div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {calculos.length > 0 && (
                <div className="space-y-6 animate-fade-in-up">
                    
                    {/* INFO CARD - PERIOD SUMMARY */}
                    <div className="bg-gradient-to-r from-blue-50 to-slate-50 border border-blue-100 p-6 rounded-2xl shadow-sm flex flex-col md:flex-row justify-between items-center">
                        <div className="flex items-center mb-4 md:mb-0">
                            <div className="bg-white p-3 rounded-full shadow-sm mr-4 border border-blue-100">
                                <DocumentReportIcon className="w-6 h-6 text-blue-600"/>
                            </div>
                            <div>
                                <h3 className="text-blue-900 font-bold text-lg">Resumo da Importação</h3>
                                <p className="text-blue-700/70 text-sm font-medium">Período Identificado: <span className="text-blue-900 font-bold">{periodo}</span></p>
                            </div>
                        </div>
                        <div className="flex space-x-8 text-right">
                             <div>
                                <p className="text-xs text-slate-400 uppercase font-bold tracking-wider">Total KM</p>
                                <p className="text-xl font-bold text-slate-800">{totalKMCalculado.toFixed(2)} km</p>
                             </div>
                             <div>
                                <p className="text-xs text-slate-400 uppercase font-bold tracking-wider">Valor Total</p>
                                <p className="text-xl font-bold text-emerald-600">{totalCalculado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                             </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white">
                            <h3 className="font-bold text-slate-800 text-lg flex items-center">
                                Detalhamento do Cálculo 
                                <span className="ml-3 px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs border border-blue-100 font-bold">{calculos.length} Colaboradores</span>
                            </h3>
                            <div className="flex space-x-2">
                                 <button 
                                    onClick={initiateSave} 
                                    disabled={isSaving || savedSuccess}
                                    className={`flex items-center px-5 py-2.5 rounded-lg text-sm font-semibold transition shadow-md ${savedSuccess ? 'bg-emerald-100 text-emerald-700 cursor-default border border-emerald-200' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
                                >
                                    {isSaving ? <SpinnerIcon className="w-4 h-4 mr-2"/> : (savedSuccess ? <CheckCircleIcon className="w-4 h-4 mr-2"/> : <CheckCircleIcon className="w-4 h-4 mr-2"/>)}
                                    {isSaving ? 'Salvando...' : (savedSuccess ? 'Salvo no Histórico' : 'Salvar Histórico')}
                                </button>
                                <button onClick={() => setShowReport(true)} className="flex items-center bg-slate-800 hover:bg-slate-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition shadow-md shadow-slate-900/10">
                                    <PrinterIcon className="w-4 h-4 mr-2" /> Imprimir Relatório
                                </button>
                            </div>
                        </div>
                        
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left text-slate-600">
                                <thead className="text-xs text-slate-400 uppercase bg-slate-50/50 border-b border-slate-100 font-semibold">
                                    <tr>
                                        <th className="p-5 tracking-wider">Colaborador</th>
                                        <th className="p-5 tracking-wider text-center">Veículo</th>
                                        <th className="p-5 tracking-wider text-right">Total KM</th>
                                        <th className="p-5 tracking-wider text-right">Eficiência</th>
                                        <th className="p-5 tracking-wider text-right text-emerald-600">Valor Reembolso</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {calculos.map((item) => (
                                        <tr key={item.Colaborador.ID_Pulsus} className="hover:bg-slate-50 transition-colors">
                                            <td className="p-5">
                                                <div className="font-bold text-slate-800 text-base">{item.Colaborador.Nome}</div>
                                                <div className="text-xs text-slate-400 mt-1 flex items-center font-medium">
                                                    <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 border border-slate-200 mr-2">{item.Colaborador.Grupo}</span>
                                                    Setor {item.Colaborador.CodigoSetor} • ID: {item.Colaborador.ID_Pulsus}
                                                </div>
                                            </td>
                                            <td className="p-5 text-center">
                                                {/* Static Badge */}
                                                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${item.Colaborador.TipoVeiculo === 'Carro' ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-amber-50 text-amber-600 border-amber-200'}`}>
                                                    {item.Colaborador.TipoVeiculo === 'Carro' ? <CarIcon className="w-3 h-3 mr-1.5"/> : <MotoIcon className="w-3 h-3 mr-1.5"/>}
                                                    {item.Colaborador.TipoVeiculo}
                                                </span>
                                            </td>
                                            <td className="p-5 text-right font-mono text-slate-700 font-bold tracking-tight">{item.TotalKM.toFixed(2)} km</td>
                                            <td className="p-5 text-right text-slate-400 text-xs font-medium">
                                                {item.Colaborador.TipoVeiculo === 'Carro' ? configReembolso.KmL_Carro : configReembolso.KmL_Moto} km/l
                                            </td>
                                            <td className="p-5 text-right font-bold text-emerald-600 text-lg tracking-tight">
                                                {item.ValorPagar.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};