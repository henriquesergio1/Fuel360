import React, { useState, useContext, useEffect } from 'react';
import { DataContext } from '../context/DataContext.tsx';
import { GestaoUsuarios } from './GestaoUsuarios.tsx';
import { CogIcon, UserGroupIcon, PhotographIcon, CheckCircleIcon, DocumentReportIcon, SpinnerIcon, ExclamationIcon } from './icons.tsx';
import { getCurrentMode, toggleMode, getSystemStatus, updateLicense } from '../services/apiService.ts';
import { LicenseStatus } from '../types.ts';

const LicenseControl: React.FC = () => {
    const [status, setStatus] = useState<LicenseStatus | null>(null);
    const [inputKey, setInputKey] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    useEffect(() => { loadStatus(); }, []);
    const loadStatus = async () => { try { const s = await getSystemStatus(); setStatus(s); } catch (e) {} };

    const handleActivate = async () => {
        if (!inputKey.trim()) return;
        setLoading(true); setMessage(null);
        try { const res = await updateLicense(inputKey); setMessage({ type: 'success', text: res.message }); setInputKey(''); loadStatus(); }
        catch (err: any) { setMessage({ type: 'error', text: err.message || 'Erro ao ativar.' }); }
        finally { setLoading(false); }
    };

    return (
        <div className="bg-white p-8 rounded-2xl shadow-md border border-slate-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                    <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center"><DocumentReportIcon className="w-6 h-6 mr-2 text-blue-600"/> Status da Licença</h3>
                    {!status ? <p className="text-slate-500">Carregando...</p> : (
                        <div className={`p-6 rounded-xl border ${status.status === 'ACTIVE' ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                            <div className="mb-3"><span className="text-xs text-slate-500 uppercase tracking-wider font-bold">Situação</span><p className={`font-bold text-xl ${status.status === 'ACTIVE' ? 'text-emerald-600' : 'text-red-600'}`}>{status.status === 'ACTIVE' ? 'ATIVA' : (status.status === 'EXPIRED' ? 'EXPIRADA' : 'INVÁLIDA')}</p></div>
                            {status.client && <div className="mb-3"><span className="text-xs text-slate-500 uppercase tracking-wider font-bold">Cliente</span><p className="text-slate-800">{status.client}</p></div>}
                            {status.expiresAt && <div><span className="text-xs text-slate-500 uppercase tracking-wider font-bold">Vencimento</span><p className="text-slate-800">{new Date(status.expiresAt).toLocaleDateString('pt-BR')}</p></div>}
                        </div>
                    )}
                </div>
                <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                    <h4 className="font-bold text-slate-800 mb-2">Ativar Licença</h4>
                    <textarea value={inputKey} onChange={(e) => setInputKey(e.target.value)} className="w-full bg-white text-slate-900 border border-slate-300 rounded-xl p-4 text-xs font-mono h-32 focus:ring-2 focus:ring-blue-600 focus:border-transparent mb-4 shadow-sm" placeholder="Cole a chave aqui..." />
                    <button onClick={handleActivate} disabled={loading || !inputKey} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl flex items-center justify-center transition shadow-md">{loading ? <SpinnerIcon className="w-5 h-5 mr-2"/> : 'Validar'}</button>
                    {message && <div className={`mt-4 p-3 rounded-lg text-sm font-bold ${message.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>{message.text}</div>}
                </div>
            </div>
        </div>
    );
};

const SystemBranding: React.FC = () => {
    const { systemConfig, updateSystemConfig } = useContext(DataContext);
    const [name, setName] = useState(systemConfig.companyName);
    const [logo, setLogo] = useState(systemConfig.logoUrl);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => { setName(systemConfig.companyName); setLogo(systemConfig.logoUrl); }, [systemConfig]);

    const handleSave = async () => { setIsSaving(true); try { await updateSystemConfig({ companyName: name, logoUrl: logo }); } finally { setIsSaving(false); } };

    return (
        <div className="bg-white p-8 rounded-2xl shadow-md border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-5">
                <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nome da Empresa</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-white text-slate-900 border border-slate-300 rounded-xl p-3 focus:ring-2 focus:ring-blue-600 shadow-sm" /></div>
                <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">URL do Logo</label><input type="text" value={logo} onChange={(e) => setLogo(e.target.value)} className="w-full bg-white text-slate-900 border border-slate-300 rounded-xl p-3 focus:ring-2 focus:ring-blue-600 shadow-sm" /></div>
                <button onClick={handleSave} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl flex items-center shadow-md">{isSaving ? 'Salvando...' : 'Salvar'}</button>
            </div>
            <div className="bg-slate-50 rounded-xl p-8 flex flex-col items-center justify-center border border-slate-200">
                <p className="text-xs text-slate-400 mb-4 uppercase tracking-widest">Preview</p>
                {logo ? <img src={logo} alt="Logo" className="h-24 w-24 rounded-full object-cover border-2 border-slate-200 bg-white mb-4 shadow-sm" /> : <div className="h-24 w-24 bg-white rounded-full border-2 border-slate-200 flex items-center justify-center mb-4 shadow-sm"><PhotographIcon className="w-8 h-8 text-slate-400"/></div>}
                <span className="text-slate-800 font-bold text-xl">{name}</span>
            </div>
        </div>
    );
};

const SystemControl: React.FC = () => {
    const isMock = getCurrentMode() === 'MOCK';
    return (
        <div className="bg-white p-8 rounded-2xl shadow-md border border-slate-200">
            <div className="flex items-center justify-between bg-slate-50 p-6 rounded-xl border border-slate-200">
                <div><p className="text-sm text-slate-500">Modo Atual</p><p className={`text-2xl font-bold ${isMock ? 'text-yellow-600' : 'text-emerald-600'}`}>{isMock ? 'MOCK (Simulado)' : 'PRODUÇÃO (API Real)'}</p></div>
                <div className="flex gap-3">
                    <button onClick={() => toggleMode('API')} disabled={!isMock} className={`px-5 py-2.5 rounded-xl font-bold text-sm transition ${!isMock ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-emerald-600 text-white hover:bg-emerald-500'}`}>API Real</button>
                    <button onClick={() => toggleMode('MOCK')} disabled={isMock} className={`px-5 py-2.5 rounded-xl font-bold text-sm transition ${isMock ? 'bg-yellow-50 text-yellow-600 border border-yellow-200' : 'bg-yellow-600 text-white hover:bg-yellow-500'}`}>Mock</button>
                </div>
            </div>
        </div>
    );
};

export const AdminPanel: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'users' | 'branding' | 'system' | 'license'>('users');
    return (
        <div className="space-y-8">
            <div><h2 className="text-3xl font-extrabold text-slate-900 mb-2 tracking-tight">Administração</h2><p className="text-slate-500">Controle total do sistema.</p></div>
            <div className="flex space-x-2 border-b border-slate-200 pb-1">
                {[
                    { id: 'users', label: 'Usuários', icon: UserGroupIcon },
                    { id: 'license', label: 'Licença', icon: DocumentReportIcon },
                    { id: 'branding', label: 'Marca', icon: PhotographIcon },
                    { id: 'system', label: 'Sistema', icon: CogIcon }
                ].map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`px-5 py-2.5 text-sm font-medium rounded-xl transition-all flex items-center border ${activeTab === tab.id ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'bg-transparent text-slate-500 hover:text-slate-700 border-transparent hover:bg-slate-100'}`}>
                        <tab.icon className={`w-4 h-4 mr-2 ${activeTab === tab.id ? 'text-white' : 'text-slate-400'}`}/> {tab.label}
                    </button>
                ))}
            </div>
            <div>
                {activeTab === 'users' && <GestaoUsuarios embedded={true} />}
                {activeTab === 'license' && <LicenseControl />}
                {activeTab === 'branding' && <SystemBranding />}
                {activeTab === 'system' && <SystemControl />}
            </div>
        </div>
    );
};