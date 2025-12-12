
import React, { useState, useContext, useMemo } from 'react';
import { DataContext } from '../context/DataContext.tsx';
import { UploadIcon, DropIcon, CarIcon, MotoIcon, PrinterIcon, ExclamationIcon, CheckCircleIcon, SpinnerIcon, DocumentReportIcon, CalculatorIcon, ChevronDownIcon, ChevronRightIcon, PencilIcon, ArrowRightIcon, CalendarIcon, UsersIcon, PlusCircleIcon, ChevronUpIcon } from './icons.tsx';
import { CalculoReembolso, RegistroKM, SalvarCalculoPayload, StagingRecord, Colaborador, Ausencia } from '../types.ts';
import { saveCalculo, checkCalculoExists, getAusencias, getSugestoesVinculo } from '../services/apiService.ts';
import Papa from 'papaparse';

// --- SUB-COMPONENTE: MODAL DE EDIÇÃO DE KM ---
const EditKmModal: React.FC<{
    isOpen: boolean;
    record: StagingRecord | null;
    onClose: () => void;
    onSave: (id: string, newKm: number, reason: string) => void;
}> = ({ isOpen, record, onClose, onSave }) => {
    const [km, setKm] = useState<string>('');
    const [reason, setReason] = useState('');

    React.useEffect(() => {
        if (record) {
            setKm(record.kmConsiderado.toString());
            setReason(record.editReason || '');
        } else {
            setKm('');
            setReason('');
        }
    }, [record, isOpen]);

    if (!isOpen || !record) return null;

    const handleConfirm = () => {
        const val = parseFloat(km.replace(',', '.'));
        if (isNaN(val) || val < 0) {
            alert("Valor de KM inválido.");
            return;
        }
        if (!reason.trim()) {
            alert("A justificativa é obrigatória para auditoria.");
            return;
        }
        onSave(record.id, val, reason);
    };

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[60]">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 w-full max-w-sm">
                <h3 className="text-lg font-bold text-slate-900 mb-1">Ajuste Manual de KM</h3>
                <p className="text-xs text-slate-500 mb-4">{record.id_pulsus} - {record.nome} | {record.dataOriginal}</p>
                
                <div className="mb-4">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Novo KM</label>
                    <input 
                        type="number" 
                        step="0.1"
                        value={km}
                        onChange={e => setKm(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 text-lg font-bold font-mono focus:ring-2 focus:ring-blue-600 outline-none"
                    />
                </div>

                <div className="mb-6">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Justificativa (Obrigatório)</label>
                    <textarea 
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-600 outline-none resize-none"
                        placeholder="Ex: Erro GPS, Rota alternativa..."
                        rows={3}
                    />
                </div>

                <div className="flex justify-end space-x-2">
                    <button onClick={onClose} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg font-bold text-sm hover:bg-slate-200">Cancelar</button>
                    <button onClick={handleConfirm} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold text-sm hover:bg-blue-700 shadow-md">Confirmar Ajuste</button>
                </div>
            </div>
        </div>
    );
};

// --- SUB-COMPONENTE: MODAL DE MERGE MANUAL (Troca de Aparelho) ---
const MergeModal: React.FC<{
    isOpen: boolean;
    data: { id: number, nome: string } | null;
    colaboradores: Colaborador[];
    onClose: () => void;
    onConfirm: (targetColabId: number) => void;
}> = ({ isOpen, data, colaboradores, onClose, onConfirm }) => {
    const [selectedColab, setSelectedColab] = useState('');
    
    if (!isOpen || !data) return null;

    const handleSubmit = () => {
        if (!selectedColab) return alert("Selecione um colaborador.");
        onConfirm(Number(selectedColab));
        setSelectedColab('');
    };

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[60]">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 w-full max-w-sm">
                <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                     <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                </div>
                <h3 className="text-lg font-bold text-slate-900 text-center">Vincular Registro (Merge)</h3>
                <p className="text-xs text-slate-500 text-center mb-6">
                    O ID <b>{data.id}</b> será unificado ao colaborador selecionado abaixo. Use isso em caso de troca de aparelho.
                </p>
                
                <div className="mb-6">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Destino (Colaborador Ativo)</label>
                    <select 
                        value={selectedColab} 
                        onChange={e => setSelectedColab(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 text-sm font-bold focus:ring-2 focus:ring-blue-600 outline-none"
                    >
                        <option value="">Selecione...</option>
                        {colaboradores.sort((a,b) => a.Nome.localeCompare(b.Nome)).map(c => (
                            <option key={c.ID_Colaborador} value={c.ID_Colaborador}>{c.ID_Pulsus} - {c.Nome}</option>
                        ))}
                    </select>
                </div>

                <div className="flex justify-end space-x-2">
                    <button onClick={onClose} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg font-bold text-sm hover:bg-slate-200">Cancelar</button>
                    <button onClick={handleSubmit} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold text-sm hover:bg-blue-700 shadow-md">Confirmar Vínculo</button>
                </div>
            </div>
        </div>
    );
};

// --- SUB-COMPONENTE: MODAL DE AUSÊNCIA RÁPIDA ---
const QuickAbsenceModal: React.FC<{
    isOpen: boolean;
    data: { colabId: number; idPulsus: number; name: string; date: string } | null;
    onClose: () => void;
    onConfirm: (dtInicio: string, dtFim: string, motivo: string) => Promise<void>;
}> = ({ isOpen, data, onClose, onConfirm }) => {
    const [dtInicio, setDtInicio] = useState('');
    const [dtFim, setDtFim] = useState('');
    const [motivo, setMotivo] = useState('');
    const [loading, setLoading] = useState(false);

    React.useEffect(() => {
        if (data) {
            setDtInicio(data.date);
            setDtFim(data.date);
            setMotivo('');
        }
    }, [data, isOpen]);

    const handleSubmit = async () => {
        if (!motivo) return alert('Selecione um motivo.');
        if (!dtInicio || !dtFim) return alert('Datas obrigatórias.');
        
        setLoading(true);
        await onConfirm(dtInicio, dtFim, motivo);
        setLoading(false);
    };

    if (!isOpen || !data) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[70]">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 w-full max-w-sm">
                <div className="flex items-center justify-center w-12 h-12 bg-red-50 rounded-full mx-auto mb-4">
                    <CalendarIcon className="w-6 h-6 text-red-500"/>
                </div>
                <h3 className="text-lg font-bold text-slate-900 text-center mb-1">Registrar Ausência</h3>
                <p className="text-xs text-slate-500 text-center mb-6">Colaborador: <b>{data.idPulsus} - {data.name}</b></p>
                
                <div className="grid grid-cols-2 gap-3 mb-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Início</label>
                        <input type="date" value={dtInicio} onChange={e => setDtInicio(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm"/>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fim</label>
                        <input type="date" value={dtFim} onChange={e => setDtFim(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm"/>
                    </div>
                </div>

                <div className="mb-6">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Motivo</label>
                    <select value={motivo} onChange={e => setMotivo(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-red-500">
                        <option value="">Selecione...</option>
                        <option value="Férias">Férias</option>
                        <option value="Atestado Médico">Atestado Médico</option>
                        <option value="Falta Justificada">Falta Justificada</option>
                        <option value="Falta Injustificada">Falta Injustificada</option>
                        <option value="Outros">Outros</option>
                    </select>
                </div>

                <div className="flex justify-end space-x-2">
                    <button onClick={onClose} disabled={loading} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg font-bold text-sm hover:bg-slate-200">Cancelar</button>
                    <button onClick={handleSubmit} disabled={loading} className="px-4 py-2 bg-red-600 text-white rounded-lg font-bold text-sm hover:bg-red-700 shadow-md flex items-center">
                        {loading ? <SpinnerIcon className="w-4 h-4 mr-2"/> : null} Confirmar
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- SUB-COMPONENTE: REPORT PRINT (Relatório Final) ---
const ReportPrint: React.FC<{ dados: CalculoReembolso[], periodo: string, onClose: () => void }> = ({ dados, periodo, onClose }) => {
    const { configReembolso } = useContext(DataContext);
    
    const handlePrint = () => window.print();

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
                                    <div className="font-bold text-slate-800">{item.Colaborador.ID_Pulsus} - {item.Colaborador.Nome}</div>
                                </td>
                                <td className="border border-slate-300 p-3">
                                    <div className="font-medium text-slate-700">{item.Colaborador.Grupo}</div>
                                    <div className="text-xs text-slate-500">Setor: {item.Colaborador.CodigoSetor}</div>
                                </td>
                                <td className="border border-slate-300 p-3 text-center">
                                    <span className="font-bold text-slate-700">{item.Colaborador.TipoVeiculo}</span>
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
            </div>
        </div>
    );
};

// --- COMPONENTE PRINCIPAL ---
export const Importacao: React.FC = () => {
    const { colaboradores, configReembolso, ausencias, logSystemAction, refreshData, addAusencia } = useContext(DataContext);
    
    // Steps: 1=Upload, 2=Conferencia/Edicao, 3=Final/Salvar
    const [step, setStep] = useState<1 | 2 | 3>(1);

    // Data Stores
    const [stagingData, setStagingData] = useState<StagingRecord[]>([]);
    const [ignoredList, setIgnoredList] = useState<{id: number, nome: string, rawRows: any[]}[]>([]);
    const [calculoFinal, setCalculoFinal] = useState<CalculoReembolso[]>([]);
    const [smartSuggestions, setSmartSuggestions] = useState<{id: number, nomeHist: string, grupoHist: string, targetColab: Colaborador}[]>([]);
    
    // UI States
    const [isProcessing, setIsProcessing] = useState(false);
    const [periodo, setPeriodo] = useState('');
    const [expandedColabs, setExpandedColabs] = useState<Set<number>>(new Set());
    const [ignoredExpanded, setIgnoredExpanded] = useState(false); // Novo Estado para Ignorados
    
    // Filters (New)
    const [selectedGroup, setSelectedGroup] = useState<string>('');
    const [isRefreshingAbsences, setIsRefreshingAbsences] = useState(false);
    
    // Saving
    const [isSaving, setIsSaving] = useState(false);
    const [savedSuccess, setSavedSuccess] = useState(false);
    const [showReport, setShowReport] = useState(false);

    // Edit Modal
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [recordToEdit, setRecordToEdit] = useState<StagingRecord | null>(null);

    // Merge Modal
    const [mergeModalOpen, setMergeModalOpen] = useState(false);
    const [mergeTarget, setMergeTarget] = useState<{id: number, nome: string} | null>(null);

    // Quick Absence Modal
    const [absenceModalOpen, setAbsenceModalOpen] = useState(false);
    const [targetQuickAbsence, setTargetQuickAbsence] = useState<{ colabId: number, idPulsus: number, name: string, date: string } | null>(null);

    // Helper: Create Date from YYYY-MM-DD
    const createDateFromYmd = (ymd: string): Date => {
        const [y, m, d] = ymd.split('-').map(Number);
        return new Date(y, m - 1, d);
    }
    
    // Helper: Normalize Date
    const toIsoDateKey = (input: string | Date): string | null => {
        if (!input) return null;
        const s = input.toString().trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        if (s.includes('T')) return s.split('T')[0];
        const normalizedS = s.replace(/-/g, '/').replace(/\./g, '/');
        if (normalizedS.includes('/')) {
             const parts = normalizedS.split('/');
             if (parts.length === 3) {
                 const d = parts[0].padStart(2, '0');
                 const m = parts[1].padStart(2, '0');
                 const y = parts[2];
                 const fullYear = y.length === 2 ? `20${y}` : y;
                 return `${fullYear}-${m}-${d}`;
             }
        }
        return null;
    };

    // --- ETAPA 1: UPLOAD & PARSING ---
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsProcessing(true);
        // Reset states
        setStagingData([]);
        setIgnoredList([]);
        setCalculoFinal([]);
        setSavedSuccess(false);
        setStep(1);
        setIgnoredExpanded(false);
        setSmartSuggestions([]);

        Papa.parse(file, {
            header: true,
            delimiter: ";",
            skipEmptyLines: true,
            complete: async (results) => {
                logSystemAction('IMPORTACAO_CSV', `Upload: ${file.name}. Linhas: ${results.data.length}`);
                await processarCSV(results.data);
                setIsProcessing(false);
            },
            error: (err) => {
                alert("Erro ao ler CSV: " + err.message);
                setIsProcessing(false);
            }
        });
    };

    const processarCSV = async (rows: any[]) => {
        const tempStaging: StagingRecord[] = [];
        const tempIgnored: {id: number, nome: string, rawRows: any[]}[] = [];
        const allDateKeys: string[] = [];

        rows.forEach((row, idx) => {
            const id = parseInt(row['ID Pulsus']);
            const nome = row['Nome'] && row['Nome'].trim() ? row['Nome'].trim() : `Colaborador ${id}`;
            const kmStr = row['Estimativa de distância percorrida (KM)'];
            const km = parseFloat(kmStr ? kmStr.replace(',', '.') : '0'); 
            const dateStr = row['Data'];

            if (!isNaN(id) && !isNaN(km)) {
                const csvDateKey = toIsoDateKey(dateStr);
                if(csvDateKey) allDateKeys.push(csvDateKey);

                const colab = colaboradores.find(c => c.ID_Pulsus === id);
                if (!colab) {
                    const existing = tempIgnored.find(i => i.id === id);
                    if (existing) {
                        existing.rawRows.push({ ...row, idx });
                    } else {
                        tempIgnored.push({id, nome, rawRows: [{ ...row, idx }]});
                    }
                    return;
                }

                // Initial Check Ausências
                const check = checkAbsence(colab.ID_Colaborador, csvDateKey, ausencias);
                
                tempStaging.push({
                    id: `${id}-${idx}`, // Unique React Key
                    id_pulsus: id,
                    nome: nome,
                    dataOriginal: dateStr,
                    dataISO: csvDateKey || '',
                    kmOriginal: km,
                    kmConsiderado: check.isBlocked ? 0 : km,
                    isLowKm: !check.isBlocked && km < 1,
                    isBlocked: check.isBlocked,
                    blockReason: check.reason,
                    isEdited: false,
                    colaboradorRef: colab
                });
            }
        });

        // Define Período
        if(allDateKeys.length > 0) {
            allDateKeys.sort();
            const minKey = allDateKeys[0];
            const maxKey = allDateKeys[allDateKeys.length - 1];
            setPeriodo(`${createDateFromYmd(minKey).toLocaleDateString('pt-BR')} até ${createDateFromYmd(maxKey).toLocaleDateString('pt-BR')}`);
        } else {
            setPeriodo('Período não identificado');
        }

        setStagingData(tempStaging);
        setIgnoredList(tempIgnored);

        // --- SMART SUGGESTIONS (New v1.7) ---
        if (tempIgnored.length > 0) {
             const ignoredIds = tempIgnored.map(i => i.id);
             try {
                 const suggestions = await getSugestoesVinculo(ignoredIds);
                 const matches = [];
                 
                 for (const sug of suggestions) {
                     // Tenta encontrar um colaborador ativo que "bata" com o histórico
                     // Lógica Fuzzy: Mesmo nome e mesmo grupo
                     const match = colaboradores.find(c => 
                        c.Nome.trim().toLowerCase() === sug.NomeSuggestion.trim().toLowerCase() && 
                        c.Grupo === sug.GrupoSuggestion
                     );
                     
                     if (match) {
                         matches.push({
                             id: sug.ID_Pulsus,
                             nomeHist: sug.NomeSuggestion,
                             grupoHist: sug.GrupoSuggestion,
                             targetColab: match
                         });
                     }
                 }
                 setSmartSuggestions(matches);
             } catch (e) {
                 console.error("Falha ao buscar sugestões inteligentes", e);
             }
        }
        
        // Auto-advance if data found
        if (tempStaging.length > 0 || tempIgnored.length > 0) {
            setStep(2);
        }
    };

    // Helper para checar ausências
    const checkAbsence = (colabId: number, dateKey: string | null, absenceList: Ausencia[]) => {
        if (!dateKey) return { isBlocked: false, reason: '' };
        
        const ausencia = absenceList.find(aus => {
            if (Number(aus.ID_Colaborador) !== Number(colabId)) return false;
            const startKey = toIsoDateKey(aus.DataInicio);
            const endKey = toIsoDateKey(aus.DataFim);
            if (!startKey || !endKey) return false;
            return dateKey >= startKey && dateKey <= endKey;
        });

        if (ausencia) {
            return { isBlocked: true, reason: ausencia.Motivo };
        }
        return { isBlocked: false, reason: '' };
    };

    // --- FUNCIONALIDADE: REVALIDAR AUSÊNCIAS ---
    const revalidateAbsences = async () => {
        setIsRefreshingAbsences(true);
        try {
            await refreshData();
            const freshAusencias = await getAusencias();
            setStagingData(prev => prev.map(item => {
                if (item.isEdited) return item;
                if (!item.colaboradorRef) return item;
                const check = checkAbsence(item.colaboradorRef.ID_Colaborador, item.dataISO, freshAusencias);
                if (check.isBlocked) {
                    return { ...item, isBlocked: true, blockReason: check.reason, kmConsiderado: 0, isLowKm: false };
                } else {
                    if (item.isBlocked) {
                        return { ...item, isBlocked: false, blockReason: '', kmConsiderado: item.kmOriginal, isLowKm: item.kmOriginal < 1 };
                    }
                }
                return item;
            }));
        } catch (e) { console.error(e); } finally { setIsRefreshingAbsences(false); }
    };

    // --- ETAPA 2: CONFERÊNCIA & EDIÇÃO ---
    const handleEditClick = (record: StagingRecord) => {
        setRecordToEdit(record);
        setEditModalOpen(true);
    };

    const saveEdit = (id: string, newKm: number, reason: string) => {
        setStagingData(prev => prev.map(item => {
            if (item.id === id) {
                return {
                    ...item,
                    kmConsiderado: newKm,
                    isEdited: true,
                    editReason: reason,
                    isLowKm: false 
                };
            }
            return item;
        }));
        setEditModalOpen(false);
        setRecordToEdit(null);
    };

    // --- QUICK ABSENCE HANDLERS ---
    const openQuickAbsence = (record: StagingRecord) => {
        if (!record.colaboradorRef) return;
        setTargetQuickAbsence({
            colabId: record.colaboradorRef.ID_Colaborador,
            idPulsus: record.colaboradorRef.ID_Pulsus,
            name: record.nome,
            date: record.dataISO
        });
        setAbsenceModalOpen(true);
    };

    const handleQuickAbsenceSave = async (dtInicio: string, dtFim: string, motivo: string) => {
        if (!targetQuickAbsence) return;
        
        try {
            await addAusencia({
                ID_Colaborador: targetQuickAbsence.colabId,
                DataInicio: dtInicio,
                DataFim: dtFim,
                Motivo: motivo
            });
            setAbsenceModalOpen(false);
            setTargetQuickAbsence(null);
            
            // Revalidate immediately to reflect changes
            await revalidateAbsences();
        } catch (e: any) {
            alert("Erro ao salvar ausência: " + e.message);
        }
    };

    // --- MERGE HANDLER (Link Ignored to Active) ---
    const handleMerge = (sourceId: number, targetColabId: number) => {
        // Find ignored item
        const ignoredItem = ignoredList.find(i => i.id === sourceId);
        const targetColab = colaboradores.find(c => c.ID_Colaborador === targetColabId);
        
        if (!ignoredItem || !targetColab) return;

        // Create new staging records from raw rows
        const newRecords: StagingRecord[] = ignoredItem.rawRows.map(row => {
            const kmStr = row['Estimativa de distância percorrida (KM)'];
            const km = parseFloat(kmStr ? kmStr.replace(',', '.') : '0'); 
            const dateStr = row['Data'];
            const csvDateKey = toIsoDateKey(dateStr);
            
            // Re-check absence for the TARGET collaborator
            const check = checkAbsence(targetColab.ID_Colaborador, csvDateKey, ausencias);

            return {
                id: `${sourceId}-${row.idx}-merged`,
                id_pulsus: targetColab.ID_Pulsus, // Masquerade as target ID for grouping
                nome: targetColab.Nome,
                dataOriginal: dateStr,
                dataISO: csvDateKey || '',
                kmOriginal: km,
                kmConsiderado: check.isBlocked ? 0 : km,
                isLowKm: !check.isBlocked && km < 1,
                isBlocked: check.isBlocked,
                blockReason: check.reason,
                isEdited: true, // Mark as edited so we know it was merged
                editReason: `Origem: ID Antigo ${sourceId}`,
                colaboradorRef: targetColab
            };
        });

        // Add to staging data
        setStagingData(prev => [...prev, ...newRecords]);
        
        // Remove from ignored list
        setIgnoredList(prev => prev.filter(i => i.id !== sourceId));
        
        // Remove from smart suggestions if present
        setSmartSuggestions(prev => prev.filter(s => s.id !== sourceId));

        setMergeModalOpen(false);
        setMergeTarget(null);
    };

    const openMergeModal = (id: number, nome: string) => {
        setMergeTarget({id, nome});
        setMergeModalOpen(true);
    }


    const toggleExpand = (idPulsus: number) => {
        const newSet = new Set(expandedColabs);
        if (newSet.has(idPulsus)) newSet.delete(idPulsus);
        else newSet.add(idPulsus);
        setExpandedColabs(newSet);
    };

    // Grupos disponíveis para filtro
    const availableGroups = useMemo(() => {
        const groups = new Set<string>();
        stagingData.forEach(item => {
            if (item.colaboradorRef?.Grupo) groups.add(item.colaboradorRef.Grupo);
        });
        return Array.from(groups).sort();
    }, [stagingData]);

    // Filtragem e Agrupamento
    const groupedStaging = useMemo(() => {
        const groups = new Map<number, StagingRecord[]>();
        
        // Filtra primeiro
        const filtered = stagingData.filter(item => {
            if (selectedGroup === '') return true;
            return item.colaboradorRef?.Grupo === selectedGroup;
        });

        // Agrupa
        filtered.forEach(item => {
            if (!groups.has(item.id_pulsus)) groups.set(item.id_pulsus, []);
            groups.get(item.id_pulsus)?.push(item);
        });
        return groups;
    }, [stagingData, selectedGroup]);

    const handleAdvanceToCalc = () => {
        if (stagingData.length === 0) return;
        
        // Transformar Staging -> CalculoReembolso
        const finalCalculos: CalculoReembolso[] = [];
        
        // Re-grouping ALL data for calculation
        const allGroupsMap = new Map<number, StagingRecord[]>();
        stagingData.forEach(item => {
            if (!allGroupsMap.has(item.id_pulsus)) allGroupsMap.set(item.id_pulsus, []);
            allGroupsMap.get(item.id_pulsus)?.push(item);
        });
        
        allGroupsMap.forEach((records, idPulsus) => {
            const colab = records[0].colaboradorRef;
            if (!colab) return;
            
            // Ignorar Grupo 'Outros' no cálculo financeiro
            if (colab.Grupo === 'Outros') return;

            const totalKm = records.reduce((acc, r) => acc + r.kmConsiderado, 0);
            const eficiencia = colab.TipoVeiculo === 'Moto' ? configReembolso.KmL_Moto : configReembolso.KmL_Carro;
            const litros = totalKm / eficiencia;
            const valorTotal = litros * configReembolso.PrecoCombustivel;
            const valorPorKm = configReembolso.PrecoCombustivel / eficiencia;

            // Map Staging Records to RegistroKM
            const registros: RegistroKM[] = records.map(r => {
                // Constrói observação: Se editado, usa motivo. Se bloqueado, usa motivo.
                let obs = '';
                if (r.isBlocked) obs = r.blockReason || 'Ausência';
                if (r.isEdited) obs = `Ajuste: ${r.editReason}`;

                return {
                    ID_Pulsus: r.id_pulsus,
                    Nome: r.nome,
                    Grupo: colab.Grupo,
                    Data: r.dataOriginal, // Mantem original para display
                    KM: r.kmConsiderado,
                    ValorCalculado: r.kmConsiderado * valorPorKm,
                    Observacao: obs
                };
            });

            finalCalculos.push({
                Colaborador: colab,
                TotalKM: totalKm,
                LitrosEstimados: litros,
                ValorPagar: valorTotal,
                Registros: registros
            });
        });

        setCalculoFinal(finalCalculos);
        setStep(3);
    };

    // --- ETAPA 3: SALVAR ---
    const handleSaveHistory = async (overwrite: boolean, motivoOverwrite?: string) => {
        setIsSaving(true);
        try {
            const payload: SalvarCalculoPayload = {
                Periodo: periodo,
                TotalGeral: calculoFinal.reduce((acc, c) => acc + c.ValorPagar, 0),
                Overwrite: overwrite,
                MotivoOverwrite: motivoOverwrite,
                Itens: calculoFinal.map(c => ({
                    ID_Pulsus: c.Colaborador.ID_Pulsus,
                    Nome: c.Colaborador.Nome,
                    Grupo: c.Colaborador.Grupo,
                    TipoVeiculo: c.Colaborador.TipoVeiculo,
                    TotalKM: c.TotalKM,
                    ValorReembolso: c.ValorPagar,
                    ParametroPreco: configReembolso.PrecoCombustivel,
                    ParametroKmL: c.Colaborador.TipoVeiculo === 'Carro' ? configReembolso.KmL_Carro : configReembolso.KmL_Moto,
                    
                    RegistrosDiarios: c.Registros.map(reg => {
                        // Importante: Normalizar Data para YYYY-MM-DD ao salvar
                        const dateIso = toIsoDateKey(reg.Data) || new Date().toISOString().split('T')[0];
                        return {
                            Data: dateIso,
                            KM: reg.KM,
                            Valor: reg.ValorCalculado || 0,
                            Observacao: reg.Observacao
                        };
                    })
                }))
            };

            const exists = !overwrite ? await checkCalculoExists(periodo) : false;
            
            if (exists) {
                const motivo = prompt(`Já existe um cálculo para ${periodo}. Digite um motivo para sobrescrever:`);
                if (motivo) {
                    await saveCalculo({ ...payload, Overwrite: true, MotivoOverwrite: motivo });
                    setSavedSuccess(true);
                    alert("Cálculo sobrescrito com sucesso!");
                } else {
                    setIsSaving(false);
                    return; // Cancelou
                }
            } else {
                await saveCalculo(payload);
                setSavedSuccess(true);
                alert("Cálculo salvo com sucesso!");
            }

        } catch (e: any) {
            alert("Erro ao salvar: " + e.message);
        } finally {
            setIsSaving(false);
        }
    };

    // --- RENDERIZADORES DE ETAPAS ---

    // Etapa 1: Upload (Mantido visual similar mas simplificado)
    const renderStep1 = () => (
        <div className="bg-white p-10 rounded-2xl shadow-sm border border-slate-200 text-center animate-fade-in">
            <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <DropIcon className="w-10 h-10 text-blue-600"/>
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Importar Arquivo CSV</h2>
            <p className="text-slate-500 mb-8 max-w-md mx-auto">Carregue o arquivo de exportação do Pulsus. O sistema irá analisar os dados e identificar inconsistências antes de calcular.</p>
            
            <label className={`block w-full max-w-lg mx-auto p-8 border-2 border-dashed rounded-xl cursor-pointer transition-all ${isProcessing ? 'bg-slate-50 border-slate-300' : 'bg-slate-50 border-blue-200 hover:border-blue-400 hover:bg-blue-50'}`}>
                {isProcessing ? (
                    <div className="flex flex-col items-center">
                        <SpinnerIcon className="w-8 h-8 text-blue-600 mb-2"/>
                        <span className="text-slate-600 font-bold">Processando dados...</span>
                    </div>
                ) : (
                    <div className="flex flex-col items-center">
                        <UploadIcon className="w-8 h-8 text-slate-400 mb-2"/>
                        <span className="text-blue-600 font-bold">Clique para selecionar</span>
                        <span className="text-xs text-slate-400 mt-1">Formato CSV (Pulsus)</span>
                    </div>
                )}
                <input type="file" className="hidden" accept=".csv" onChange={handleFileUpload} disabled={isProcessing} />
            </label>
        </div>
    );

    // Etapa 2: Conferência (Nova Tabela Expansível)
    const renderStep2 = () => {
        const stagedGroups = Array.from(groupedStaging.entries());
        const issuesCount = stagingData.filter(i => i.isLowKm || i.isBlocked).length;

        return (
            <div className="space-y-6 animate-fade-in">
                <EditKmModal isOpen={editModalOpen} record={recordToEdit} onClose={() => setEditModalOpen(false)} onSave={saveEdit} />
                <QuickAbsenceModal isOpen={absenceModalOpen} data={targetQuickAbsence} onClose={() => setAbsenceModalOpen(false)} onConfirm={handleQuickAbsenceSave} />
                <MergeModal isOpen={mergeModalOpen} data={mergeTarget} colaboradores={colaboradores} onClose={() => setMergeModalOpen(false)} onConfirm={(targetId) => mergeTarget && handleMerge(mergeTarget.id, targetId)} />

                {/* Info Bar */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">Conferência de Importação</h3>
                            <p className="text-sm text-slate-500">Período: <b>{periodo}</b></p>
                        </div>
                        <div className="mt-4 md:mt-0 flex items-center space-x-4">
                             <button 
                                onClick={revalidateAbsences} 
                                disabled={isRefreshingAbsences}
                                className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg font-bold text-sm flex items-center transition"
                                title="Verifica se novas ausências foram cadastradas e atualiza o bloqueio"
                            >
                                {isRefreshingAbsences ? <SpinnerIcon className="w-4 h-4 mr-2"/> : <CalendarIcon className="w-4 h-4 mr-2"/>}
                                Verificar Ausências
                            </button>
                            <button onClick={handleAdvanceToCalc} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-bold text-sm flex items-center shadow-lg shadow-blue-600/20">
                                Próximo: Calcular <ArrowRightIcon className="w-4 h-4 ml-2"/>
                            </button>
                        </div>
                    </div>

                    <div className="flex flex-col md:flex-row gap-4 items-center bg-slate-50 p-3 rounded-lg border border-slate-200">
                        <div className="flex items-center">
                            <UsersIcon className="w-5 h-5 text-slate-400 mr-2"/>
                            <span className="text-sm font-bold text-slate-600 mr-2">Filtrar por Grupo:</span>
                            <select 
                                value={selectedGroup} 
                                onChange={(e) => setSelectedGroup(e.target.value)}
                                className="bg-white border border-slate-300 rounded-md text-sm py-1 pl-2 pr-8 outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">Todos os Grupos</option>
                                {availableGroups.map(grp => (
                                    <option key={grp} value={grp}>{grp}</option>
                                ))}
                            </select>
                        </div>
                        <div className="h-4 w-px bg-slate-300 hidden md:block"></div>
                        <div className="text-xs text-slate-500 flex items-center">
                            {issuesCount > 0 && (
                                <span className="flex items-center text-amber-600 font-bold mr-3">
                                    <ExclamationIcon className="w-4 h-4 mr-1"/> {issuesCount} Alertas Totais
                                </span>
                            )}
                            <span>Exibindo <b>{stagedGroups.length}</b> colaboradores {selectedGroup ? `do grupo ${selectedGroup}` : ''}.</span>
                        </div>
                    </div>
                </div>

                {/* --- SMART SUGGESTIONS ALERT --- */}
                {smartSuggestions.length > 0 && (
                     <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 shadow-sm animate-fade-in-up">
                         <h4 className="text-sm font-bold text-blue-700 flex items-center mb-2">
                             <span className="bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs mr-2">!</span>
                             Sugestões Inteligentes de Vínculo
                         </h4>
                         <p className="text-xs text-blue-600/80 mb-3">
                             O sistema identificou possíveis trocas de aparelho baseadas no histórico de pagamento anterior.
                         </p>
                         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                             {smartSuggestions.map(sug => (
                                 <div key={sug.id} className="bg-white p-3 rounded-lg border border-blue-100 shadow-sm flex items-center justify-between">
                                     <div>
                                         <p className="text-xs font-bold text-slate-700">ID Ignorado: {sug.id}</p>
                                         <p className="text-[10px] text-slate-500">Histórico: <b>{sug.nomeHist}</b> ({sug.grupoHist})</p>
                                         <p className="text-[10px] text-blue-600 mt-1">Sugerido: <b>{sug.targetColab.ID_Pulsus} - {sug.targetColab.Nome}</b></p>
                                     </div>
                                     <button 
                                        onClick={() => handleMerge(sug.id, sug.targetColab.ID_Colaborador)}
                                        className="ml-3 bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1 rounded text-xs font-bold transition"
                                     >
                                         Aceitar
                                     </button>
                                 </div>
                             ))}
                         </div>
                     </div>
                )}

                {/* Ignored List Alert (Collapsible) */}
                {ignoredList.length > 0 && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden transition-all shadow-sm">
                        <div 
                            onClick={() => setIgnoredExpanded(!ignoredExpanded)}
                            className="p-4 flex justify-between items-center cursor-pointer hover:bg-slate-100 transition-colors select-none"
                        >
                            <h4 className="text-sm font-bold text-slate-600 flex items-center">
                                <ExclamationIcon className="w-5 h-5 mr-2 text-amber-500"/> 
                                {ignoredList.length} Registros Ignorados (Sem Cadastro)
                            </h4>
                            <div className="text-slate-400">
                                {ignoredExpanded ? <ChevronUpIcon className="w-5 h-5" /> : <ChevronDownIcon className="w-5 h-5" />}
                            </div>
                        </div>
                        
                        {ignoredExpanded && (
                            <div className="p-4 pt-0 border-t border-slate-100 bg-white animate-fade-in">
                                <p className="text-xs text-slate-400 mb-3 mt-3">Estes registros existem no arquivo CSV mas não foram encontrados no cadastro do sistema. Eles serão ignorados no cálculo, a menos que você os vincule.</p>
                                <div className="space-y-2">
                                    {ignoredList.map((ig, idx) => (
                                        <div key={idx} className="flex justify-between items-center text-xs bg-slate-50 px-3 py-2 rounded border border-slate-200 text-slate-500 font-mono">
                                            <span>{ig.id} - {ig.nome}</span>
                                            <button 
                                                onClick={() => openMergeModal(ig.id, ig.nome)}
                                                className="flex items-center text-blue-600 hover:text-blue-800 font-bold bg-white px-2 py-1 rounded border border-blue-100 shadow-sm"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                                                Vincular / Unificar
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Main Table */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left text-slate-600">
                            <thead className="bg-slate-50 text-slate-500 uppercase font-semibold text-xs border-b border-slate-200">
                                <tr>
                                    <th className="p-4 w-10"></th>
                                    <th className="p-4">Colaborador</th>
                                    <th className="p-4 text-center">Dias</th>
                                    <th className="p-4 text-right">KM Total (Prévia)</th>
                                    <th className="p-4 text-center">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {stagedGroups.length === 0 ? (
                                     <tr><td colSpan={5} className="p-12 text-center text-slate-400">Nenhum colaborador encontrado para este filtro.</td></tr>
                                ) : (
                                    stagedGroups.map(([idPulsus, records]) => {
                                        const colab = records[0].colaboradorRef!;
                                        const isExpanded = expandedColabs.has(idPulsus);
                                        const totalKm = records.reduce((acc, r) => acc + r.kmConsiderado, 0);
                                        const hasAlerts = records.some(r => r.isLowKm || r.isBlocked);
                                        const hasEdits = records.some(r => r.isEdited);

                                        return (
                                            <React.Fragment key={idPulsus}>
                                                <tr onClick={() => toggleExpand(idPulsus)} className={`cursor-pointer hover:bg-slate-50 transition-colors ${isExpanded ? 'bg-slate-50' : ''}`}>
                                                    <td className="p-4 text-center">
                                                        {isExpanded ? <ChevronDownIcon className="w-4 h-4 text-blue-500"/> : <ChevronRightIcon className="w-4 h-4 text-slate-400"/>}
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="font-bold text-slate-800">{idPulsus} - {colab.Nome}</div>
                                                        <div className="text-xs text-slate-400">{colab.Grupo}</div>
                                                    </td>
                                                    <td className="p-4 text-center font-mono">{records.length}</td>
                                                    <td className="p-4 text-right font-mono font-bold">{totalKm.toFixed(1)} km</td>
                                                    <td className="p-4 text-center">
                                                        <div className="flex justify-center space-x-1">
                                                            {hasAlerts && <span className="w-2 h-2 rounded-full bg-amber-500" title="Possui Alertas"></span>}
                                                            {hasEdits && <span className="w-2 h-2 rounded-full bg-blue-500" title="Possui Edições"></span>}
                                                            {!hasAlerts && !hasEdits && <span className="w-2 h-2 rounded-full bg-emerald-500" title="OK"></span>}
                                                        </div>
                                                    </td>
                                                </tr>
                                                {isExpanded && (
                                                    <tr className="bg-slate-50/50">
                                                        <td colSpan={5} className="p-4 pl-12">
                                                            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                                                                <table className="w-full text-xs">
                                                                    <thead className="bg-slate-100 text-slate-500">
                                                                        <tr>
                                                                            <th className="p-2 text-left">Data</th>
                                                                            <th className="p-2 text-right">KM Original</th>
                                                                            <th className="p-2 text-right">KM Final</th>
                                                                            <th className="p-2 text-left">Observação/Status</th>
                                                                            <th className="p-2 text-center">Ação</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y divide-slate-50">
                                                                        {records.sort((a,b) => a.dataISO.localeCompare(b.dataISO)).map(day => (
                                                                            <tr key={day.id} className="hover:bg-blue-50/30">
                                                                                <td className="p-2 font-mono">{day.dataOriginal}</td>
                                                                                <td className="p-2 text-right text-slate-400">{day.kmOriginal.toFixed(1)}</td>
                                                                                <td className="p-2 text-right font-bold text-slate-700">{day.kmConsiderado.toFixed(1)}</td>
                                                                                <td className="p-2">
                                                                                    {day.isBlocked && <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold mr-2">Bloqueado: {day.blockReason}</span>}
                                                                                    {day.isLowKm && <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold mr-2">&lt; 1 KM</span>}
                                                                                    {day.isEdited && <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold mr-2">Editado</span>}
                                                                                </td>
                                                                                <td className="p-2 text-center flex justify-end space-x-2">
                                                                                    {!day.isBlocked && (
                                                                                         <button 
                                                                                            onClick={(e) => { e.stopPropagation(); openQuickAbsence(day); }} 
                                                                                            className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded"
                                                                                            title="Lançar Ausência"
                                                                                         >
                                                                                             <div className="relative">
                                                                                                <CalendarIcon className="w-4 h-4"/>
                                                                                                <div className="absolute -top-1 -right-1 bg-red-600 rounded-full w-2 h-2 flex items-center justify-center text-[6px] text-white font-bold">+</div>
                                                                                             </div>
                                                                                         </button>
                                                                                    )}
                                                                                    <button onClick={(e) => { e.stopPropagation(); handleEditClick(day); }} className="text-blue-600 hover:text-blue-800 font-bold hover:underline">
                                                                                        Editar
                                                                                    </button>
                                                                                </td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    };

    // Etapa 3: Finalização (Igual ao anterior, mas usando calculoFinal)
    const renderStep3 = () => {
        const totalVal = calculoFinal.reduce((acc, c) => acc + c.ValorPagar, 0);
        const totalKm = calculoFinal.reduce((acc, c) => acc + c.TotalKM, 0);

        return (
            <div className="space-y-6 animate-fade-in">
                {showReport && <ReportPrint dados={calculoFinal} periodo={periodo} onClose={() => setShowReport(false)} />}
                
                <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100 p-6 rounded-2xl shadow-sm flex flex-col md:flex-row justify-between items-center">
                    <div>
                        <h3 className="text-emerald-900 font-bold text-lg">Cálculo Finalizado</h3>
                        <p className="text-emerald-700/70 text-sm">Pronto para salvar no histórico.</p>
                    </div>
                    <div className="text-right">
                        <p className="text-sm text-emerald-600 uppercase font-bold">Valor Total</p>
                        <p className="text-3xl font-extrabold text-emerald-700">{totalVal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                    </div>
                </div>

                <div className="flex justify-end space-x-3">
                    <button onClick={() => setStep(2)} className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-600 font-bold text-sm">Voltar e Ajustar</button>
                    <button onClick={() => setShowReport(true)} className="px-4 py-2 bg-slate-800 text-white rounded-lg font-bold text-sm hover:bg-slate-700 flex items-center"><PrinterIcon className="w-4 h-4 mr-2"/> Visualizar Relatório</button>
                    <button onClick={() => handleSaveHistory(false)} disabled={isSaving || savedSuccess} className={`px-6 py-2 rounded-lg font-bold text-sm text-white flex items-center shadow-lg ${savedSuccess ? 'bg-emerald-500' : 'bg-blue-600 hover:bg-blue-700'}`}>
                         {isSaving ? <SpinnerIcon className="w-4 h-4 mr-2"/> : <CheckCircleIcon className="w-4 h-4 mr-2"/>}
                         {savedSuccess ? 'Salvo!' : 'Salvar Histórico'}
                    </button>
                </div>

                {/* Tabela Resumo Final */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                     <table className="w-full text-sm text-left text-slate-600">
                        <thead className="bg-slate-50 text-slate-500 uppercase font-semibold text-xs border-b border-slate-200">
                            <tr>
                                <th className="p-4">Colaborador</th>
                                <th className="p-4 text-center">Veículo</th>
                                <th className="p-4 text-right">KM Final</th>
                                <th className="p-4 text-right">Valor</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {calculoFinal.map(c => (
                                <tr key={c.Colaborador.ID_Pulsus}>
                                    <td className="p-4 font-bold text-slate-800">{c.Colaborador.ID_Pulsus} - {c.Colaborador.Nome}</td>
                                    <td className="p-4 text-center">
                                        <span className={`px-2 py-0.5 rounded text-xs font-bold border ${c.Colaborador.TipoVeiculo === 'Carro' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                                            {c.Colaborador.TipoVeiculo}
                                        </span>
                                    </td>
                                    <td className="p-4 text-right font-mono">{c.TotalKM.toFixed(2)}</td>
                                    <td className="p-4 text-right font-bold text-emerald-600">{c.ValorPagar.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</td>
                                </tr>
                            ))}
                        </tbody>
                     </table>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-8">
            {/* Stepper Header */}
            <div className="flex justify-center mb-8">
                <div className="flex items-center space-x-4 bg-white p-2 rounded-full shadow-sm border border-slate-200">
                    <div className={`flex items-center space-x-2 px-4 py-2 rounded-full transition-colors ${step >= 1 ? 'bg-blue-50 text-blue-700' : 'text-slate-400'}`}>
                        <span className="font-bold">1</span> <span className="text-sm font-medium">Importação</span>
                    </div>
                    <div className="w-8 h-px bg-slate-300"></div>
                    <div className={`flex items-center space-x-2 px-4 py-2 rounded-full transition-colors ${step >= 2 ? 'bg-blue-50 text-blue-700' : 'text-slate-400'}`}>
                        <span className="font-bold">2</span> <span className="text-sm font-medium">Conferência & Ajustes</span>
                    </div>
                    <div className="w-8 h-px bg-slate-300"></div>
                    <div className={`flex items-center space-x-2 px-4 py-2 rounded-full transition-colors ${step === 3 ? 'bg-blue-50 text-blue-700' : 'text-slate-400'}`}>
                        <span className="font-bold">3</span> <span className="text-sm font-medium">Fechamento</span>
                    </div>
                </div>
            </div>

            {step === 1 && renderStep1()}
            {step === 2 && renderStep2()}
            {step === 3 && renderStep3()}
        </div>
    );
};
