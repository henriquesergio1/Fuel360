


import React, { useState, useEffect, useContext, useMemo } from 'react';
import { DataContext } from '../context/DataContext.tsx';
import { getRelatorioReembolso, getRelatorioAnalitico } from '../services/apiService.ts';
import { ItemRelatorio, ItemRelatorioAnalitico } from '../types.ts';
import { ChartBarIcon, SpinnerIcon, PrinterIcon, CarIcon, MotoIcon, UsersIcon, DocumentReportIcon, ChevronDownIcon, ChevronRightIcon } from './icons.tsx';

type ReportView = 'SINTETICO' | 'ANALITICO';

export const Relatorios: React.FC = () => {
    const { colaboradores } = useContext(DataContext);
    
    // Default dates: First day of current month to today
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const today = now.toISOString().split('T')[0];

    const [startDate, setStartDate] = useState(firstDay);
    const [endDate, setEndDate] = useState(today);
    const [selectedColab, setSelectedColab] = useState('');
    
    // Data states
    const [reportData, setReportData] = useState<ItemRelatorio[]>([]);
    const [analyticData, setAnalyticData] = useState<ItemRelatorioAnalitico[]>([]);
    
    const [loading, setLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [viewMode, setViewMode] = useState<ReportView>('SINTETICO');

    // Expanded states for Analytic View
    const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

    // Auto-load on mount
    useEffect(() => {
        handleSearch();
    }, []);

    const handleSearch = async () => {
        setLoading(true);
        try {
            // Fetch both or just the active one? Fetching both for seamless switching.
            // Sintetico
            const dataSintetico = await getRelatorioReembolso(startDate, endDate, selectedColab);
            setReportData(dataSintetico);
            
            // Analitico
            const dataAnalitico = await getRelatorioAnalitico(startDate, endDate, selectedColab);
            setAnalyticData(dataAnalitico);
            
            setHasSearched(true);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const toggleRow = (id: number) => {
        const newSet = new Set(expandedRows);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setExpandedRows(newSet);
    };

    // Grouping Analytic Data
    const groupedAnalyticData = useMemo(() => {
        const groups = new Map<number, {
            info: ItemRelatorioAnalitico,
            items: ItemRelatorioAnalitico[],
            totalKm: number,
            totalVal: number
        }>();

        analyticData.forEach(item => {
            if (!groups.has(item.ID_Pulsus)) {
                groups.set(item.ID_Pulsus, {
                    info: item,
                    items: [],
                    totalKm: 0,
                    totalVal: 0
                });
            }
            const group = groups.get(item.ID_Pulsus)!;
            group.items.push(item);
            group.totalKm += item.KM_Dia;
            group.totalVal += item.Valor_Dia;
        });

        // Convert Map to Array and Sort by Name
        return Array.from(groups.values()).sort((a, b) => a.info.NomeColaborador.localeCompare(b.info.NomeColaborador));
    }, [analyticData]);

    const totalPago = reportData.reduce((acc, item) => acc + item.ValorReembolso, 0);
    const totalKM = reportData.reduce((acc, item) => acc + item.TotalKM, 0);

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-extrabold text-slate-800 mb-2 tracking-tight">Relatórios de Reembolso</h2>
                    <p className="text-slate-500 font-medium">Consulte o histórico financeiro e operacional.</p>
                </div>
                <div className="p-3 bg-blue-50 rounded-full">
                    <ChartBarIcon className="w-8 h-8 text-blue-600"/>
                </div>
            </div>

            {/* Filter Card */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Data Inicial</label>
                        <input 
                            type="date" 
                            value={startDate} 
                            onChange={e => setStartDate(e.target.value)} 
                            className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-blue-600 outline-none" 
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Data Final</label>
                        <input 
                            type="date" 
                            value={endDate} 
                            onChange={e => setEndDate(e.target.value)} 
                            className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-blue-600 outline-none" 
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Colaborador (Opcional)</label>
                        <select 
                            value={selectedColab} 
                            onChange={e => setSelectedColab(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-blue-600 outline-none"
                        >
                            <option value="">Todos os Colaboradores</option>
                            {colaboradores.sort((a,b) => a.Nome.localeCompare(b.Nome)).map(c => (
                                <option key={c.ID_Pulsus} value={c.ID_Pulsus}>{c.Nome}</option>
                            ))}
                        </select>
                    </div>
                    <button 
                        onClick={handleSearch} 
                        disabled={loading}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-6 rounded-lg shadow-md transition-all flex items-center justify-center"
                    >
                        {loading ? <SpinnerIcon className="w-5 h-5"/> : 'Filtrar Resultados'}
                    </button>
                </div>
            </div>

            {/* Results Area */}
            {hasSearched && (
                <div className="animate-fade-in-up space-y-6">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center">
                            <div className="p-4 bg-emerald-50 rounded-full mr-4 border border-emerald-100">
                                <span className="text-2xl">💰</span>
                            </div>
                            <div>
                                <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Total Pago</p>
                                <p className="text-2xl font-extrabold text-slate-800">{totalPago.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                            </div>
                        </div>
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center">
                             <div className="p-4 bg-blue-50 rounded-full mr-4 border border-blue-100">
                                <span className="text-2xl">🚗</span>
                            </div>
                            <div>
                                <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">KM Total</p>
                                <p className="text-2xl font-extrabold text-slate-800">{totalKM.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} km</p>
                            </div>
                        </div>
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center">
                             <div className="p-4 bg-purple-50 rounded-full mr-4 border border-purple-100">
                                <UsersIcon className="w-6 h-6 text-purple-600"/>
                            </div>
                            <div>
                                <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Registros</p>
                                <p className="text-2xl font-extrabold text-slate-800">{reportData.length}</p>
                            </div>
                        </div>
                    </div>

                    {/* View Switcher Tabs */}
                    <div className="flex border-b border-slate-200">
                        <button 
                            onClick={() => setViewMode('SINTETICO')}
                            className={`px-6 py-3 text-sm font-bold flex items-center transition-all ${viewMode === 'SINTETICO' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            <DocumentReportIcon className="w-5 h-5 mr-2"/>
                            Visão Sintética (Resumo)
                        </button>
                        <button 
                            onClick={() => setViewMode('ANALITICO')}
                            className={`px-6 py-3 text-sm font-bold flex items-center transition-all ${viewMode === 'ANALITICO' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            <ChartBarIcon className="w-5 h-5 mr-2"/>
                            Visão Analítica (Dia a Dia)
                        </button>
                    </div>

                    {/* Table Area */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                            <h3 className="font-bold text-slate-700">
                                {viewMode === 'SINTETICO' ? 'Detalhamento por Colaborador' : 'Detalhamento Diário Agrupado'}
                            </h3>
                            <button onClick={() => window.print()} className="text-slate-500 hover:text-blue-600 p-2 rounded hover:bg-white transition" title="Imprimir (Nativo)"><PrinterIcon className="w-5 h-5"/></button>
                        </div>
                        
                        <div className="overflow-x-auto max-h-[600px] overflow-y-auto custom-scrollbar">
                            {viewMode === 'SINTETICO' ? (
                                /* TABELA SINTÉTICA */
                                <table className="w-full text-sm text-left text-slate-600">
                                    <thead className="text-xs text-slate-400 uppercase bg-slate-50/50 border-b border-slate-100 font-semibold sticky top-0 bg-white z-10">
                                        <tr>
                                            <th className="p-4 tracking-wider">Data Ger.</th>
                                            <th className="p-4 tracking-wider">Período Ref.</th>
                                            <th className="p-4 tracking-wider">Colaborador</th>
                                            <th className="p-4 tracking-wider text-center">Veículo</th>
                                            <th className="p-4 tracking-wider text-right">KM Total</th>
                                            <th className="p-4 tracking-wider text-right">Valor Pago</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {reportData.length === 0 ? (
                                            <tr><td colSpan={6} className="p-12 text-center text-slate-400">Nenhum registro encontrado para este período.</td></tr>
                                        ) : (
                                            reportData.map((item) => (
                                                <tr key={item.ID_Detalhe} className="hover:bg-slate-50 transition-colors">
                                                    <td className="p-4 text-xs font-mono">{new Date(item.DataGeracao).toLocaleDateString()}</td>
                                                    <td className="p-4 text-xs font-medium text-slate-500">{item.PeriodoReferencia}</td>
                                                    <td className="p-4">
                                                        <div className="font-bold text-slate-800">{item.NomeColaborador}</div>
                                                        <div className="text-[10px] text-slate-400">{item.Grupo} • ID: {item.ID_Pulsus}</div>
                                                    </td>
                                                    <td className="p-4 text-center">
                                                         <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${item.TipoVeiculo === 'Carro' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                                                            {item.TipoVeiculo === 'Carro' ? <CarIcon className="w-3 h-3 mr-1"/> : <MotoIcon className="w-3 h-3 mr-1"/>}
                                                            {item.TipoVeiculo}
                                                        </span>
                                                    </td>
                                                    <td className="p-4 text-right font-mono text-slate-700">{item.TotalKM.toFixed(2)}</td>
                                                    <td className="p-4 text-right font-bold text-emerald-600">{item.ValorReembolso.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            ) : (
                                /* TABELA ANALÍTICA AGRUPADA */
                                <table className="w-full text-sm text-left text-slate-600">
                                    <thead className="text-xs text-slate-400 uppercase bg-slate-50/50 border-b border-slate-100 font-semibold sticky top-0 bg-white z-10">
                                        <tr>
                                            <th className="p-4 w-12 text-center"></th>
                                            <th className="p-4 tracking-wider">Colaborador</th>
                                            <th className="p-4 tracking-wider text-center">Veículo</th>
                                            <th className="p-4 tracking-wider text-right">Total KM (Periodo)</th>
                                            <th className="p-4 tracking-wider text-right">Total Valor (Periodo)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {groupedAnalyticData.length === 0 ? (
                                            <tr><td colSpan={5} className="p-12 text-center text-slate-400">Nenhum detalhe diário encontrado para este período.</td></tr>
                                        ) : (
                                            groupedAnalyticData.map((group) => {
                                                const isExpanded = expandedRows.has(group.info.ID_Pulsus);
                                                return (
                                                    <React.Fragment key={group.info.ID_Pulsus}>
                                                        {/* Parent Row */}
                                                        <tr 
                                                            onClick={() => toggleRow(group.info.ID_Pulsus)}
                                                            className={`cursor-pointer transition-colors ${isExpanded ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}
                                                        >
                                                            <td className="p-4 text-center">
                                                                <div className={`transition-transform duration-200 ${isExpanded ? 'text-blue-600' : 'text-slate-400'}`}>
                                                                    {isExpanded ? <ChevronDownIcon className="w-5 h-5"/> : <ChevronRightIcon className="w-5 h-5"/>}
                                                                </div>
                                                            </td>
                                                            <td className="p-4">
                                                                <div className="font-bold text-slate-800 text-base">{group.info.NomeColaborador}</div>
                                                                <div className="text-[10px] text-slate-500 font-medium">
                                                                    ID: {group.info.ID_Pulsus} • {group.info.Grupo}
                                                                </div>
                                                            </td>
                                                            <td className="p-4 text-center">
                                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${group.info.TipoVeiculo === 'Carro' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                                                                    {group.info.TipoVeiculo === 'Carro' ? <CarIcon className="w-3 h-3 mr-1"/> : <MotoIcon className="w-3 h-3 mr-1"/>}
                                                                    {group.info.TipoVeiculo}
                                                                </span>
                                                            </td>
                                                            <td className="p-4 text-right font-mono text-slate-700 font-bold">{group.totalKm.toFixed(2)} km</td>
                                                            <td className="p-4 text-right font-bold text-emerald-600 text-lg">{group.totalVal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                                        </tr>

                                                        {/* Expanded Child Row */}
                                                        {isExpanded && (
                                                            <tr className="bg-slate-50/50 shadow-inner">
                                                                <td colSpan={5} className="p-4 pl-16">
                                                                    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
                                                                        <table className="w-full text-xs">
                                                                            <thead className="bg-slate-100 text-slate-500 uppercase font-semibold">
                                                                                <tr>
                                                                                    <th className="px-4 py-2 text-left">Data</th>
                                                                                    <th className="px-4 py-2 text-right">KM Percorrido</th>
                                                                                    <th className="px-4 py-2 text-right">Valor Calculado</th>
                                                                                </tr>
                                                                            </thead>
                                                                            <tbody className="divide-y divide-slate-50 text-slate-600">
                                                                                {group.items.sort((a,b) => new Date(a.DataOcorrencia).getTime() - new Date(b.DataOcorrencia).getTime()).map(day => (
                                                                                    <tr key={day.ID_Diario} className="hover:bg-blue-50/30">
                                                                                        <td className="px-4 py-2 font-mono">{new Date(day.DataOcorrencia).toLocaleDateString('pt-BR')}</td>
                                                                                        <td className="px-4 py-2 text-right font-mono">{day.KM_Dia.toFixed(2)} km</td>
                                                                                        <td className="px-4 py-2 text-right font-bold text-slate-700">
                                                                                            {day.Observacao ? (
                                                                                                <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                                                                                    day.Observacao.toLowerCase().includes('féria') ? 'bg-amber-100 text-amber-700' :
                                                                                                    day.Observacao.toLowerCase().includes('atestado') ? 'bg-red-100 text-red-700' :
                                                                                                    'bg-slate-200 text-slate-700'
                                                                                                }`}>
                                                                                                    {day.Observacao}
                                                                                                </span>
                                                                                            ) : (
                                                                                                day.Valor_Dia.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                                                                                            )}
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
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
