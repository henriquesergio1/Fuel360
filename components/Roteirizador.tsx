
import React, { useState, useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import { getVisitasPrevistas } from '../services/apiService.ts';
import { VisitaPrevista } from '../types.ts';
import { LocationMarkerIcon, SpinnerIcon, CalculatorIcon, ChevronRightIcon, ChevronDownIcon, ArrowLeftIcon, UserGroupIcon, UserIcon, PrinterIcon, ExclamationIcon } from './icons.tsx';
import L from 'leaflet';

// --- CONFIGURAÇÃO GLOBAL LEAFLET ---
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

// --- HELPERS ---
const calcDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
    const R = 6371; 
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
};

const formatDate = (iso: string) => {
    if(!iso) return '';
    try {
        const parts = iso.split('T')[0].split('-');
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    } catch(e) { return iso; }
};

// --- COMPONENTE INTERNO: MAP AUTO-FIT ---
// Apenas ajusta o zoom, não lida com resize
const MapAutoFit: React.FC<{ points: VisitaPrevista[] }> = ({ points }) => {
    const map = useMap();
    
    useEffect(() => {
        if (points && points.length > 0) {
            const validPoints = points.filter(p => p.Lat && p.Long);
            if (validPoints.length > 0) {
                const bounds = L.latLngBounds(validPoints.map(p => [p.Lat, p.Long]));
                if (bounds.isValid()) {
                    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
                }
            }
        }
        // Force redraw once
        map.invalidateSize();
    }, [map, points]);

    return null;
};

// --- COMPONENTE: MODAL DO MAPA (ISOLADO) ---
const MapModal: React.FC<{ 
    route: any; 
    onClose: () => void; 
}> = ({ route, onClose }) => {
    // ESTADO DE MONTAGEM TARDIA (CRÍTICO PARA CORRIGIR TELA CINZA)
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        // Aguarda 300ms para garantir que o Modal CSS (width/height) foi aplicado
        // antes de tentar renderizar o Leaflet.
        const timer = setTimeout(() => setIsMounted(true), 300);
        return () => clearTimeout(timer);
    }, []);

    const points = route.validPoints as VisitaPrevista[];
    const hasPoints = points.length > 0;
    const centerPos: [number, number] = hasPoints ? [points[0].Lat, points[0].Long] : [-23.55, -46.63];

    return (
        <div className="fixed inset-0 z-[200] bg-white flex flex-col h-screen w-screen">
            {/* Header */}
            <div className="h-16 bg-white border-b border-slate-200 flex justify-between items-center px-6 shrink-0 z-20 shadow-sm">
                <div className="flex items-center">
                    <button onClick={onClose} className="mr-4 p-2 hover:bg-slate-100 rounded-full transition text-slate-500">
                        <ArrowLeftIcon className="w-6 h-6"/>
                    </button>
                    <div>
                        <h2 className="text-lg font-bold text-slate-800 flex items-center">
                            <span className="font-mono mr-2">{formatDate(route.date)}</span>
                            <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded uppercase">{route.dayName}</span>
                        </h2>
                        <p className="text-xs text-slate-500">
                            {route.points.length} Visitas ({points.length} GPS) • <strong>{route.km.toFixed(1)} km</strong>
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => window.print()} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-bold flex items-center">
                        <PrinterIcon className="w-4 h-4 mr-2"/> Imprimir
                    </button>
                    <button onClick={onClose} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold shadow-md">
                        Fechar
                    </button>
                </div>
            </div>

            {/* Container do Mapa */}
            <div className="relative flex-1 bg-slate-100 w-full overflow-hidden">
                {/* Debug Panel */}
                <div className="absolute top-4 right-4 z-[9999] bg-white/90 backdrop-blur border border-slate-300 p-3 rounded shadow-lg text-xs font-mono pointer-events-none">
                    <p className="font-bold border-b border-slate-300 mb-1">Diagnóstico Mapa</p>
                    <p>Status: {isMounted ? 'Montado' : 'Carregando...'}</p>
                    <p>Pontos Válidos: {points.length}</p>
                    {hasPoints && <p>Centro: {centerPos[0].toFixed(4)}, {centerPos[1].toFixed(4)}</p>}
                </div>

                {!isMounted && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-50 z-50">
                        <div className="flex flex-col items-center animate-pulse">
                            <SpinnerIcon className="w-10 h-10 text-blue-600 mb-2"/>
                            <span className="text-sm font-bold text-slate-400">Carregando Mapa...</span>
                        </div>
                    </div>
                )}

                {isMounted && hasPoints ? (
                    <MapContainer 
                        center={centerPos} 
                        zoom={12} 
                        scrollWheelZoom={true}
                        style={{ height: '100%', width: '100%' }}
                    >
                        <MapAutoFit points={points} />
                        
                        {/* CartoDB Voyager - Mais rápido e limpo que OSM padrão */}
                        <TileLayer 
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" 
                        />

                        {/* Rota (Azul) */}
                        <Polyline 
                            positions={points.map(p => [p.Lat, p.Long])}
                            color="#2563eb"
                            weight={5}
                            opacity={0.8}
                        />
                        {/* Efeito Tracejado Branco */}
                        <Polyline 
                            positions={points.map(p => [p.Lat, p.Long])}
                            color="white"
                            weight={2}
                            opacity={0.5}
                            dashArray="5, 10"
                        />

                        {/* Marcadores */}
                        {points.map((p, idx) => (
                            <Marker key={`${idx}-${p.Lat}`} position={[p.Lat, p.Long]}>
                                <Popup>
                                    <div className="min-w-[200px]">
                                        <p className="font-bold text-sm border-b pb-1 mb-1 text-slate-800">{idx + 1}. {p.Razao_Social}</p>
                                        <p className="text-xs text-slate-600 mb-0.5"><strong>End:</strong> {p.Endereco}</p>
                                        <div className="mt-1 flex justify-between text-[10px] text-slate-400">
                                            <span>Lat: {p.Lat.toFixed(5)}</span>
                                            <span>Lon: {p.Long.toFixed(5)}</span>
                                        </div>
                                    </div>
                                </Popup>
                            </Marker>
                        ))}
                    </MapContainer>
                ) : isMounted && !hasPoints && (
                    <div className="flex h-full items-center justify-center flex-col text-slate-400">
                        <ExclamationIcon className="w-16 h-16 mb-4 opacity-50"/>
                        <h3 className="text-xl font-bold">Sem Coordenadas</h3>
                        <p className="max-w-md text-center mt-2">
                            Os endereços desta rota não possuem latitude/longitude válidas no cadastro.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- COMPONENTE PRINCIPAL ---
export const Roteirizador: React.FC = () => {
    // --- ESTADOS ---
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]);
    const [tortuosityFactor, setTortuosityFactor] = useState(1.3);
    const [selectedSupervisor, setSelectedSupervisor] = useState<string>('');
    const [selectedVendedor, setSelectedVendedor] = useState<string>('');

    const [loading, setLoading] = useState(false);
    const [rawData, setRawData] = useState<VisitaPrevista[]>([]);
    const [expandedSellers, setExpandedSellers] = useState<Set<number>>(new Set());
    
    // Rota Selecionada para o Modal
    const [viewingRoute, setViewingRoute] = useState<any | null>(null);

    // --- CARREGAMENTO DE DADOS ---
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

    // --- FILTROS ---
    const supervisors = useMemo(() => {
        const map = new Map<number, string>();
        rawData.forEach(v => map.set(v.Cod_Supervisor, v.Nome_Supervisor));
        return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
    }, [rawData]);

    const sellers = useMemo(() => {
        const map = new Map<number, string>();
        rawData.forEach(v => {
            if (!selectedSupervisor || String(v.Cod_Supervisor) === selectedSupervisor) {
                map.set(v.Cod_Vend, v.Nome_Vendedor);
            }
        });
        return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
    }, [rawData, selectedSupervisor]);

    // --- PROCESSAMENTO ---
    const groupedData = useMemo(() => {
        if (rawData.length === 0) return [];

        const filtered = rawData.filter(v => {
            if (selectedSupervisor && String(v.Cod_Supervisor) !== selectedSupervisor) return false;
            if (selectedVendedor && String(v.Cod_Vend) !== selectedVendedor) return false;
            return true;
        });

        const sellerMap = new Map<number, any>();

        filtered.forEach(v => {
            if (!sellerMap.has(v.Cod_Vend)) {
                sellerMap.set(v.Cod_Vend, {
                    id: v.Cod_Vend,
                    name: v.Nome_Vendedor,
                    supervisorId: v.Cod_Supervisor,
                    supervisor: v.Nome_Supervisor,
                    days: new Map<string, any>()
                });
            }
            
            let dateKey = '';
            if (v.Data_da_Visita) {
                if(typeof v.Data_da_Visita === 'string') dateKey = v.Data_da_Visita.substring(0, 10);
                else try { dateKey = new Date(v.Data_da_Visita).toISOString().substring(0, 10); } catch(e){}
            }

            if (dateKey) {
                const seller = sellerMap.get(v.Cod_Vend);
                if (!seller.days.has(dateKey)) seller.days.set(dateKey, []);
                seller.days.get(dateKey).push(v);
            }
        });

        const result = [];
        for (const seller of sellerMap.values()) {
            const daysArr = [];
            let totalKm = 0;

            for (const [date, visits] of seller.days.entries()) {
                const validPoints = (visits as VisitaPrevista[]).filter(p => 
                    p.Lat !== undefined && p.Long !== undefined && 
                    !isNaN(p.Lat) && !isNaN(p.Long) &&
                    p.Lat !== 0 && p.Long !== 0
                );
                
                let kmReta = 0;
                for (let i = 0; i < validPoints.length - 1; i++) {
                    kmReta += calcDistance(validPoints[i].Lat, validPoints[i].Long, validPoints[i+1].Lat, validPoints[i+1].Long);
                }
                
                const kmEst = kmReta * tortuosityFactor;
                totalKm += kmEst;

                daysArr.push({
                    date: date,
                    dayName: (visits as any[])[0].Dia_Semana || '',
                    km: kmEst,
                    points: visits,
                    validPoints: validPoints
                });
            }
            
            daysArr.sort((a, b) => a.date.localeCompare(b.date));

            if(daysArr.length > 0) {
                result.push({ ...seller, totalKm: totalKm, days: daysArr });
            }
        }

        return result.sort((a, b) => a.id - b.id);
    }, [rawData, selectedSupervisor, selectedVendedor, tortuosityFactor]);

    // --- RENDERIZAÇÃO ---
    return (
        <div className="space-y-6 animate-fade-in">
            {/* Modal Condicional */}
            {viewingRoute && <MapModal route={viewingRoute} onClose={() => setViewingRoute(null)} />}

            <div className="flex justify-between items-end">
                <div>
                    <h2 className="text-3xl font-extrabold text-slate-800 mb-1 tracking-tight">Roteirizador Previsto</h2>
                    <p className="text-slate-500 font-medium">Análise de quilometragem teórica baseada na agenda.</p>
                </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex flex-wrap gap-4 items-end">
                    <div className="w-40">
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Início</label>
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600"/>
                    </div>
                    <div className="w-40">
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fim</label>
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600"/>
                    </div>
                    <div className="w-24">
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fator</label>
                        <input type="number" step="0.1" value={tortuosityFactor} onChange={e => setTortuosityFactor(parseFloat(e.target.value))} className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-sm text-center font-bold outline-none focus:ring-2 focus:ring-blue-600"/>
                    </div>
                    <button 
                        onClick={handleCalculate} 
                        disabled={loading}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-6 rounded-lg shadow-md flex items-center transition disabled:opacity-50"
                    >
                        {loading ? <SpinnerIcon className="w-5 h-5 mr-2"/> : <CalculatorIcon className="w-5 h-5 mr-2"/>}
                        Calcular Rota
                    </button>
                </div>

                {rawData.length > 0 && (
                    <div className="mt-5 pt-5 border-t border-slate-100 flex flex-wrap gap-4 animate-fade-in">
                        <div className="w-64">
                            <label className="block text-xs font-bold text-slate-400 uppercase mb-1 flex items-center"><UserGroupIcon className="w-3 h-3 mr-1"/> Supervisor</label>
                            <select value={selectedSupervisor} onChange={e => setSelectedSupervisor(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="">Todos</option>
                                {supervisors.map(([id, name]) => <option key={id} value={id}>{id} - {name}</option>)}
                            </select>
                        </div>
                        <div className="w-64">
                            <label className="block text-xs font-bold text-slate-400 uppercase mb-1 flex items-center"><UserIcon className="w-3 h-3 mr-1"/> Vendedor</label>
                            <select value={selectedVendedor} onChange={e => setSelectedVendedor(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="">Todos</option>
                                {sellers.map(([id, name]) => <option key={id} value={id}>{id} - {name}</option>)}
                            </select>
                        </div>
                    </div>
                )}
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full text-sm text-left text-slate-600">
                    <thead className="bg-slate-50 text-slate-500 uppercase font-semibold text-xs border-b border-slate-200">
                        <tr>
                            <th className="p-4 w-12 text-center">#</th>
                            <th className="p-4">Vendedor (Cód - Nome)</th>
                            <th className="p-4">Supervisor (Cód - Nome)</th>
                            <th className="p-4 text-center">Dias Calc.</th>
                            <th className="p-4 text-right">KM Total</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {groupedData.length === 0 ? (
                            <tr><td colSpan={5} className="p-12 text-center text-slate-400">
                                {loading ? "Processando..." : "Nenhuma rota calculada. Selecione o período e clique em Calcular."}
                            </td></tr>
                        ) : (
                            groupedData.map(seller => {
                                const isExpanded = expandedSellers.has(seller.id);
                                return (
                                    <React.Fragment key={seller.id}>
                                        <tr 
                                            onClick={() => {
                                                const newSet = new Set(expandedSellers);
                                                if (newSet.has(seller.id)) newSet.delete(seller.id);
                                                else newSet.add(seller.id);
                                                setExpandedSellers(newSet);
                                            }}
                                            className={`cursor-pointer transition-colors ${isExpanded ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}
                                        >
                                            <td className="p-4 text-center">
                                                {isExpanded ? <ChevronDownIcon className="w-4 h-4 text-blue-500"/> : <ChevronRightIcon className="w-4 h-4 text-slate-400"/>}
                                            </td>
                                            <td className="p-4">
                                                <div className="font-bold text-slate-800">{seller.id} - {seller.name}</div>
                                            </td>
                                            <td className="p-4 text-slate-600">
                                                {seller.supervisorId} - {seller.supervisor}
                                            </td>
                                            <td className="p-4 text-center font-mono font-bold text-slate-500">{seller.days.length}</td>
                                            <td className="p-4 text-right font-bold text-blue-600 text-base">{seller.totalKm.toFixed(1)} km</td>
                                        </tr>

                                        {isExpanded && (
                                            <tr className="bg-slate-50/50 shadow-inner">
                                                <td colSpan={5} className="p-0">
                                                    <div className="bg-white border-y border-slate-200">
                                                        <table className="w-full text-xs">
                                                            <thead className="bg-slate-100 text-slate-500 uppercase font-bold">
                                                                <tr>
                                                                    <th className="px-8 py-2 text-left w-48">Data</th>
                                                                    <th className="px-4 py-2 text-center">Visitas</th>
                                                                    <th className="px-4 py-2 text-center">Coords OK</th>
                                                                    <th className="px-4 py-2 text-right">KM Est.</th>
                                                                    <th className="px-4 py-2 text-center">Ação</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-slate-50 text-slate-600">
                                                                {seller.days.map((day: any, idx: number) => {
                                                                    const validCount = day.validPoints.length;
                                                                    return (
                                                                        <tr key={`${seller.id}-${idx}`} className="hover:bg-blue-50/30">
                                                                            <td className="px-8 py-3 font-mono text-slate-700">
                                                                                {formatDate(day.date)} <span className="ml-2 text-[10px] text-slate-400 uppercase font-bold">{day.dayName}</span>
                                                                            </td>
                                                                            <td className="px-4 py-3 text-center font-bold">{day.points.length}</td>
                                                                            <td className="px-4 py-3 text-center">
                                                                                {validCount > 0 ? 
                                                                                    <span className="text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded">{validCount}</span> : 
                                                                                    <span className="text-red-400 font-bold bg-red-50 px-2 py-0.5 rounded">0</span>
                                                                                }
                                                                            </td>
                                                                            <td className="px-4 py-3 text-right font-mono">{day.km.toFixed(1)}</td>
                                                                            <td className="px-4 py-3 text-center">
                                                                                <button 
                                                                                    onClick={(e) => { e.stopPropagation(); setViewingRoute(day); }}
                                                                                    className="inline-flex items-center bg-white border border-blue-200 text-blue-600 hover:bg-blue-50 hover:text-blue-800 px-3 py-1 rounded text-[10px] font-bold uppercase shadow-sm transition"
                                                                                >
                                                                                    <LocationMarkerIcon className="w-3 h-3 mr-1"/> Ver Rota
                                                                                </button>
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
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
