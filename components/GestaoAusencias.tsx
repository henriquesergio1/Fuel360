
import React, { useState, useContext } from 'react';
import { DataContext } from '../context/DataContext.tsx';
import { CalendarIcon, PlusCircleIcon, TrashIcon, XCircleIcon, CheckCircleIcon, SpinnerIcon, ExclamationIcon } from './icons.tsx';

// Helper para formatar data ignorando fuso horário local (Força UTC)
const formatUtcDate = (isoString: string) => {
    if (!isoString) return '-';
    // Cria data e extrai partes UTC para evitar decréscimo de dia por fuso (ex: GMT-3)
    const date = new Date(isoString);
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = date.getUTCFullYear();
    return `${day}/${month}/${year}`;
};

const DeleteAusenciaModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (motivo: string) => void;
    isLoading: boolean;
}> = ({ isOpen, onClose, onConfirm, isLoading }) => {
    const [motivo, setMotivo] = useState('');

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-8 w-full max-w-sm text-center">
                <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                    <TrashIcon className="w-8 h-8 text-red-500"/>
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">Excluir Ausência</h3>
                <p className="text-slate-500 text-sm mb-4">
                    Para fins de auditoria, informe o motivo da exclusão deste registro.
                </p>

                <textarea 
                    value={motivo}
                    onChange={e => setMotivo(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-red-500 outline-none mb-6 resize-none"
                    placeholder="Motivo (Obrigatório)..."
                    rows={2}
                    autoFocus
                />

                <div className="flex space-x-3 justify-center">
                    <button onClick={onClose} disabled={isLoading} className="bg-white hover:bg-slate-50 text-slate-700 px-6 py-3 rounded-xl font-bold text-sm border border-slate-200 shadow-sm">Cancelar</button>
                    <button 
                        onClick={() => onConfirm(motivo)} 
                        disabled={isLoading || !motivo.trim()} 
                        className="bg-red-600 hover:bg-red-500 text-white px-6 py-3 rounded-xl font-bold text-sm flex items-center disabled:opacity-50 shadow-lg shadow-red-600/20"
                    >
                        {isLoading ? <SpinnerIcon className="w-4 h-4 mr-2"/> : 'Excluir'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export const GestaoAusencias: React.FC = () => {
    const { colaboradores, ausencias, addAusencia, deleteAusencia } = useContext(DataContext);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    
    // Delete State
    const [deleteId, setDeleteId] = useState<number | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    
    // Form States
    const [colabId, setColabId] = useState('');
    const [dtInicio, setDtInicio] = useState('');
    const [dtFim, setDtFim] = useState('');
    const [motivo, setMotivo] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!colabId || !dtInicio || !dtFim || !motivo) {
            setError("Todos os campos são obrigatórios.");
            return;
        }

        if (new Date(dtInicio) > new Date(dtFim)) {
            setError("A data inicial não pode ser maior que a data final.");
            return;
        }

        setLoading(true);
        try {
            await addAusencia({
                ID_Colaborador: parseInt(colabId),
                DataInicio: dtInicio,
                DataFim: dtFim,
                Motivo: motivo
            });
            setIsModalOpen(false);
            // Reset form
            setColabId('');
            setDtInicio('');
            setDtFim('');
            setMotivo('');
        } catch (e: any) {
            setError(e.message || "Erro ao salvar ausência.");
        } finally {
            setLoading(false);
        }
    };

    const confirmDelete = async (motivoExclusao: string) => {
        if (!deleteId) return;
        setIsDeleting(true);
        try {
            await deleteAusencia(deleteId, motivoExclusao);
            setDeleteId(null);
        } catch (e: any) {
            alert(e.message || 'Erro ao excluir');
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="space-y-8">
            <DeleteAusenciaModal 
                isOpen={!!deleteId} 
                onClose={() => setDeleteId(null)} 
                onConfirm={confirmDelete}
                isLoading={isDeleting}
            />

            <div className="flex items-end justify-between">
                <div>
                    <h2 className="text-3xl font-extrabold text-slate-800 mb-2 tracking-tight">Gestão de Ausências</h2>
                    <p className="text-slate-500 font-medium">Controle de Férias, Atestados e Faltas para bloqueio de pagamento.</p>
                </div>
                <button 
                    onClick={() => setIsModalOpen(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl flex items-center shadow-lg shadow-blue-600/20 transition hover:-translate-y-0.5"
                >
                    <PlusCircleIcon className="w-5 h-5 mr-2" /> Nova Ausência
                </button>
            </div>

            {/* Listagem */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full text-sm text-left text-slate-600">
                    <thead className="text-xs text-slate-400 uppercase bg-slate-50/50 border-b border-slate-100 font-semibold">
                        <tr>
                            <th className="p-5 tracking-wider">Colaborador</th>
                            <th className="p-5 tracking-wider">Período</th>
                            <th className="p-5 tracking-wider">Motivo</th>
                            <th className="p-5 tracking-wider text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {ausencias.length === 0 ? (
                            <tr><td colSpan={4} className="p-12 text-center text-slate-400">Nenhum registro de ausência cadastrado.</td></tr>
                        ) : (
                            ausencias.map(aus => (
                                <tr key={aus.ID_Ausencia} className="hover:bg-slate-50 transition-colors">
                                    <td className="p-5">
                                        <div className="font-bold text-slate-800">{aus.ID_Pulsus} - {aus.NomeColaborador}</div>
                                    </td>
                                    <td className="p-5 font-mono text-slate-600">
                                        <div className="flex items-center">
                                            <CalendarIcon className="w-4 h-4 mr-2 text-slate-400"/>
                                            {formatUtcDate(aus.DataInicio)} <span className="mx-2 text-slate-300">➜</span> {formatUtcDate(aus.DataFim)}
                                        </div>
                                    </td>
                                    <td className="p-5">
                                        <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold border ${
                                            aus.Motivo.toLowerCase().includes('féria') ? 'bg-amber-50 text-amber-600 border-amber-100' :
                                            aus.Motivo.toLowerCase().includes('atestado') ? 'bg-red-50 text-red-600 border-red-100' :
                                            'bg-slate-100 text-slate-600 border-slate-200'
                                        }`}>
                                            {aus.Motivo}
                                        </span>
                                    </td>
                                    <td className="p-5 text-right">
                                        <button onClick={() => setDeleteId(aus.ID_Ausencia)} className="text-slate-400 hover:text-red-500 p-2 rounded hover:bg-red-50 transition"><TrashIcon className="w-5 h-5"/></button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal de Cadastro */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-8 w-full max-w-md">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-slate-800">Registrar Ausência</h3>
                            <button onClick={() => setIsModalOpen(false)}><XCircleIcon className="w-6 h-6 text-slate-400 hover:text-slate-600"/></button>
                        </div>

                        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 flex items-center"><ExclamationIcon className="w-5 h-5 mr-2"/>{error}</div>}

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Colaborador</label>
                                <select 
                                    value={colabId} 
                                    onChange={e => setColabId(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 outline-none focus:ring-2 focus:ring-blue-600"
                                >
                                    <option value="">Selecione...</option>
                                    {colaboradores.sort((a,b) => a.Nome.localeCompare(b.Nome)).map(c => (
                                        <option key={c.ID_Colaborador} value={c.ID_Colaborador}>{c.ID_Pulsus} - {c.Nome}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Início</label>
                                    <input type="date" value={dtInicio} onChange={e => setDtInicio(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 outline-none focus:ring-2 focus:ring-blue-600"/>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fim</label>
                                    <input type="date" value={dtFim} onChange={e => setDtFim(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 outline-none focus:ring-2 focus:ring-blue-600"/>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Motivo</label>
                                <select 
                                    value={motivo} 
                                    onChange={e => setMotivo(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 outline-none focus:ring-2 focus:ring-blue-600"
                                >
                                    <option value="">Selecione...</option>
                                    <option value="Férias">Férias</option>
                                    <option value="Atestado Médico">Atestado Médico</option>
                                    <option value="Falta Justificada">Falta Justificada</option>
                                    <option value="Falta Injustificada">Falta Injustificada</option>
                                    <option value="Licença Maternidade/Paternidade">Licença Maternidade/Paternidade</option>
                                    <option value="Outros">Outros</option>
                                </select>
                            </div>

                            <div className="flex justify-end pt-4 space-x-3">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="bg-white hover:bg-slate-50 text-slate-600 font-bold py-3 px-6 rounded-xl border border-slate-200">Cancelar</button>
                                <button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl flex items-center shadow-lg shadow-blue-600/20">
                                    {loading ? <SpinnerIcon className="w-5 h-5 mr-2"/> : <CheckCircleIcon className="w-5 h-5 mr-2"/>} 
                                    Salvar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
