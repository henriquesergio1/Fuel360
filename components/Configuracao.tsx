import React, { useContext, useState, useEffect } from 'react';
import { DataContext } from '../context/DataContext.tsx';
import { getFuelConfigHistory } from '../services/apiService.ts';
import { LogSistema } from '../types.ts';
import { CogIcon, DropIcon, CarIcon, MotoIcon, CheckCircleIcon, ExclamationIcon, XCircleIcon, SpinnerIcon } from './icons.tsx';

const ConfirmSaveModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (motivo: string) => void;
    isLoading: boolean;
}> = ({ isOpen, onClose, onConfirm, isLoading }) => {
    const [motivo, setMotivo] = useState('');

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-8 w-full max-w-md">
                <h3 className="text-xl font-bold text-slate-900 mb-2">Confirmar Alterações</h3>
                <p className="text-slate-500 text-sm mb-6">Para fins de auditoria, informe o motivo destas alterações.</p>
                
                <textarea 
                    value={motivo}
                    onChange={e => setMotivo(e.target.value)}
                    className="w-full bg-white text-slate-900 border border-slate-300 rounded-xl p-4 text-sm focus:ring-2 focus:ring-blue-600 focus:border-transparent mb-6 resize-none shadow-sm"
                    placeholder="Ex: Reajuste anual..."
                    rows={3}
                    autoFocus
                />

                <div className="flex justify-end space-x-3">
                    <button onClick={onClose} disabled={isLoading} className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-2 px-4 rounded-lg text-sm transition">Cancelar</button>
                    <button 
                        onClick={() => onConfirm(motivo)}
                        disabled={!motivo.trim() || isLoading}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-bold disabled:opacity-50 flex items-center shadow-lg shadow-blue-600/20"
                    >
                        {isLoading ? <SpinnerIcon className="w-4 h-4 mr-2"/> : null} Confirmar
                    </button>
                </div>
            </div>
        </div>
    );
};

export const Configuracao: React.FC = () => {
    const { configReembolso, saveConfigReembolso } = useContext(DataContext);
    const [localConfig, setLocalConfig] = useState(configReembolso);
    const [message, setMessage] = useState<{type: 'success'|'error', text: string} | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [history, setHistory] = useState<LogSistema[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    useEffect(() => { setLocalConfig(configReembolso); loadHistory(); }, [configReembolso]);

    const loadHistory = async () => {
        setLoadingHistory(true);
        try { const logs = await getFuelConfigHistory(); setHistory(logs); } catch(e) {} finally { setLoadingHistory(false); }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setLocalConfig(prev => ({ ...prev, [name]: parseFloat(value) || 0 }));
    };

    const handleConfirmSave = async (motivo: string) => {
        setIsSaving(true);
        setMessage(null);
        try {
            await saveConfigReembolso({ ...localConfig, MotivoAlteracao: motivo.trim() });
            setMessage({ type: 'success', text: 'Parâmetros atualizados com sucesso!' });
            setIsModalOpen(false);
            loadHistory();
        } catch (e: any) {
            setMessage({ type: 'error', text: 'Erro ao salvar: ' + (e.message || 'Erro desconhecido') });
        } finally {
            setIsSaving(false);
            setTimeout(() => setMessage(null), 3000);
        }
    };

    return (
        <div className="max-w-4xl mx-auto mt-4 space-y-8">
            {/* Main Config Card */}
            <div className="bg-white p-8 rounded-2xl shadow-md border border-slate-200 relative overflow-hidden">
                <ConfirmSaveModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onConfirm={handleConfirmSave} isLoading={isSaving} />

                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-100/30 rounded-full blur-3xl"></div>

                <div className="flex items-center mb-8 pb-6 border-b border-slate-100 relative z-10">
                    <div className="p-3 bg-slate-50 rounded-xl mr-5 border border-slate-200 shadow-sm">
                        <CogIcon className="w-8 h-8 text-blue-600" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Parâmetros de Reembolso</h2>
                        <p className="text-slate-500 text-sm">Defina os valores base para o cálculo automático.</p>
                    </div>
                </div>

                <div className="space-y-6 relative z-10">
                    {/* Price Input */}
                    <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 hover:border-blue-400 transition-colors group">
                        <div className="flex items-center mb-3">
                            <DropIcon className="w-5 h-5 text-amber-500 mr-2 group-hover:scale-110 transition-transform" />
                            <label className="text-slate-700 font-bold text-sm uppercase tracking-wide">Preço Combustível (R$)</label>
                        </div>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">R$</span>
                            <input 
                                type="number" name="PrecoCombustivel" value={localConfig.PrecoCombustivel} onChange={handleChange} step="0.01"
                                className="w-full bg-white text-slate-900 border border-slate-300 rounded-xl p-4 pl-12 text-xl font-bold focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none shadow-sm"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 hover:border-blue-500/50 transition-colors">
                            <div className="flex items-center mb-3">
                                <CarIcon className="w-5 h-5 text-blue-500 mr-2" />
                                <label className="text-slate-700 font-bold text-sm uppercase tracking-wide">Média Carro (KM/L)</label>
                            </div>
                            <input 
                                type="number" name="KmL_Carro" value={localConfig.KmL_Carro} onChange={handleChange}
                                className="w-full bg-white text-slate-900 border border-slate-300 rounded-xl p-4 text-lg font-bold focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none shadow-sm"
                            />
                        </div>

                        <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 hover:border-orange-500/50 transition-colors">
                            <div className="flex items-center mb-3">
                                <MotoIcon className="w-5 h-5 text-orange-500 mr-2" />
                                <label className="text-slate-700 font-bold text-sm uppercase tracking-wide">Média Moto (KM/L)</label>
                            </div>
                            <input 
                                type="number" name="KmL_Moto" value={localConfig.KmL_Moto} onChange={handleChange}
                                className="w-full bg-white text-slate-900 border border-slate-300 rounded-xl p-4 text-lg font-bold focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none shadow-sm"
                            />
                        </div>
                    </div>

                    <button onClick={() => setIsModalOpen(true)} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl transition-all duration-200 flex items-center justify-center shadow-lg shadow-blue-600/20 transform hover:-translate-y-0.5 border border-transparent">
                        <CheckCircleIcon className="w-6 h-6 mr-2" /> Salvar Configurações
                    </button>

                    {message && (
                        <div className={`p-4 rounded-xl text-center border flex items-center justify-center text-sm font-bold animate-fade-in ${message.type === 'success' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                            {message.type === 'error' && <ExclamationIcon className="w-5 h-5 mr-2"/>} {message.text}
                        </div>
                    )}
                </div>
            </div>

            {/* History Table */}
            <div className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-200 bg-slate-50">
                    <h3 className="text-slate-600 font-bold text-sm uppercase tracking-widest flex items-center">
                        <span className="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
                        Últimas 10 Alterações
                    </h3>
                </div>
                
                {loadingHistory ? (
                    <div className="p-12 text-center text-slate-500"><SpinnerIcon className="w-8 h-8 mx-auto mb-3 text-blue-500"/> Carregando histórico...</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-slate-500">
                            <thead className="bg-slate-100 text-slate-600 uppercase font-semibold text-xs border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-4 tracking-wider">Data</th>
                                    <th className="px-6 py-4 tracking-wider">Usuário</th>
                                    <th className="px-6 py-4 tracking-wider w-1/2">Detalhes</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {history.length === 0 ? (
                                    <tr><td colSpan={3} className="p-8 text-center text-slate-400 italic">Nenhum registro encontrado.</td></tr>
                                ) : (
                                    history.map((log) => (
                                        <tr key={log.ID_Log} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-6 py-4 font-mono text-xs text-slate-600 whitespace-nowrap">
                                                {new Date(log.DataHora).toLocaleString('pt-BR')}
                                            </td>
                                            <td className="px-6 py-4 font-bold text-slate-800">{log.Usuario}</td>
                                            <td className="px-6 py-4 text-slate-600">{log.Detalhes}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};