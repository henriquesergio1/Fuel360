import React, { useState, useEffect } from 'react';
import { Usuario } from '../types.ts';
import * as api from '../services/apiService.ts';
import { PlusCircleIcon, PencilIcon, CheckCircleIcon, XCircleIcon } from './icons.tsx';

interface GestaoUsuariosProps { embedded?: boolean; }

export const GestaoUsuarios: React.FC<GestaoUsuariosProps> = ({ embedded = false }) => {
    const [usuarios, setUsuarios] = useState<Usuario[]>([]);
    const [loading, setLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<Usuario | null>(null);

    const loadUsuarios = async () => {
        setLoading(true);
        try { const data = await api.getUsuarios(); setUsuarios(data); } catch (err) {} finally { setLoading(false); }
    };

    useEffect(() => { loadUsuarios(); }, []);

    const handleOpenModal = (user?: Usuario) => {
        setEditingUser(user || { ID_Usuario: 0, Nome: '', Usuario: '', Senha: '', Perfil: 'Operador', Ativo: true });
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        if (!editingUser?.Nome || !editingUser?.Usuario) return;
        try {
            if (editingUser.ID_Usuario === 0) await api.createUsuario(editingUser);
            else await api.updateUsuario(editingUser.ID_Usuario, editingUser);
            setIsModalOpen(false); loadUsuarios();
        } catch (err: any) { alert(err.message); }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                {!embedded && <div><h2 className="text-2xl font-bold text-slate-900">Usuários</h2></div>}
                <button onClick={() => handleOpenModal()} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-xl flex items-center shadow-lg shadow-blue-600/20 transition hover:-translate-y-0.5 ml-auto">
                    <PlusCircleIcon className="w-5 h-5 mr-2" /> Novo Usuário
                </button>
            </div>

            <div className="bg-white rounded-2xl shadow-md overflow-hidden border border-slate-200">
                <table className="w-full text-sm text-left text-slate-600">
                    <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th className="p-5 tracking-wider">Nome</th>
                            <th className="p-5 tracking-wider">Login</th>
                            <th className="p-5 tracking-wider">Perfil</th>
                            <th className="p-5 tracking-wider">Status</th>
                            <th className="p-5 tracking-wider text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {usuarios.map(u => (
                            <tr key={u.ID_Usuario} className="hover:bg-slate-50 transition-colors">
                                <td className="p-5 font-bold text-slate-900">{u.Nome}</td>
                                <td className="p-5 font-mono text-slate-500">{u.Usuario}</td>
                                <td className="p-5"><span className={`px-3 py-1 rounded-full text-xs font-bold ${u.Perfil === 'Admin' ? 'bg-purple-100 text-purple-600 border border-purple-200' : 'bg-blue-100 text-blue-600 border border-blue-200'}`}>{u.Perfil}</span></td>
                                <td className="p-5"><span className={`px-3 py-1 rounded-full text-xs font-bold ${u.Ativo ? 'bg-emerald-100 text-emerald-600 border border-emerald-200' : 'bg-red-100 text-red-600 border border-red-200'}`}>{u.Ativo ? 'Ativo' : 'Bloqueado'}</span></td>
                                <td className="p-5 text-right"><button onClick={() => handleOpenModal(u)} className="text-slate-400 hover:text-blue-600 p-2 rounded-lg hover:bg-blue-50"><PencilIcon className="w-5 h-5" /></button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {isModalOpen && editingUser && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-8 w-full max-w-md">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-slate-900">{editingUser.ID_Usuario === 0 ? 'Novo Usuário' : 'Editar Usuário'}</h3>
                            <button onClick={() => setIsModalOpen(false)}><XCircleIcon className="w-6 h-6 text-slate-400 hover:text-slate-600"/></button>
                        </div>
                        <div className="space-y-4">
                            <input type="text" placeholder="Nome Completo" value={editingUser.Nome} onChange={e => setEditingUser({...editingUser, Nome: e.target.value})} className="w-full bg-white text-slate-900 border border-slate-300 rounded-xl p-3 focus:ring-2 focus:ring-blue-600 outline-none shadow-sm" />
                            <input type="text" placeholder="Login" value={editingUser.Usuario} onChange={e => setEditingUser({...editingUser, Usuario: e.target.value})} disabled={editingUser.ID_Usuario !== 0} className="w-full bg-white text-slate-900 border border-slate-300 rounded-xl p-3 focus:ring-2 focus:ring-blue-600 disabled:opacity-50 disabled:bg-slate-100 outline-none shadow-sm" />
                            <input type="password" placeholder={editingUser.ID_Usuario === 0 ? 'Senha' : 'Nova Senha (Opcional)'} value={editingUser.Senha || ''} onChange={e => setEditingUser({...editingUser, Senha: e.target.value})} className="w-full bg-white text-slate-900 border border-slate-300 rounded-xl p-3 focus:ring-2 focus:ring-blue-600 outline-none shadow-sm" />
                            <select value={editingUser.Perfil} onChange={e => setEditingUser({...editingUser, Perfil: e.target.value as any})} className="w-full bg-white text-slate-900 border border-slate-300 rounded-xl p-3 focus:ring-2 focus:ring-blue-600 outline-none shadow-sm"><option value="Operador">Operador</option><option value="Admin">Admin</option></select>
                            <div className="flex items-center bg-white border border-slate-300 p-3 rounded-xl shadow-sm"><input type="checkbox" checked={editingUser.Ativo} onChange={e => setEditingUser({...editingUser, Ativo: e.target.checked})} className="h-5 w-5 rounded bg-slate-100 border-slate-300 text-blue-600 focus:ring-blue-500" /><label className="ml-3 text-sm font-medium text-slate-700">Usuário Ativo</label></div>
                        </div>
                        <div className="mt-8 flex justify-end space-x-3">
                            <button onClick={() => setIsModalOpen(false)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-6 rounded-xl border border-slate-200">Cancelar</button>
                            <button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl flex items-center shadow-lg shadow-blue-600/20"><CheckCircleIcon className="w-5 h-5 mr-2" /> Salvar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};