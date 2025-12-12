
import React, { useState, useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import { getVisitasPrevistas } from '../services/apiService.ts';
import { VisitaPrevista } from '../types.ts';
import { LocationMarkerIcon, SpinnerIcon, CalculatorIcon, ChevronRightIcon, ChevronDownIcon, ArrowLeftIcon, UserGroupIcon, UserIcon, PrinterIcon, ExclamationIcon, CheckCircleIcon } from './icons.tsx';
import L from 'leaflet';

// --- CONFIGURAÇÃO DE ÍCONES LEAFLET ---
// Resolve o bug dos ícones padrão não aparecerem
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
    const parts = iso.split('T')[0].split('-');
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

// --- COMPONENTE INTERNO: MAP UPDATER ---
// Responsável por ajustar o zoom e corrigir o tamanho do mapa ao carregar
const MapUpdater: React.FC<{ points: VisitaPrevista[] }> = ({ points }) => {
    const map = useMap();

    useEffect(() => {
        // 1. Força atualização do tamanho do container (Correção da "Tela Cinza")
        const resizeObserver = new ResizeObserver(() => {
            map.invalidateSize();
        });
        resizeObserver.observe(map.getContainer());

        // 2. Ajusta o Zoom para mostrar todos os pontos
        if (points && points.length > 0) {
            const validPoints = points.filter(p => p.Lat && p.Long);
            if (validPoints.length > 0) {
                const bounds = new L.LatLngBounds(validPoints.map(p => [p.Lat, p.Long]));
                if (bounds.isValid()) {
                    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
                }
            }
        }

        return () => {
            resizeObserver.disconnect();
        };
    }, [map, points]);

    return null;
};

// --- COMPONENTE PRINCIPAL ---
export const Roteirizador: React.FC = () => {
    // Filtros e Dados
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]);
    const [tortuosityFactor, setTortuosityFactor] = useState(1.3);
    const [selectedSupervisor, setSelectedSupervisor] = useState<string>('');
    const [selectedVendedor, setSelectedVendedor] = useState<string>('');
    
    const [loading, setLoading] = useState(false);
    const [rawData, setRawData] = useState<VisitaPrevista[]>([]);
    const [expandedSellers, setExpandedSellers] = useState<Set<number>>(new Set());
    
    // Estado da Visualização do Mapa (Rota Selecionada)
    const [viewingRoute, setViewingRoute] = useState<any | null>(null);

    // --- CARREGAMENTO ---
    const handleCalculate = async () => {
        setLoading(true);
        setRawData([]);
        setViewingRoute(null);
        setExpandedSellers(new Set());
        try {
            const data = await getVisitasPrevistas(startDate, endDate);
            // Sanitização básica dos dados vindos da API
            const cleanData = data.map(d => ({
                ...d,
                Lat: Number(d.Lat),
                Long: Number(d.Long)
            }));
            setRawData(cleanData);
        } catch (e: any) {
            alert("Erro ao calcular: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    // --- PROCESSAMENTO E AGRUPAMENTO ---
    const { processedData, uniqueSupervisors, uniqueSellers } = useMemo(() => {
        const supers = new Map<number, string>();
        const vends = new Map<number, string>();
        
        // 1. Filtragem Inicial
        const filtered = rawData.filter(v => {
            supers.set(v.Cod_Supervisor, v.Nome_Supervisor);
            // Filtro dinâmico de vendedores baseado no supervisor selecionado
            if (!selectedSupervisor || String(v.Cod_Supervisor) === selectedSupervisor) {
                vends.set(v.Cod_Vend, v.Nome_Vendedor);
            }

            if (selectedSupervisor && String(v.Cod_Supervisor) !== selectedSupervisor) return false;
            if (selectedVendedor && String(v.Cod_Vend) !== selectedVendedor) return false;
            return true;
        });

        // 2. Agrupamento por Vendedor -> Dia
        const sellerMap = new Map<number, any>();

        filtered.forEach(visit => {
            if (!sellerMap.has(visit.Cod_Vend)) {
                sellerMap.set(visit.Cod_Vend, {
                    id: visit.Cod_Vend,
                    name: visit.Nome_Vendedor,
                    supervisorId: visit.Cod_Supervisor,
                    supervisor: visit.Nome_Supervisor,
                    days: new Map<string, VisitaPrevista[]>()
                });
            }
            
            // Extrai data YYYY-MM-DD
            let dateKey = '';
            if (typeof visit.Data_da_Visita === 'string') dateKey = visit.Data_da_Visita.split('T')[0];
            
            if (dateKey) {
                const seller = sellerMap.get(visit.Cod_Vend);
                if (!seller.days.has(dateKey)) seller.days.set(dateKey, []);
                seller.days.get(dateKey).push(visit);
            }
        });

        // 3. Cálculo de Rotas
        const result = [];
        for (const seller of sellerMap.values()) {
            const daysArr = [];
            let totalKmSeller = 0;

            for (const [date, visits] of seller.days.entries()) {
                // Filtra apenas pontos com lat/long válidos para cálculo
                const geoPoints = visits.filter((p: VisitaPrevista) => p.Lat !== 0 && p.Long !== 0 && !isNaN(p.Lat) && !isNaN(p.Long));
                
                let kmReta = 0;
                // Ordenação ingênua (pela ordem do banco). 
                for (let i = 0; i < geoPoints.length - 1; i++) {
                    kmReta += calcDistance(geoPoints[i].Lat, geoPoints[i].Long, geoPoints[i+1].Lat, geoPoints[i+1].Long);
                }
                const kmEst = kmReta * tortuosityFactor;
                totalKmSeller += kmEst;

                daysArr.push({
                    date: date,
                    dayName: visits[0].Dia_Semana || '',
                    km: kmEst,
                    points: visits, // Mantém todos para exibir na lista, mesmo sem geo
                    validPoints: geoPoints // Pontos plotáveis
                });
            }
            
            daysArr.sort((a, b) => a.date.localeCompare(b.date));

            if (daysArr.length > 0) {
                result.push({ ...seller, totalKm: totalKmSeller, days: daysArr });
            }
        }

        return {
            processedData: result.sort((a, b) => a.id - b.id), // Ordena por ID Vendedor
            uniqueSupervisors: Array.from(supers.entries()).sort((a,b) => a[0] - b[0]),
            uniqueSellers: Array.from(vends.entries()).sort((a,b) => a[0] - b[0])
        };
    }, [rawData, selectedSupervisor, selectedVendedor, tortuosityFactor]);

    // --- MODAL DO MAPA ---
    const renderMapModal = () => {
        if (!viewingRoute) return null;

        const points = viewingRoute.validPoints as VisitaPrevista[];
        const hasPoints = points.length > 0;
        const centerPos: [number, number] = hasPoints ? [points[0].Lat, points[0].Long] : [-23.5505, -46.6333];

        return (
            <div className="fixed inset-0 z-[200] bg-white flex flex-col h-screen w-screen">
                {/* 1. Header Fixo */}
                <div className="h-16 bg-white border-b border-slate-200 flex justify-between items-center px-6 shrink-0 z-20 shadow-sm">
                    <div className="flex items-center">
                        <button onClick={() => setViewingRoute(null)} className="mr-4 p-2 hover:bg-slate-100 rounded-full transition">
                            <ArrowLeftIcon className="w-6 h-6 text-slate-600"/>
                        </button>
                        <div>
                            <h2 className="text-lg font-bold text-slate-800 flex items-center">
                                Rota de {formatDate(viewingRoute.date)}
                                <span className="ml-3 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded uppercase">{viewingRoute.dayName}</span>
                            </h2>
                            <p className="text-xs text-slate-500">
                                {viewingRoute.points.length} Visitas ({points.length} geolocalizadas) • {viewingRoute.km.toFixed(1)} km est.
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => window.print()} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-bold flex items-center">
                            <PrinterIcon className="w-4 h-4 mr-2"/> Imprimir
                        </button>
                        <button onClick={() => setViewingRoute(null)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold shadow-md">
                            Fechar Mapa
                        </button>
                    </div>
                </div>

                {/* 2. Container do Mapa (Ocupa o resto da tela) */}
                <div className="relative flex-1 bg-slate-100 w-full">
                    {/* Debug Info Overlay */}
                    <div className="absolute top-4 right-4 z-[1000] bg-white/90 backdrop-blur border border-slate-300 p-3 rounded shadow-lg text-xs font-mono">
                        <p className="font-bold border-b border-slate-300 mb-1">Debug Info</p>
                        <p>Total Pontos: {viewingRoute.points.length}</p>
                        <p className={hasPoints ? "text-emerald-600" : "text-red-600"}>
                            Pontos Válidos: {points.length}
                        </p>
                        {!hasPoints && <p className="text-red-500 font-bold mt-1">Sem coordenadas válidas!</p>}
                    </div>

                    {hasPoints ? (
                        <MapContainer
                            key={viewingRoute.date + '-' + points.length} // Chave única força recriação limpa do mapa
                            center={centerPos}
                            zoom={12}
                            scrollWheelZoom={true}
                            style={{ height: '100%', width: '100%', position: 'absolute', top: 0, left: 0 }}
                        >
                            <TileLayer
                                attribution='&copy; OpenStreetMap'
                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            />
                            <MapUpdater points={points} />

                            {/* Linha da Rota */}
                            <Polyline
                                positions={points.map(p => [p.Lat, p.Long])}
                                color="#2563eb"
                                weight={4}
                                opacity={0.7}
                            />

                            {/* Marcadores */}
                            {points.map((p, idx) => (
                                <Marker key={`${idx}-${p.Lat}-${p.Long}`} position={[p.Lat, p.Long]}>
                                    <Popup>
                                        <div className="min-w-[180px]">
                                            <strong className="block text-sm mb-1 text-slate-800">{idx + 1}. {p.Razao_Social}</strong>
                                            <span className="block text-xs text-slate-500 mb-1">{p.Endereco}</span>
                                            <span className="block text-[10px] text-slate-400 uppercase">{p.Bairro} - {p.Cidade}</span>
                                        </div>
                                    </Popup>
                                </Marker>
                            ))}
                        </MapContainer>
                    ) : (
                        <div className="flex h-full items-center justify-center flex-col text-slate-400">
                            <ExclamationIcon className="w-16 h-16 mb-4 opacity-50"/>
                            <h3 className="text-xl font-bold">Dados de Geolocalização Indisponíveis</h3>
                            <p className="max-w-md text-center mt-2">
                                As visitas desta rota não possuem coordenadas (Latitude/Longitude) válidas no banco de dados.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // --- RENDERIZAR TABELA ---
    return (
        <div className="space-y-6 animate-fade-in">
            {renderMapModal()}

            <div className="flex justify-between items-end">
                <div>
                    <h2 className="text-3xl font-extrabold text-slate-800 mb-1 tracking-tight">Roteirizador Previsto</h2>
                    <p className="text-slate-500 font-medium">Análise de quilometragem teórica baseada na agenda.</p>
                </div>
            </div>

            {/* Painel de Filtros */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex flex-wrap gap-4 items-end">
                    <div className="w-40">
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Início</label>
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-sm"/>
                    </div>
                    <div className="w-40">
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fim</label>
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-sm"/>
                    </div>
                    <div className="w-24">
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fator</label>
                        <input type="number" step="0.1" value={tortuosityFactor} onChange={e => setTortuosityFactor(parseFloat(e.target.value))} className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-sm font-bold text-center"/>
                    </div>
                    <button onClick={handleCalculate} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-6 rounded-lg shadow-md flex items-center transition disabled:opacity-50">
                        {loading ? <SpinnerIcon className="w-5 h-5 mr-2"/> : <CalculatorIcon className="w-5 h-5 mr-2"/>} Calcular
                    </button>
                </div>

                {rawData.length > 0 && (
                    <div className="mt-5 pt-5 border-t border-slate-100 flex flex-wrap gap-4">
                        <div className="w-64">
                            <label className="block text-xs font-bold text-slate-400 uppercase mb-1 flex items-center"><UserGroupIcon className="w-3 h-3 mr-1"/> Supervisor</label>
                            <select value={selectedSupervisor} onChange={e => setSelectedSupervisor(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm">
                                <option value="">Todos</option>
                                {uniqueSupervisors.map(([id, name]) => <option key={id} value={id}>{id} - {name}</option>)}
                            </select>
                        </div>
                        <div className="w-64">
                            <label className="block text-xs font-bold text-slate-400 uppercase mb-1 flex items-center"><UserIcon className="w-3 h-3 mr-1"/> Vendedor</label>
                            <select value={selectedVendedor} onChange={e => setSelectedVendedor(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm">
                                <option value="">Todos</option>
                                {uniqueSellers.map(([id, name]) => <option key={id} value={id}>{id} - {name}</option>)}
                            </select>
                        </div>
                    </div>
                )}
            </div>

            {/* Tabela de Resultados */}
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
                        {processedData.length === 0 ? (
                            <tr><td colSpan={5} className="p-12 text-center text-slate-400">{loading ? "Processando..." : "Nenhuma rota encontrada."}</td></tr>
                        ) : (
                            processedData.map(seller => {
                                const isExpanded = expandedSellers.has(seller.id);
                                return (
                                    <React.Fragment key={seller.id}>
                                        <tr onClick={() => {
                                                const newSet = new Set(expandedSellers);
                                                if(newSet.has(seller.id)) newSet.delete(seller.id); else newSet.add(seller.id);
                                                setExpandedSellers(newSet);
                                            }} className={`cursor-pointer transition-colors ${isExpanded ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}>
                                            <td className="p-4 text-center">
                                                {isExpanded ? <ChevronDownIcon className="w-4 h-4 text-blue-500"/> : <ChevronRightIcon className="w-4 h-4 text-slate-400"/>}
                                            </td>
                                            <td className="p-4 font-bold text-slate-800">{seller.id} - {seller.name}</td>
                                            <td className="p-4 text-slate-600">{seller.supervisorId} - {seller.supervisor}</td>
                                            <td className="p-4 text-center font-mono font-bold">{seller.days.length}</td>
                                            <td className="p-4 text-right font-bold text-blue-600">{seller.totalKm.toFixed(1)} km</td>
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
                                                                    <th className="px-4 py-2 text-center">Mapa</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-slate-50 text-slate-600">
                                                                {seller.days.map((day: any, idx: number) => {
                                                                    const validCount = day.validPoints.length;
                                                                    return (
                                                                        <tr key={idx} className="hover:bg-blue-50/30">
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
                                                                                <button onClick={(e) => { e.stopPropagation(); setViewingRoute(day); }} className="inline-flex items-center bg-white border border-blue-200 text-blue-600 hover:bg-blue-50 hover:text-blue-800 px-3 py-1 rounded text-[10px] font-bold uppercase shadow-sm transition">
                                                                                    <LocationMarkerIcon className="w-3 h-3 mr-1"/> Ver
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
