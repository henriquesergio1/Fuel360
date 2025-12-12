
import React, { useState, useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import { getVisitasPrevistas } from '../services/apiService.ts';
import { VisitaPrevista } from '../types.ts';
import { LocationMarkerIcon, SpinnerIcon, CalculatorIcon, UsersIcon, ChevronRightIcon, ChevronDownIcon, ArrowLeftIcon, UserGroupIcon, UserIcon, PrinterIcon } from './icons.tsx';
import L from 'leaflet';

// --- CONFIGURAÇÃO GLOBAL LEAFLET ---
// Corrige ícones padrão que somem no build
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

// --- SUB-COMPONENTES DO MAPA ---

// 1. Corretor de Renderização (Force Resize)
const MapInvalidator = () => {
    const map = useMap();
    
    useEffect(() => {
        // Função que força o Leaflet a recalcular o tamanho do container
        const resize = () => {
            if (map) {
                map.invalidateSize({ pan: false });
            }
        };

        // Executa imediatamente
        resize();

        // Executa em intervalos curtos para pegar animações de abertura
        const interval = setInterval(resize, 200);
        
        // Para após 2 segundos (tempo suficiente para animações terminarem)
        const timeout = setTimeout(() => clearInterval(interval), 2000);

        // Observer para mudanças de tamanho da janela
        window.addEventListener('resize', resize);

        return () => {
            clearInterval(interval);
            clearTimeout(timeout);
            window.removeEventListener('resize', resize);
        };
    }, [map]);

    return null;
};

// 2. Centralizador Automático (Auto Zoom)
const MapAutoFit: React.FC<{ points: VisitaPrevista[] }> = ({ points }) => {
    const map = useMap();
    
    useEffect(() => {
        if (points.length > 0) {
            const bounds = L.latLngBounds(points.map(p => [p.Lat, p.Long]));
            // Adiciona padding para os marcadores não ficarem colados na borda
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
        }
    }, [points, map]);

    return null;
};

// --- FUNÇÕES UTILITÁRIAS ---
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

// --- COMPONENTE PRINCIPAL ---
export const Roteirizador: React.FC = () => {
    // Estados de Filtro
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]);
    const [tortuosityFactor, setTortuosityFactor] = useState(1.3);
    const [selectedSupervisor, setSelectedSupervisor] = useState<string>('');
    const [selectedVendedor, setSelectedVendedor] = useState<string>('');

    // Estados de Dados
    const [loading, setLoading] = useState(false);
    const [rawData, setRawData] = useState<VisitaPrevista[]>([]);
    const [expandedSellers, setExpandedSellers] = useState<Set<number>>(new Set());
    
    // Estado de Visualização do Mapa
    const [viewingRoute, setViewingRoute] = useState<any | null>(null);
    const [mapReady, setMapReady] = useState(false); // Delay para montagem

    // Carregar Dados
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

    // Listas para Dropdowns
    const supervisors = useMemo(() => {
        const map = new Map();
        rawData.forEach(v => map.set(v.Cod_Supervisor, v.Nome_Supervisor));
        return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
    }, [rawData]);

    const sellers = useMemo(() => {
        const map = new Map();
        rawData.forEach(v => {
            if (!selectedSupervisor || String(v.Cod_Supervisor) === selectedSupervisor) {
                map.set(v.Cod_Vend, v.Nome_Vendedor);
            }
        });
        return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
    }, [rawData, selectedSupervisor]);

    // Processamento dos Dados
    const groupedData = useMemo(() => {
        if (rawData.length === 0) return [];

        // 1. Filtrar
        const filtered = rawData.filter(v => {
            if (selectedSupervisor && String(v.Cod_Supervisor) !== selectedSupervisor) return false;
            if (selectedVendedor && String(v.Cod_Vend) !== selectedVendedor) return false;
            return true;
        });

        // 2. Agrupar por Vendedor
        const sellerMap = new Map();
        filtered.forEach(v => {
            if (!sellerMap.has(v.Cod_Vend)) {
                sellerMap.set(v.Cod_Vend, {
                    id: v.Cod_Vend,
                    name: v.Nome_Vendedor,
                    supervisor: v.Nome_Supervisor,
                    days: new Map() // Agrupar por dia
                });
            }
            const seller = sellerMap.get(v.Cod_Vend);
            const dateKey = v.Data_da_Visita?.split('T')[0];
            if (dateKey) {
                if (!seller.days.has(dateKey)) seller.days.set(dateKey, []);
                seller.days.get(dateKey).push(v);
            }
        });

        // 3. Calcular Rotas por Dia
        const result = [];
        for (const seller of sellerMap.values()) {
            const daysArr = [];
            let totalKm = 0;

            for (const [date, visits] of seller.days.entries()) {
                const validPoints = (visits as VisitaPrevista[]).filter(p => p.Lat && p.Long && p.Lat !== 0);
                let kmReta = 0;
                
                // Ordenar visitas? Por enquanto assume ordem do banco ou inserção
                // Idealmente teria um horário ou sequência.
                
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
            
            // Ordenar dias
            daysArr.sort((a, b) => a.date.localeCompare(b.date));

            result.push({
                ...seller,
                totalKm: totalKm,
                days: daysArr
            });
        }

        return result.sort((a, b) => a.name.localeCompare(b.name));
    }, [rawData, selectedSupervisor, selectedVendedor, tortuosityFactor]);

    // Handlers
    const openMap = (dayRoute: any) => {
        setViewingRoute(dayRoute);
        setMapReady(false);
        // Pequeno delay para garantir que o container do mapa renderizou no DOM antes de iniciar o Leaflet
        setTimeout(() => setMapReady(true), 100);
    };

    const closeMap = () => {
        setViewingRoute(null);
        setMapReady(false);
    };

    // --- RENDER ---

    // 1. VISÃO DO MAPA (MODAL FULLSCREEN)
    if (viewingRoute) {
        return (
            <div className="fixed inset-0 z-50 bg-slate-100 flex flex-col">
                {/* INJECTION DE ESTILO CRÍTICO PARA CORRIGIR O TAILWIND QUEBRANDO O MAPA */}
                <style>{`
                    .leaflet-pane img, 
                    .leaflet-tile, 
                    .leaflet-marker-icon, 
                    .leaflet-marker-shadow {
                        max-width: none !important;
                        max-height: none !important;
                        width: auto !important;
                        height: auto !important;
                    }
                    .leaflet-container {
                        width: 100%;
                        height: 100%;
                    }
                `}</style>

                {/* Header do Mapa */}
                <div className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center shadow-sm shrink-0 h-20">
                    <div className="flex items-center">
                        <button onClick={closeMap} className="mr-4 p-2 hover:bg-slate-100 rounded-full transition text-slate-500 hover:text-slate-800">
                            <ArrowLeftIcon className="w-6 h-6"/>
                        </button>
                        <div>
                            <h2 className="text-xl font-bold text-slate-800 flex items-center">
                                <span className="mr-2">{formatDateString(viewingRoute.date)}</span>
                                <span className="px-2 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-700 uppercase">{viewingRoute.dayName}</span>
                            </h2>
                            <p className="text-sm text-slate-500">
                                {viewingRoute.points.length} Pontos • {viewingRoute.km.toFixed(1)} km estimados
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => window.print()} className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 font-bold py-2 px-4 rounded-lg text-sm flex items-center">
                            <PrinterIcon className="w-4 h-4 mr-2"/> Imprimir
                        </button>
                        <button onClick={closeMap} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg text-sm shadow-md">
                            Fechar Mapa
                        </button>
                    </div>
                </div>

                {/* Container do Mapa */}
                <div className="flex-1 relative bg-slate-200">
                    {!mapReady && (
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-100 z-10">
                            <SpinnerIcon className="w-10 h-10 text-blue-500"/>
                            <span className="ml-3 text-slate-500 font-bold">Carregando Mapa...</span>
                        </div>
                    )}
                    
                    {mapReady && (
                        <MapContainer 
                            center={[-23.55052, -46.633308]} 
                            zoom={10} 
                            style={{ height: '100%', width: '100%' }}
                        >
                            <MapInvalidator />
                            <TileLayer 
                                attribution='&copy; OpenStreetMap contributors'
                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" 
                            />
                            
                            <MapAutoFit points={viewingRoute.points} />

                            {/* Marcadores */}
                            {viewingRoute.points.map((p: VisitaPrevista, idx: number) => (
                                <Marker key={idx} position={[p.Lat, p.Long]}>
                                    <Popup>
                                        <div className="text-sm">
                                            <strong>{idx + 1}. {p.Razao_Social}</strong><br/>
                                            <span className="text-slate-500">{p.Endereco}</span><br/>
                                            <span className="text-xs text-slate-400">{p.Bairro} - {p.Cidade}</span>
                                        </div>
                                    </Popup>
                                </Marker>
                            ))}

                            {/* Linha da Rota */}
                            <Polyline 
                                positions={viewingRoute.points.map((p: any) => [p.Lat, p.Long])}
                                color="#2563eb"
                                weight={4}
                                opacity={0.8}
                                dashArray="10, 10"
                            />
                        </MapContainer>
                    )}
                </div>
            </div>
        );
    }

    // 2. VISÃO DE RELATÓRIO (PADRÃO)
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-end">
                <div>
                    <h2 className="text-3xl font-extrabold text-slate-800 mb-1 tracking-tight">Roteirizador</h2>
                    <p className="text-slate-500 font-medium">Previsão de quilometragem baseada na agenda de visitas.</p>
                </div>
            </div>

            {/* Card de Filtros */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex flex-wrap gap-4 items-end">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Início</label>
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-sm"/>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fim</label>
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-sm"/>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fator Tortuosidade</label>
                        <input type="number" step="0.1" value={tortuosityFactor} onChange={e => setTortuosityFactor(parseFloat(e.target.value))} className="bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-sm w-24"/>
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

                {/* Filtros Secundários */}
                {rawData.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-slate-100 flex gap-4">
                        <div className="w-64">
                            <label className="block text-xs font-bold text-slate-400 uppercase mb-1 flex items-center"><UserGroupIcon className="w-3 h-3 mr-1"/> Supervisor</label>
                            <select value={selectedSupervisor} onChange={e => setSelectedSupervisor(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm">
                                <option value="">Todos</option>
                                {supervisors.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                            </select>
                        </div>
                        <div className="w-64">
                            <label className="block text-xs font-bold text-slate-400 uppercase mb-1 flex items-center"><UserIcon className="w-3 h-3 mr-1"/> Vendedor</label>
                            <select value={selectedVendedor} onChange={e => setSelectedVendedor(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm">
                                <option value="">Todos</option>
                                {sellers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
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
                            <th className="p-4 w-10"></th>
                            <th className="p-4">Vendedor</th>
                            <th className="p-4 text-center">Dias com Rota</th>
                            <th className="p-4 text-right">KM Total Previsto</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {groupedData.length === 0 ? (
                            <tr><td colSpan={4} className="p-12 text-center text-slate-400">
                                {loading ? "Calculando..." : "Nenhum resultado encontrado."}
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
                                                <div className="font-bold text-slate-800">{seller.name}</div>
                                                <div className="text-xs text-slate-500">{seller.supervisor}</div>
                                            </td>
                                            <td className="p-4 text-center font-mono">{seller.days.length}</td>
                                            <td className="p-4 text-right font-bold text-blue-600">{seller.totalKm.toFixed(1)} km</td>
                                        </tr>
                                        {isExpanded && (
                                            <tr className="bg-slate-50/50 shadow-inner">
                                                <td colSpan={4} className="p-0">
                                                    <div className="bg-white border-y border-slate-200">
                                                        <table className="w-full text-xs">
                                                            <thead className="bg-slate-100 text-slate-500">
                                                                <tr>
                                                                    <th className="py-2 px-8 text-left">Data</th>
                                                                    <th className="py-2 px-4 text-center">Qtd Visitas</th>
                                                                    <th className="py-2 px-4 text-right">KM Dia</th>
                                                                    <th className="py-2 px-4 text-center">Ação</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-slate-50">
                                                                {seller.days.map((day: any, idx: number) => (
                                                                    <tr key={idx} className="hover:bg-blue-50/30">
                                                                        <td className="py-3 px-8 font-mono">
                                                                            {formatDateString(day.date)} <span className="text-slate-400 ml-2 uppercase text-[10px]">{day.dayName}</span>
                                                                        </td>
                                                                        <td className="py-3 px-4 text-center font-bold">{day.points.length}</td>
                                                                        <td className="py-3 px-4 text-right">{day.km.toFixed(1)} km</td>
                                                                        <td className="py-3 px-4 text-center">
                                                                            <button 
                                                                                onClick={(e) => { e.stopPropagation(); openMap(day); }}
                                                                                className="text-blue-600 hover:text-blue-800 font-bold bg-white border border-blue-200 px-3 py-1 rounded shadow-sm hover:shadow-md transition flex items-center mx-auto"
                                                                            >
                                                                                <LocationMarkerIcon className="w-3 h-3 mr-1"/> Ver Mapa
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
