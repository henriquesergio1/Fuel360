
import React, { useState, useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import { getVisitasPrevistas } from '../services/apiService.ts';
import { VisitaPrevista } from '../types.ts';
import { LocationMarkerIcon, SpinnerIcon, CalculatorIcon, UsersIcon, ChevronRightIcon, ChevronDownIcon, ArrowLeftIcon, UserGroupIcon, UserIcon, PrinterIcon } from './icons.tsx';
import L from 'leaflet';

// --- CONFIGURAÇÃO GLOBAL LEAFLET ---
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

// --- HOOKS DO MAPA ---

// 1. Hook para Forçar Renderização dos Tiles (Correção do "Cinza")
const MapAutoResize = () => {
    const map = useMap();
    
    useEffect(() => {
        // Função que força o Leaflet a ler o tamanho da div
        const trigger = () => {
            // console.log('Resizing map...'); // Debug
            map.invalidateSize();
        };

        // 1. Imediato
        trigger();

        // 2. Intervalo curto (polling) por 1.5 segundos para garantir que a animação do modal terminou
        const intervalId = setInterval(trigger, 100);
        
        // 3. Parar após 1.5s
        const timeoutId = setTimeout(() => {
            clearInterval(intervalId);
            trigger(); // Uma última vez para garantir
        }, 1500);

        return () => {
            clearInterval(intervalId);
            clearTimeout(timeoutId);
        };
    }, [map]);

    return null;
};

// 2. Hook para Centralizar nos Pontos
const MapAutoFit: React.FC<{ points: VisitaPrevista[] }> = ({ points }) => {
    const map = useMap();
    
    useEffect(() => {
        if (points.length > 0) {
            try {
                const bounds = L.latLngBounds(points.map(p => [p.Lat, p.Long]));
                if (bounds.isValid()) {
                    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
                }
            } catch (e) {
                console.error("Erro ao ajustar zoom", e);
            }
        }
    }, [points, map]);

    return null;
};

// --- FUNÇÕES ---
const calcDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; 
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

const formatDateString = (isoDateStr: string) => {
    if (!isoDateStr) return '-';
    const cleanDate = isoDateStr.split('T')[0];
    const [y, m, d] = cleanDate.split('-');
    return `${d}/${m}/${y}`;
};

// --- COMPONENTE ---
export const Roteirizador: React.FC = () => {
    // Filtros
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]);
    const [tortuosityFactor, setTortuosityFactor] = useState(1.3);
    const [selectedSupervisor, setSelectedSupervisor] = useState<string>('');
    const [selectedVendedor, setSelectedVendedor] = useState<string>('');

    // Dados
    const [loading, setLoading] = useState(false);
    const [rawData, setRawData] = useState<VisitaPrevista[]>([]);
    const [expandedSellers, setExpandedSellers] = useState<Set<number>>(new Set());
    
    // UI Mapa
    const [viewingRoute, setViewingRoute] = useState<any | null>(null);
    const [isMapMounted, setIsMapMounted] = useState(false);

    const handleCalculate = async () => {
        setLoading(true);
        setRawData([]);
        setViewingRoute(null);
        try {
            const data = await getVisitasPrevistas(startDate, endDate);
            setRawData(data);
        } catch (e: any) {
            alert("Erro ao calcular: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    // --- LISTAS E DROPDOWNS (Ordenado por CÓDIGO) ---
    const supervisors = useMemo(() => {
        const map = new Map();
        rawData.forEach(v => map.set(v.Cod_Supervisor, v.Nome_Supervisor));
        return Array.from(map.entries()).sort((a, b) => a[0] - b[0]); // Ordena por ID
    }, [rawData]);

    const sellers = useMemo(() => {
        const map = new Map();
        rawData.forEach(v => {
            if (!selectedSupervisor || String(v.Cod_Supervisor) === selectedSupervisor) {
                map.set(v.Cod_Vend, v.Nome_Vendedor);
            }
        });
        return Array.from(map.entries()).sort((a, b) => a[0] - b[0]); // Ordena por ID
    }, [rawData, selectedSupervisor]);

    // --- PROCESSAMENTO DE DADOS ---
    const groupedData = useMemo(() => {
        if (rawData.length === 0) return [];

        // 1. Filtrar
        const filtered = rawData.filter(v => {
            if (selectedSupervisor && String(v.Cod_Supervisor) !== selectedSupervisor) return false;
            if (selectedVendedor && String(v.Cod_Vend) !== selectedVendedor) return false;
            return true;
        });

        // 2. Agrupar
        const sellerMap = new Map();
        filtered.forEach(v => {
            if (!sellerMap.has(v.Cod_Vend)) {
                sellerMap.set(v.Cod_Vend, {
                    id: v.Cod_Vend,
                    name: v.Nome_Vendedor,
                    supervisorId: v.Cod_Supervisor, // Captura ID Supervisor
                    supervisor: v.Nome_Supervisor,
                    days: new Map()
                });
            }
            const seller = sellerMap.get(v.Cod_Vend);
            
            // Tratamento robusto de data
            let dateKey = '';
            if (v.Data_da_Visita) {
                if(typeof v.Data_da_Visita === 'string') dateKey = v.Data_da_Visita.split('T')[0];
                // @ts-ignore
                else if (v.Data_da_Visita.toISOString) dateKey = v.Data_da_Visita.toISOString().split('T')[0];
            }

            if (dateKey) {
                if (!seller.days.has(dateKey)) seller.days.set(dateKey, []);
                seller.days.get(dateKey).push(v);
            }
        });

        // 3. Calcular KM
        const result = [];
        for (const seller of sellerMap.values()) {
            const daysArr = [];
            let totalKm = 0;

            for (const [date, visits] of seller.days.entries()) {
                const validPoints = (visits as VisitaPrevista[]).filter(p => p.Lat && p.Long && p.Lat !== 0);
                
                let kmReta = 0;
                for (let i = 0; i < validPoints.length - 1; i++) {
                    kmReta += calcDistance(validPoints[i].Lat, validPoints[i].Long, validPoints[i+1].Lat, validPoints[i+1].Long);
                }
                const kmEst = kmReta * tortuosityFactor;
                totalKm += kmEst;

                daysArr.push({
                    date: date,
                    dayName: visits[0].Dia_Semana,
                    km: kmEst,
                    points: validPoints
                });
            }
            
            daysArr.sort((a, b) => a.date.localeCompare(b.date));

            if(daysArr.length > 0) {
                result.push({ ...seller, totalKm: totalKm, days: daysArr });
            }
        }

        // --- ORDENAR RESULTADO POR CÓDIGO DO VENDEDOR ---
        return result.sort((a, b) => a.id - b.id);
    }, [rawData, selectedSupervisor, selectedVendedor, tortuosityFactor]);

    // Handlers Mapa
    const openMap = (dayRoute: any) => {
        setViewingRoute(dayRoute);
        setIsMapMounted(false);
        // Delay minúsculo para garantir que o DOM renderizou o container antes de montar o Leaflet
        setTimeout(() => setIsMapMounted(true), 50);
    };

    const closeMap = () => {
        setViewingRoute(null);
        setIsMapMounted(false);
    };

    // --- RENDERIZAR MAPA (MODAL) ---
    if (viewingRoute) {
        return (
            <div className="fixed inset-0 z-[100] bg-white flex flex-col">
                {/* CSS INJECTION PARA CORRIGIR CONFLITO TAILWIND/LEAFLET */}
                <style>{`
                    .leaflet-pane img { max-width: none !important; box-shadow: none !important; }
                    .leaflet-container { width: 100%; height: 100%; }
                `}</style>

                {/* Header */}
                <div className="h-16 border-b border-slate-200 px-6 flex justify-between items-center bg-white shadow-sm shrink-0">
                    <div className="flex items-center">
                        <button onClick={closeMap} className="mr-4 p-2 rounded-full hover:bg-slate-100 transition">
                            <ArrowLeftIcon className="w-6 h-6 text-slate-600"/>
                        </button>
                        <div>
                            <h2 className="text-lg font-bold text-slate-800 flex items-center">
                                {formatDateString(viewingRoute.date)} 
                                <span className="ml-3 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded uppercase font-bold">{viewingRoute.dayName}</span>
                            </h2>
                            <p className="text-xs text-slate-500">{viewingRoute.points.length} locais de visita • {viewingRoute.km.toFixed(1)} km previstos</p>
                        </div>
                    </div>
                    <button onClick={() => window.print()} className="bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 px-4 py-2 rounded-lg text-sm font-bold flex items-center shadow-sm">
                        <PrinterIcon className="w-4 h-4 mr-2"/> Imprimir
                    </button>
                </div>

                {/* Map Body */}
                <div className="flex-1 relative bg-slate-100">
                    {!isMapMounted && (
                        <div className="absolute inset-0 flex items-center justify-center bg-white z-50">
                            <SpinnerIcon className="w-10 h-10 text-blue-600"/>
                        </div>
                    )}
                    
                    {/* Renderiza o container apenas quando o estado permitir */}
                    {isMapMounted && (
                        <MapContainer 
                            center={[-23.55, -46.63]} 
                            zoom={10} 
                            style={{ height: "100%", width: "100%" }}
                        >
                            <MapAutoResize /> {/* CORREÇÃO DE TILES CINZA */}
                            <TileLayer 
                                attribution='&copy; OpenStreetMap'
                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" 
                            />
                            <MapAutoFit points={viewingRoute.points} />

                            {/* Renderiza Linha (Fundo Azul) */}
                            <Polyline 
                                positions={viewingRoute.points.map((p: any) => [p.Lat, p.Long])}
                                color="#2563eb"
                                weight={5}
                                opacity={0.6}
                            />
                            {/* Renderiza Linha (Tracejado Branco) */}
                            <Polyline 
                                positions={viewingRoute.points.map((p: any) => [p.Lat, p.Long])}
                                color="white"
                                weight={2}
                                opacity={0.8}
                                dashArray="5, 10"
                            />

                            {viewingRoute.points.map((p: any, idx: number) => (
                                <Marker key={idx} position={[p.Lat, p.Long]}>
                                    <Popup>
                                        <div className="font-sans text-sm">
                                            <p className="font-bold mb-1 text-slate-800">{idx + 1}. {p.Razao_Social}</p>
                                            <p className="text-slate-500 text-xs">{p.Endereco}</p>
                                            <p className="text-slate-400 text-[10px] uppercase mt-1">{p.Bairro} - {p.Cidade}</p>
                                        </div>
                                    </Popup>
                                </Marker>
                            ))}
                        </MapContainer>
                    )}
                </div>
            </div>
        );
    }

    // --- RENDERIZAR TABELA ---
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-end">
                <div>
                    <h2 className="text-3xl font-extrabold text-slate-800 mb-1 tracking-tight">Roteirizador Previsto</h2>
                    <p className="text-slate-500 font-medium">Análise de quilometragem baseada na agenda.</p>
                </div>
            </div>

            {/* Filtros */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex flex-wrap gap-4 items-end">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Início</label>
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600"/>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fim</label>
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600"/>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fator (Curvas)</label>
                        <input type="number" step="0.1" value={tortuosityFactor} onChange={e => setTortuosityFactor(parseFloat(e.target.value))} className="bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-sm w-24 text-center font-bold"/>
                    </div>
                    <button 
                        onClick={handleCalculate} 
                        disabled={loading}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-6 rounded-lg shadow-md flex items-center transition"
                    >
                        {loading ? <SpinnerIcon className="w-5 h-5 mr-2"/> : <CalculatorIcon className="w-5 h-5 mr-2"/>}
                        Calcular
                    </button>
                </div>

                {rawData.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-slate-100 flex gap-4">
                        <div className="w-64">
                            <label className="block text-xs font-bold text-slate-400 uppercase mb-1 flex items-center"><UserGroupIcon className="w-3 h-3 mr-1"/> Filtrar Supervisor</label>
                            <select value={selectedSupervisor} onChange={e => setSelectedSupervisor(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm">
                                <option value="">Todos</option>
                                {supervisors.map(([id, name]) => <option key={id} value={id}>{id} - {name}</option>)}
                            </select>
                        </div>
                        <div className="w-64">
                            <label className="block text-xs font-bold text-slate-400 uppercase mb-1 flex items-center"><UserIcon className="w-3 h-3 mr-1"/> Filtrar Vendedor</label>
                            <select value={selectedVendedor} onChange={e => setSelectedVendedor(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm">
                                <option value="">Todos</option>
                                {sellers.map(([id, name]) => <option key={id} value={id}>{id} - {name}</option>)}
                            </select>
                        </div>
                    </div>
                )}
            </div>

            {/* Tabela */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full text-sm text-left text-slate-600">
                    <thead className="bg-slate-50 text-slate-500 uppercase font-semibold text-xs border-b border-slate-200">
                        <tr>
                            <th className="p-4 w-10"></th>
                            <th className="p-4">Vendedor (Cód - Nome)</th>
                            <th className="p-4">Supervisor</th>
                            <th className="p-4 text-center">Dias Calculados</th>
                            <th className="p-4 text-right">KM Total</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {groupedData.length === 0 ? (
                            <tr><td colSpan={5} className="p-12 text-center text-slate-400">
                                {loading ? "Processando..." : "Nenhuma visita encontrada no período."}
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
                                            className={`cursor-pointer hover:bg-slate-50 transition ${isExpanded ? 'bg-slate-50' : ''}`}
                                        >
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
                                            <td className="p-4 text-right font-bold text-blue-600">{seller.totalKm.toFixed(1)} km</td>
                                        </tr>
                                        
                                        {isExpanded && (
                                            <tr className="bg-slate-50/50 shadow-inner">
                                                <td colSpan={5} className="p-0">
                                                    <div className="bg-white border-y border-slate-200">
                                                        <table className="w-full text-xs">
                                                            <thead className="bg-slate-100 text-slate-500 uppercase">
                                                                <tr>
                                                                    <th className="px-8 py-3 text-left">Data</th>
                                                                    <th className="px-4 py-3 text-center">Qtd Visitas</th>
                                                                    <th className="px-4 py-3 text-right">KM Dia</th>
                                                                    <th className="px-4 py-3 text-center">Ação</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-slate-50">
                                                                {seller.days.map((day: any, idx: number) => (
                                                                    <tr key={idx} className="hover:bg-blue-50/30">
                                                                        <td className="px-8 py-3 font-mono text-slate-700">
                                                                            {formatDateString(day.date)} 
                                                                            <span className="ml-2 text-[10px] text-slate-400 uppercase font-bold">{day.dayName}</span>
                                                                        </td>
                                                                        <td className="px-4 py-3 text-center font-bold">{day.points.length}</td>
                                                                        <td className="px-4 py-3 text-right">{day.km.toFixed(1)}</td>
                                                                        <td className="px-4 py-3 text-center">
                                                                            <button 
                                                                                onClick={(e) => { e.stopPropagation(); openMap(day); }}
                                                                                className="bg-white border border-blue-200 text-blue-600 hover:bg-blue-50 hover:text-blue-800 px-3 py-1 rounded shadow-sm text-[10px] font-bold uppercase transition flex items-center mx-auto"
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
