import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { SpinnerIcon, FuelLogo, ExclamationIcon, TruckIcon } from './icons.tsx';
import { getSystemConfig } from '../services/apiService.ts';

export const Login: React.FC = () => {
    const { login } = useAuth();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [config, setConfig] = useState({ companyName: '', logoUrl: '' });

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const apiConfig = await getSystemConfig();
                setConfig(apiConfig);
            } catch (e) {}
        };
        fetchConfig();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username || !password) { setError('Preencha usuário e senha.'); return; }
        setIsLoading(true);
        setError('');
        try { await login(username, password); } catch (err: any) { setError(err.message || 'Falha no login.'); } finally { setIsLoading(false); }
    };

    return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4 relative overflow-hidden">
            {/* Blue Glow Effects - Subtle Corporate */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
                 <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-blue-100/40 rounded-full blur-[100px]"></div>
                 <div className="absolute bottom-[-10%] right-[-10%] w-[400px] h-[400px] bg-sky-100/40 rounded-full blur-[100px]"></div>
            </div>

            <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-10 z-10 relative">
                <div className="flex flex-col items-center mb-8">
                    <div className="flex items-center justify-center mb-4 p-4 bg-slate-50 rounded-full border border-slate-100 shadow-sm">
                        <FuelLogo className="h-12 w-12 text-blue-600" />
                    </div>
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-1">
                        Fuel<span className="text-blue-600">360</span>
                    </h1>
                    <p className="text-slate-500 text-sm font-medium">Gestão Inteligente de Reembolso</p>
                </div>

                {(config.companyName || config.logoUrl) && (
                    <div className="flex items-center justify-center mb-8 bg-slate-50 p-3 rounded-lg border border-slate-200">
                         {config.logoUrl ? (
                            <img src={config.logoUrl} alt={config.companyName} className="h-10 w-10 rounded-full object-cover border border-slate-200 shadow-sm mr-3" onError={(e) => e.currentTarget.style.display = 'none'} />
                        ) : (
                            <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center border border-slate-300 mr-3"><TruckIcon className="w-5 h-5 text-slate-500" /></div>
                        )}
                        <div>
                            <p className="text-[10px] text-slate-500 uppercase tracking-wider leading-none mb-1">Ambiente</p>
                            <h2 className="text-sm font-bold text-slate-800 leading-none">{config.companyName || 'Empresa'}</h2>
                        </div>
                    </div>
                )}

                {error && (
                    <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start text-sm text-red-600">
                        <ExclamationIcon className="w-5 h-5 mr-2 shrink-0" />
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="space-y-1">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Usuário</label>
                        <input 
                            type="text" 
                            value={username} 
                            onChange={(e) => setUsername(e.target.value)} 
                            className="w-full bg-slate-50 text-slate-900 border border-slate-300 rounded-xl p-3.5 focus:ring-2 focus:ring-blue-600 focus:border-blue-600 outline-none transition-all placeholder-slate-400 hover:border-blue-400 shadow-sm" 
                            placeholder="Digite seu usuário" 
                            autoFocus 
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Senha</label>
                        <input 
                            type="password" 
                            value={password} 
                            onChange={(e) => setPassword(e.target.value)} 
                            className="w-full bg-slate-50 text-slate-900 border border-slate-300 rounded-xl p-3.5 focus:ring-2 focus:ring-blue-600 focus:border-blue-600 outline-none transition-all placeholder-slate-400 hover:border-blue-400 shadow-sm" 
                            placeholder="Digite sua senha" 
                        />
                    </div>
                    <button type="submit" disabled={isLoading} className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl transition-all duration-200 flex justify-center items-center shadow-lg shadow-blue-600/20 hover:shadow-blue-600/40 transform hover:-translate-y-0.5 border border-transparent">
                        {isLoading ? <><SpinnerIcon className="w-5 h-5 mr-2" /> Entrando...</> : 'Acessar Sistema'}
                    </button>
                </form>
                
                <div className="mt-8 text-center pt-4 border-t border-slate-100">
                    <p className="text-xs text-slate-400 font-mono">v1.3.1 | Todos os direitos reservados</p>
                </div>
            </div>
        </div>
    );
};