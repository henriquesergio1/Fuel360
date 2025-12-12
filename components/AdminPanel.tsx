

import React, { useState, useContext, useEffect } from 'react';
import { DataContext } from '../context/DataContext.tsx';
import { GestaoUsuarios } from './GestaoUsuarios.tsx';
import { CogIcon, UserGroupIcon, PhotographIcon, CheckCircleIcon, DocumentReportIcon, SpinnerIcon, ExclamationIcon, UploadIcon, UsersIcon, LocationMarkerIcon } from './icons.tsx';
import { getCurrentMode, toggleMode, getSystemStatus, updateLicense, getIntegrationConfig, updateIntegrationConfig, testDbConnection } from '../services/apiService.ts';
import { LicenseStatus, IntegrationConfig, DbConnectionConfig } from '../types.ts';

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

// Componente Genérico de Formulário de Banco
const DbForm: React.FC<{ 
    config: DbConnectionConfig; 
    onChange: (newConfig: DbConnectionConfig) => void;
    label: string;
    description: string;
    icon: React.ReactNode;
    queryPlaceholder?: string;
}> = ({ config, onChange, label, description, icon, queryPlaceholder }) => {
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<{success: boolean, message: string} | null>(null);

    const handleTest = async () => {
        setTesting(true);
        setTestResult(null);
        try {
            const res = await testDbConnection(config);
            setTestResult(res);
        } catch (e: any) {
            setTestResult({ success: false, message: e.message });
        } finally {
            setTesting(false);
        }
    };

    return (
        <div>
            <div className="flex items-center mb-4">
                <div className="p-2 bg-blue-50 rounded-lg mr-3 border border-blue-100">{icon}</div>
                <div>
                    <h4 className="font-bold text-slate-800">{label}</h4>
                    <p className="text-xs text-slate-500">{description}</p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Host / IP</label>
                    <input type="text" value={config.host} onChange={e => onChange({...config, host: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 transition-colors" placeholder="192.168.1.50"/>
                </div>
                <div className="space-y-1">
                     <label className="text-xs font-bold text-slate-500 uppercase">Porta</label>
                     <input type="number" value={config.port} onChange={e => onChange({...config, port: Number(e.target.value)})} className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 transition-colors" placeholder="3306"/>
                </div>
                <div className="space-y-1">
                     <label className="text-xs font-bold text-slate-500 uppercase">Usuário</label>
                     <input type="text" value={config.user} onChange={e => onChange({...config, user: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 transition-colors"/>
                </div>
                <div className="space-y-1">
                     <label className="text-xs font-bold text-slate-500 uppercase">Senha</label>
                     <input type="password" value={config.pass} onChange={e => onChange({...config, pass: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 transition-colors" placeholder="********"/>
                </div>
                <div className="col-span-2 space-y-1">
                     <label className="text-xs font-bold text-slate-500 uppercase">Nome do Banco</label>
                     <input type="text" value={config.database} onChange={e => onChange({...config, database: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 transition-colors"/>
                </div>
            </div>

            <div className="space-y-1 mb-4">
                <label className="block text-xs font-bold text-slate-500 uppercase">Query de Seleção</label>
                <textarea 
                    value={config.query} 
                    onChange={e => onChange({...config, query: e.target.value})}
                    className="w-full h-32 bg-slate-800 text-green-400 border border-slate-700 rounded-lg p-3 font-mono text-xs outline-none focus:ring-1 focus:ring-green-500"
                    placeholder={queryPlaceholder || "SELECT ..."}
                />
            </div>

            <div className="flex items-center justify-between">
                 <button 
                    onClick={handleTest} 
                    disabled={testing}
                    className="text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-lg transition-colors flex items-center"
                >
                    {testing ? <SpinnerIcon className="w-4 h-4 mr-2"/> : null}
                    Testar Conexão
                </button>
                {testResult && (
                    <span className={`text-sm font-bold ${testResult.success ? 'text-emerald-600' : 'text-red-600'}`}>
                        {testResult.success ? <CheckCircleIcon className="w-5 h-5 inline mr-1"/> : <ExclamationIcon className="w-5 h-5 inline mr-1"/>}
                        {testResult.message}
                    </span>
                )}
            </div>
        </div>
    );
};

const IntegrationSettings: React.FC = () => {
    const [config, setConfig] = useState<IntegrationConfig | null>(null);
    const [activeTab, setActiveTab] = useState<'colab' | 'route'>('colab');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => { loadConfig(); }, []);

    const loadConfig = async () => {
        setLoading(true);
        try {
            const data = await getIntegrationConfig();
            setConfig(data);
        } catch(e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!config) return;
        setSaving(true);
        setMessage('');
        try {
            await updateIntegrationConfig(config);
            setMessage('Configuração salva com sucesso!');
        } catch (e: any) {
            alert('Erro ao salvar: ' + e.message);
        } finally {
            setSaving(false);
        }
    };

    const handleColabChange = (newConf: DbConnectionConfig) => {
        if (config) setConfig({ ...config, colab: newConf });
    };

    const handleRouteChange = (newConf: DbConnectionConfig) => {
        if (config) setConfig({ ...config, route: newConf });
    };

    if (loading) return <div className="p-8 text-center text-slate-500"><SpinnerIcon className="w-8 h-8 mx-auto"/> Carregando...</div>;
    if (!config) return <div className="p-8 text-center text-red-500">Erro ao carregar configurações.</div>;

    return (
        <div className="bg-white p-8 rounded-2xl shadow-md border border-slate-200">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-slate-900 flex items-center"><UploadIcon className="w-6 h-6 mr-2 text-blue-600"/> Integração de Dados</h3>
                <div className="flex space-x-2 bg-slate-100 p-1 rounded-lg">
                    <button 
                        onClick={() => setActiveTab('colab')} 
                        className={`px-4 py-2 text-sm font-bold rounded-md transition ${activeTab === 'colab' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Colaboradores (MariaDB)
                    </button>
                    <button 
                        onClick={() => setActiveTab('route')} 
                        className={`px-4 py-2 text-sm font-bold rounded-md transition ${activeTab === 'route' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Roteirizador (SQL Server)
                    </button>
                </div>
            </div>
            
            <div className="animate-fade-in">
                {activeTab === 'colab' && (
                    <DbForm 
                        config={config.colab} 
                        onChange={handleColabChange} 
                        label="Importação de Colaboradores"
                        description="Conexão com banco externo (MariaDB/MySQL) para sincronização de cadastro."
                        icon={<UsersIcon className="w-6 h-6 text-blue-500"/>}
                        queryPlaceholder="SELECT id_funcionario AS id_pulsus, nome, setor AS codigo_setor, cargo AS grupo FROM funcionarios..."
                    />
                )}

                {activeTab === 'route' && (
                    <DbForm 
                        config={config.route} 
                        onChange={handleRouteChange} 
                        label="Previsão de Roteiro"
                        description="Conexão com ERP/SQL Server para buscar visitas previstas."
                        icon={<LocationMarkerIcon className="w-6 h-6 text-blue-500"/>}
                        queryPlaceholder="SELECT ... FROM IBETVSTCET WHERE DataVisita BETWEEN @pStartDate AND @pEndDate"
                    />
                )}
            </div>

            <div className="mt-8 pt-6 border-t border-slate-100 flex items-center">
                <button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl flex items-center shadow-lg shadow-blue-600/20">
                    {saving ? <SpinnerIcon className="w-5 h-5 mr-2"/> : <CheckCircleIcon className="w-5 h-5 mr-2"/>} Salvar Todas as Configurações
                </button>
                {message && <span className="ml-4 text-emerald-600 font-bold text-sm animate-pulse">{message}</span>}
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
    const [activeTab, setActiveTab] = useState<'users' | 'branding' | 'integration' | 'system' | 'license'>('users');
    return (
        <div className="space-y-8">
            <div><h2 className="text-3xl font-extrabold text-slate-900 mb-2 tracking-tight">Administração</h2><p className="text-slate-500">Controle total do sistema.</p></div>
            <div className="flex space-x-2 border-b border-slate-200 pb-1 overflow-x-auto">
                {[
                    { id: 'users', label: 'Usuários', icon: UserGroupIcon },
                    { id: 'integration', label: 'Integração DB', icon: UploadIcon },
                    { id: 'license', label: 'Licença', icon: DocumentReportIcon },
                    { id: 'branding', label: 'Marca', icon: PhotographIcon },
                    { id: 'system', label: 'Sistema', icon: CogIcon }
                ].map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`px-5 py-2.5 text-sm font-medium rounded-xl transition-all flex items-center border whitespace-nowrap ${activeTab === tab.id ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'bg-transparent text-slate-500 hover:text-slate-700 border-transparent hover:bg-slate-100'}`}>
                        <tab.icon className={`w-4 h-4 mr-2 ${activeTab === tab.id ? 'text-white' : 'text-slate-400'}`}/> {tab.label}
                    </button>
                ))}
            </div>
            <div>
                {activeTab === 'users' && <GestaoUsuarios embedded={true} />}
                {activeTab === 'integration' && <IntegrationSettings />}
                {activeTab === 'license' && <LicenseControl />}
                {activeTab === 'branding' && <SystemBranding />}
                {activeTab === 'system' && <SystemControl />}
            </div>
        </div>
    );
};
