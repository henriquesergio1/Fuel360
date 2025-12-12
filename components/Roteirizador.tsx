

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import { getVisitasPrevistas } from '../services/apiService.ts';
import { VisitaPrevista, RotaCalculada } from '../types.ts';
import { LocationMarkerIcon, SpinnerIcon, CalculatorIcon, CalendarIcon, UsersIcon, ChevronRightIcon, ChevronDownIcon, XCircleIcon, ArrowLeftIcon, CogIcon, CarIcon, TruckIcon, UserGroupIcon, UserIcon } from './icons.tsx';
import L from 'leaflet';

// Fix Leaflet Icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

// Componente para auto-zoom
const MapRecenter: React.FC<{ coords: [number, number][] }> = ({ coords }) => {
    const map = useMap();
    useEffect(() => {
        if (coords.length > 0) {
            const bounds = L.latLngBounds(coords);
            map.fitBounds(bounds, { padding: [50, 50] });
        }
    }, [coords, map]);
    return null;
};

// Componente CRÍTICO: ResizeObserver para garantir que o mapa preencha o container
const MapFix = () => {
    const map = useMap();
    
    useEffect(() => {
        // 1. Invalida tamanho imediatamente
        map.invalidateSize();

        // 2. Monitora mudanças no container DOM
        const container = map.getContainer();
        const observer = new ResizeObserver(() => {
            map.invalidateSize();
        });
        
        observer.observe(container);

        // 3. Backup: Tenta novamente após um delay (animações CSS)
        const timeout = setTimeout(() => {
            map.invalidateSize();
        }, 300);

        return () => {
            observer.disconnect();
            clearTimeout(timeout);
        };
    }, [map]);

    return null;
};

// Haversine Formula (km)
const calcDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; 
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};
const deg2rad = (deg: number) => deg * (Math.PI / 180);

// Helper seguro para formatar data DD/MM/YYYY
const formatDateString = (isoDateStr: string) => {
    if (!isoDateStr) return '-';
    const cleanDate = isoDateStr.split('T')[0];
    const [y, m, d] = cleanDate.split('-');
    return `${d}/${m}/${y}`;
};

// Helper para extrair YYYY-MM-DD seguro
const getSafeDateKey = (isoDateStr: string) => {
    if (!isoDateStr) return '';
    return isoDateStr.split('T')[0];
};

interface DayRouteSummary {
    date: string;
    dayName: string;
    kmReta: number;
    kmEstimado: number;
    visitas: VisitaPrevista[];
}

interface SellerSummary {
    id: number;
    name: string;
    supervisorId: number;
    supervisor: string;
    totalKm: number;
    days: DayRouteSummary[];
}

export const Roteirizador: React.FC = () => {
    // State Inputs
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]);
    const [tortuosityFactor, setTortuosityFactor] = useState(1.3); // Padrão Urbano
    
    // Filters State
    const [selectedSupervisor, setSelectedSupervisor] = useState<string>('');
    const [selectedVendedor, setSelectedVendedor] = useState<string>('');

    // Data State
    const [loading, setLoading] = useState(false);
    const [rawData, setRawData] = useState<VisitaPrevista[]>([]);
    
    // UI State
    const [expandedSellers, setExpandedSellers] = useState<Set<number>>(new Set());
    const [viewingRoute, setViewingRoute] = useState<DayRouteSummary | null>(null);

    // Fetch Data
    const handleCalculate = async () => {
        setLoading(true);
        setRawData([]);
        setViewingRoute(null);
        setExpandedSellers(new Set());
        
        try {
            const data = await getVisitasPrevistas(startDate, endDate);
            setRawData(data);
        } catch (e: any) {
            alert("Erro ao calcular: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    // Derived Lists for Dropdowns
    const availableSupervisors = useMemo(() => {
        const unique = new Map<number, string>();
        rawData.forEach(v => {
            if (v.Cod_Supervisor && v.Nome_Supervisor) {
                unique.set(v.Cod_Supervisor, v.Nome_Supervisor);
            }
        });
        return Array.from(unique.entries()).sort((a, b) => a[1].localeCompare(b[1]));
    }, [rawData]);

    const availableVendedores = useMemo(() => {
        const unique = new Map<number, string>();
        rawData.forEach(v => {
            if (selectedSupervisor && String(v.Cod_Supervisor) !== selectedSupervisor) return;
            if (v.Cod_Vend && v.Nome_Vendedor) {
                unique.set(v.Cod_Vend, v.Nome_Vendedor);
            }
        });
        return Array.from(unique.entries()).sort((a, b) => a[1].localeCompare(b[1]));
    }, [rawData, selectedSupervisor]);

    useEffect(() => {
        setSelectedVendedor('');
    }, [selectedSupervisor]);

    // Process Data (Filter & Group)
    const reportData = useMemo(() => {
        if (rawData.length === 0) return [];

        // 1. Filter Raw Data
        const filtered = rawData.filter(v => {
            if (selectedSupervisor && String(v.Cod_Supervisor) !== selectedSupervisor) return false;
            if (selectedVendedor && String(v.Cod_Vend) !== selectedVendedor) return false;
            
            if (v.Data_da_Visita) {
                const rowDate = getSafeDateKey(v.Data_da_Visita);
                if (rowDate < startDate || rowDate > endDate) return false;
            }

            return true;
        });

        // 2. Group by Seller
        const sellerMap = new Map<number, VisitaPrevista[]>();
        filtered.forEach(v => {
            if (!sellerMap.has(v.Cod_Vend)) sellerMap.set(v.Cod_Vend, []);
            sellerMap.get(v.Cod_Vend)?.push(v);
        });

        const summaries: SellerSummary[] = [];

        // 3. Process Grouped Data
        for (const [sellerId, visits] of sellerMap.entries()) {
            const daysMap = new Map<string, VisitaPrevista[]>();
            
            visits.forEach(v => {
                if (!v.Data_da_Visita) return;
                const dateKey = getSafeDateKey(v.Data_da_Visita);
                if (!dateKey) return;
                
                if (!daysMap.has(dateKey)) daysMap.set(dateKey, []);
                daysMap.get(dateKey)?.push(v);
            });

            const daysSummary: DayRouteSummary[] = [];
            let totalSellerKm = 0;

            for (const [dateKey, dayVisits] of daysMap.entries()) {
                const validPoints = dayVisits.filter(v => 
                    v.Lat && v.Long && 
                    !isNaN(Number(v.Lat)) && 
                    !isNaN(Number(v.Long)) && 
                    Number(v.Lat) !== 0 && 
                    Number(v.Long) !== 0
                );
                
                let kmReta = 0;
                for (let i = 0; i < validPoints.length - 1; i++) {
                    kmReta += calcDistance(validPoints[i].Lat, validPoints[i].Long, validPoints[i+1].Lat, validPoints[i+1].Long);
                }

                const kmEstimado = kmReta * tortuosityFactor;
                totalSellerKm += kmEstimado;

                daysSummary.push({
                    date: dateKey,
                    dayName: dayVisits[0]?.Dia_Semana || '',
                    kmReta,
                    kmEstimado,
                    visitas: validPoints
                });
            }

            daysSummary.sort((a, b) => a.date.localeCompare(b.date));

            summaries.push({
                id: sellerId,
                name: visits[0]?.Nome_Vendedor || 'Desconhecido',
                supervisorId: visits[0]?.Cod_Supervisor || 0,
                supervisor: visits[0]?.Nome_Supervisor || '-',
                totalKm: totalSellerKm,
                days: daysSummary
            });
        }

        return summaries.sort((a, b) => a.name.localeCompare(b.name));
    }, [rawData, selectedSupervisor, selectedVendedor, tortuosityFactor, startDate, endDate]);

    const toggleExpand = (id: number) => {
        const newSet = new Set(expandedSellers);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setExpandedSellers(newSet);
    };

    // --- RENDER ---

    // View: Map Modal
    if (viewingRoute) {
        const hasPoints = viewingRoute.visitas.length > 0;
        const centerPos: [number, number] = hasPoints 
            ? [viewingRoute.visitas[0].Lat, viewingRoute.visitas[0].Long] 
            : [-23.55052, -46.633308];

        return (
            <div className="h-full flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden relative animate-fade-in">
                <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 z-10 shrink-0">
                    <button 
                        onClick={() => setViewingRoute(null)}
                        className="flex items-center text-slate-600 hover:text-blue-600 font-bold text-sm bg-white px-3 py-1.5 rounded-lg border border-slate-300 shadow-sm"
                    >
                        <ArrowLeftIcon className="w-4 h-4 mr-2"/> Voltar ao Relatório
                    </button>
                    <div className="text-center">
                        <h3 className="font-bold text-slate-800">{formatDateString(viewingRoute.date)} - {viewingRoute.dayName}</h3>
                        <p className="text-xs text-slate-500">{viewingRoute.visitas.length} Pontos de Visita • {viewingRoute.kmEstimado.toFixed(1)} km est.</p>
                    </div>
                    <div className="w-20"></div>
                </div>
                
                {/* 
                    FIX FINAL PARA MAPA:
                    1. Altura Fixa (h-[70vh]) em vez de flex-1 para garantir que o container tenha tamanho definido no DOM.
                    2. MapFix com ResizeObserver para invalidar tamanho se mudar.
                    3. z-0 para contexto de empilhamento.
                */}
                <div className="w-full h-[70vh] bg-slate-100 relative z-0">
                    <MapContainer 
                        key={viewingRoute.date}
                        center={centerPos} 
                        zoom={13} 
                        style={{ height: '100%', width: '100%' }}
                    >
                        <MapFix />
                        <TileLayer 
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" 
                        />
                        <MapRecenter coords={viewingRoute.visitas.map(v => [v.Lat, v.Long])} />
                        
                        {viewingRoute.visitas.map((v, idx) => (
                            <Marker key={idx} position={[v.Lat, v.Long]}>
                                <Popup>
                                    <div className="text-xs font-sans">
                                        <strong className="block text-sm mb-1">{idx + 1}. {v.Razao_Social}</strong>
                                        <span className="text-slate-500 block">{v.Endereco}</span>
                                        <span className="text-slate-400 block">{v.Bairro}, {v.Cidade}</span>
                                    </div>
                                </Popup>
                            </Marker>
                        ))}

                        <Polyline 
                            positions={viewingRoute.visitas.map(v => [v.Lat, v.Long])}
                            color="#2563eb"
                            weight={4}
                            opacity={0.8}
                            dashArray="5, 10"
                        />
                    </MapContainer>
                </div>
            </div>
        );
    }

    // View: Report
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-extrabold text-slate-800 mb-1 tracking-tight">Previsão de Roteiro (KM)</h2>
                    <p className="text-slate-500 font-medium text-sm">Cálculo de quilometragem baseado na agenda de visitas do sistema.</p>
                </div>
            </div>

            {/* Config & Filter Bar */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4">
                {/* Linha 1: Parâmetros de Cálculo */}
                <div className="flex flex-wrap gap-4 items-end pb-4 border-b border-slate-100">
                    <div className="flex gap-4">
                        <div className="w-36">
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Data Início</label>
                            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600"/>
                        </div>
                        <div className="w-36">
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Data Fim</label>
                            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600"/>
                        </div>
                    </div>

                    <div className="flex flex-col">
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1" title="Fator de ajuste de curvatura">Fator Tortuosidade</label>
                        <div className="flex items-center bg-slate-50 border border-slate-300 rounded-lg p-1">
                            <button onClick={() => setTortuosityFactor(1.1)} className={`px-3 py-1.5 rounded text-xs font-bold transition ${tortuosityFactor === 1.1 ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Rodovia</button>
                            <button onClick={() => setTortuosityFactor(1.3)} className={`px-3 py-1.5 rounded text-xs font-bold transition ${tortuosityFactor === 1.3 ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Urbano</button>
                            <input type="number" step="0.1" value={tortuosityFactor} onChange={e => setTortuosityFactor(parseFloat(e.target.value))} className="w-14 bg-transparent text-center text-sm font-mono font-bold outline-none border-l border-slate-200 ml-1"/>
                        </div>
                    </div>

                    <button 
                        onClick={handleCalculate}
                        disabled={loading}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-6 rounded-lg shadow-md transition-all flex items-center disabled:opacity-50 ml-auto"
                    >
                        {loading ? <SpinnerIcon className="w-5 h-5 mr-2"/> : <CalculatorIcon className="w-5 h-5 mr-2"/>}
                        Calcular Previsão
                    </button>
                </div>

                {/* Linha 2: Filtros de Resultado (Só aparece após busca) */}
                <div className={`flex flex-wrap gap-4 items-center transition-opacity duration-300 ${rawData.length > 0 ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                    <div className="w-64">
                         <label className="block text-xs font-bold text-slate-400 uppercase mb-1 flex items-center"><UserGroupIcon className="w-3 h-3 mr-1"/> Filtrar Supervisor</label>
                         <select 
                            value={selectedSupervisor} 
                            onChange={e => setSelectedSupervisor(e.target.value)} 
                            disabled={rawData.length === 0}
                            className="w-full bg-white border border-slate-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="">Todos os Supervisores</option>
                            {availableSupervisors.map(([id, name]) => (
                                <option key={id} value={id}>{id} - {name}</option>
                            ))}
                         </select>
                    </div>

                    <div className="w-64">
                         <label className="block text-xs font-bold text-slate-400 uppercase mb-1 flex items-center"><UserIcon className="w-3 h-3 mr-1"/> Filtrar Vendedor</label>
                         <select 
                            value={selectedVendedor} 
                            onChange={e => setSelectedVendedor(e.target.value)} 
                            disabled={rawData.length === 0}
                            className="w-full bg-white border border-slate-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="">Todos os Vendedores</option>
                            {availableVendedores.map(([id, name]) => (
                                <option key={id} value={id}>{id} - {name}</option>
                            ))}
                         </select>
                    </div>

                    {rawData.length > 0 && (
                        <div className="ml-auto text-xs text-slate-400 font-mono">
                            Exibindo {reportData.length} de {new Set(rawData.map(r => r.Cod_Vend)).size} vendedores
                        </div>
                    )}
                </div>
            </div>

            {/* Results Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-fade-in-up">
                <table className="w-full text-sm text-left text-slate-600">
                    <thead className="bg-slate-50 text-slate-500 uppercase font-semibold text-xs border-b border-slate-200">
                        <tr>
                            <th className="p-4 w-10"></th>
                            <th className="p-4">Vendedor</th>
                            <th className="p-4">Supervisor</th>
                            <th className="p-4 text-center">Dias com Rota</th>
                            <th className="p-4 text-right">KM Total Previsto</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {reportData.length === 0 ? (
                            <tr><td colSpan={5} className="p-12 text-center text-slate-400">
                                {rawData.length > 0 ? "Nenhum resultado para os filtros selecionados." : "Nenhuma rota calculada. Selecione o período e clique em Calcular."}
                            </td></tr>
                        ) : (
                            reportData.map(seller => {
                                const isExpanded = expandedSellers.has(seller.id);
                                return (
                                    <React.Fragment key={seller.id}>
                                        <tr onClick={() => toggleExpand(seller.id)} className={`cursor-pointer hover:bg-slate-50 transition-colors ${isExpanded ? 'bg-slate-50' : ''}`}>
                                            <td className="p-4 text-center">
                                                {isExpanded ? <ChevronDownIcon className="w-4 h-4 text-blue-500"/> : <ChevronRightIcon className="w-4 h-4 text-slate-400"/>}
                                            </td>
                                            <td className="p-4">
                                                <div className="font-bold text-slate-800">{seller.id} - {seller.name}</div>
                                            </td>
                                            <td className="p-4">
                                                <div className="text-slate-600">{seller.supervisorId} - {seller.supervisor}</div>
                                            </td>
                                            <td className="p-4 text-center font-mono">{seller.days.length}</td>
                                            <td className="p-4 text-right font-bold text-blue-600 text-lg">{seller.totalKm.toFixed(1)} km</td>
                                        </tr>
                                        
                                        {/* Expanded Details */}
                                        {isExpanded && (
                                            <tr className="bg-slate-50/50 shadow-inner">
                                                <td colSpan={5} className="p-0">
                                                    <div className="bg-white border-y border-slate-200">
                                                        <table className="w-full text-xs">
                                                            <thead className="bg-slate-100 text-slate-500 uppercase">
                                                                <tr>
                                                                    <th className="py-2 px-8 text-left w-40">Data</th>
                                                                    <th className="py-2 px-4 text-left">Dia Semana</th>
                                                                    <th className="py-2 px-4 text-center">Qtd Visitas</th>
                                                                    <th className="py-2 px-4 text-right">KM Calculado <span className="text-[9px] lowercase opacity-70">(Fator {tortuosityFactor})</span></th>
                                                                    <th className="py-2 px-4 text-center w-32">Ação</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-slate-50">
                                                                {seller.days.map((day, idx) => (
                                                                    <tr key={idx} className="hover:bg-blue-50/30">
                                                                        <td className="py-3 px-8 font-mono text-slate-700">{formatDateString(day.date)}</td>
                                                                        <td className="py-3 px-4 text-slate-500 uppercase font-bold text-[10px]">{day.dayName}</td>
                                                                        <td className="py-3 px-4 text-center font-bold">{day.visitas.length}</td>
                                                                        <td className="py-3 px-4 text-right font-mono text-slate-700">{day.kmEstimado.toFixed(1)} km</td>
                                                                        <td className="py-3 px-4 text-center">
                                                                            <button 
                                                                                onClick={(e) => { e.stopPropagation(); setViewingRoute(day); }}
                                                                                className="text-white bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-[10px] font-bold shadow-sm transition flex items-center justify-center mx-auto"
                                                                            >
                                                                                <LocationMarkerIcon className="w-3 h-3 mr-1"/> Ver Rota
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
    );
};
