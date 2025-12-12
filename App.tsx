
import React, { useState, useContext, useEffect } from 'react';
import { Importacao } from './components/Importacao.tsx';
import { Configuracao } from './components/Configuracao.tsx';
import { AdminPanel } from './components/AdminPanel.tsx';
import { GestaoEquipe } from './components/GestaoEquipe.tsx';
import { Relatorios } from './components/Relatorios.tsx';
import { GestaoAusencias } from './components/GestaoAusencias.tsx';
import { Roteirizador } from './components/Roteirizador.tsx'; // Novo Import
import { Login } from './components/Login.tsx';
import { DataProvider, DataContext } from './context/DataContext.tsx';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { FuelLogo, CogIcon, UserGroupIcon, CalculatorIcon, ChevronDoubleLeftIcon, ChevronDoubleRightIcon, ExclamationIcon, UsersIcon, ChartBarIcon, CalendarIcon, LocationMarkerIcon } from './components/icons.tsx';
import { getSystemStatus } from './services/apiService.ts';
import { LicenseStatus } from './types.ts';

type View = 'calculo' | 'roteirizador' | 'equipe' | 'ausencias' | 'relatorios' | 'config' | 'admin';

interface SidebarProps {
    activeView: View;
    setView: (view: View) => void;
    isCollapsed: boolean;
    setCollapsed: (collapsed: boolean) => void;
    licenseStatus: LicenseStatus | null;
}

const Sidebar: React.FC<SidebarProps> = ({ activeView, setView, isCollapsed, setCollapsed, licenseStatus }) => {
    const { systemConfig } = useContext(DataContext);
    const { user, logout } = useAuth();
    
    const navItems = [
        { id: 'calculo', label: 'Cálculo de Reembolso', icon: CalculatorIcon },
        { id: 'roteirizador', label: 'Roteirizador Previsto', icon: LocationMarkerIcon }, // Novo Item
        { id: 'equipe', label: 'Equipe & Setores', icon: UsersIcon },
        { id: 'ausencias', label: 'Gestão de Ausências', icon: CalendarIcon },
        { id: 'relatorios', label: 'Relatórios', icon: ChartBarIcon },
        { id: 'config', label: 'Parâmetros KM/L', icon: CogIcon },
    ];

    if (user?.Perfil === 'Admin') {
        // @ts-ignore
        navItems.push({ id: 'admin', label: 'Administração', icon: UserGroupIcon });
    }

    const renderLicenseAlert = () => {
        if (!licenseStatus || !licenseStatus.expiresAt) return null;
        const today = new Date();
        const expireDate = new Date(licenseStatus.expiresAt);
        const diffDays = Math.ceil((expireDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays > 15) return null;
        let colorClass = 'bg-amber-50 text-amber-600 border-amber-200';
        let text = `Vence em ${diffDays} dias`;
        if (diffDays <= 5) colorClass = 'bg-red-50 text-red-500 border-red-200';
        if (diffDays < 0) { text = "Licença Expirada"; colorClass = 'bg-red-600 text-white border-red-700'; }

        if (isCollapsed) {
            return <div className={`mt-2 w-6 h-6 rounded-full flex items-center justify-center ${diffDays < 0 ? 'bg-red-600 text-white' : 'bg-amber-100 text-amber-700'} animate-pulse text-xs font-bold`}>!</div>;
        }
        return <div className={`mt-4 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wide border flex items-center justify-center w-full animate-pulse cursor-help ${colorClass}`} onClick={() => setView('admin')}><ExclamationIcon className="w-3 h-3 mr-2" />{text}</div>;
    };

    return (
        <div className={`bg-white border-r border-slate-200 flex flex-col transition-all duration-300 relative z-20 ${isCollapsed ? 'w-20' : 'w-72'} shadow-sm`}>
            {/* Header */}
            <div className={`flex items-center justify-center py-8 ${isCollapsed ? 'px-1' : 'px-6'}`}>
                <FuelLogo className={`transition-all duration-300 ${isCollapsed ? 'h-8 w-8' : 'h-9 w-9 mr-3'}`} />
                <h1 className={`text-xl font-bold text-slate-800 tracking-tight transition-all duration-200 ${isCollapsed ? 'w-0 opacity-0 overflow-hidden' : 'w-auto opacity-100'}`}>
                    Fuel<span className="text-blue-600">360</span>
                </h1>
            </div>

            {/* User / Company Info */}
            <div className={`flex flex-col items-center justify-center mb-10 transition-all duration-500 ${isCollapsed ? 'px-2' : 'px-6'}`}>
                {systemConfig.logoUrl ? (
                    <div className="relative group">
                        <div className="absolute -inset-0.5 bg-gradient-to-tr from-blue-100 to-slate-100 rounded-full opacity-50 blur group-hover:opacity-75 transition duration-500"></div>
                        <img src={systemConfig.logoUrl} alt="Logo" className={`relative rounded-full object-cover bg-white border border-slate-100 p-1 transition-all duration-500 ${isCollapsed ? 'h-10 w-10' : 'h-20 w-20'}`} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    </div>
                ) : (
                    <div className={`rounded-full bg-slate-50 flex items-center justify-center border border-slate-200 text-slate-400 font-bold ${isCollapsed ? 'h-10 w-10' : 'h-16 w-16'}`}>
                        <span className="text-xl">{systemConfig.companyName?.charAt(0) || 'F'}</span>
                    </div>
                )}
                <h2 className={`text-sm font-semibold text-slate-600 text-center mt-4 transition-all duration-200 ${isCollapsed ? 'opacity-0 h-0 overflow-hidden mt-0' : 'opacity-100'}`}>{systemConfig.companyName}</h2>
                
                {renderLicenseAlert()}
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-4 space-y-1.5 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200">
                {navItems.map(item => (
                    <button 
                        key={item.id} 
                        onClick={() => setView(item.id as View)} 
                        title={isCollapsed ? item.label : undefined} 
                        className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200 group ${
                            activeView === item.id 
                                ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/10' 
                                : 'text-slate-500 hover:bg-slate-50 hover:text-blue-600'
                        }`}
                    >
                        <item.icon className={`h-5 w-5 shrink-0 transition-colors ${activeView === item.id ? 'text-white' : 'text-slate-400 group-hover:text-blue-600'}`} />
                        <span className={`ml-3 transition-all duration-200 whitespace-nowrap ${isCollapsed ? 'opacity-0 hidden' : 'opacity-100'}`}>{item.label}</span>
                    </button>
                ))}
            </nav>
            
            {/* Footer */}
            <div className="p-4 mt-auto border-t border-slate-100">
                <div className={`flex items-center transition-all duration-300 ${isCollapsed ? 'justify-center flex-col gap-2' : 'justify-between px-2'}`}>
                     <div className="flex items-center overflow-hidden">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs shrink-0 ring-2 ring-white">
                            {user?.Nome.charAt(0).toUpperCase()}
                        </div>
                        <div className={`ml-3 overflow-hidden transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
                            <p className="text-sm font-semibold text-slate-700 truncate">{user?.Nome}</p>
                            <p className="text-[10px] text-slate-400 font-medium truncate">{user?.Perfil}</p>
                        </div>
                     </div>
                     <button onClick={logout} className={`text-slate-400 hover:text-red-500 transition-colors p-1.5 rounded-md hover:bg-red-50 ${isCollapsed ? '' : ''}`} title="Sair">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                     </button>
                </div>
                {!isCollapsed && (
                    <div className="mt-4 text-[10px] text-center text-slate-300 font-mono">
                        v1.4.6
                    </div>
                )}
            </div>

            <button onClick={() => setCollapsed(!isCollapsed)} className="absolute -right-3 top-12 bg-white border border-slate-200 rounded-full p-1 text-slate-400 hover:text-blue-600 shadow-sm transition-colors z-30">
                {isCollapsed ? <ChevronDoubleRightIcon className="h-3 w-3"/> : <ChevronDoubleLeftIcon className="h-3 w-3"/>}
            </button>
        </div>
    );
};

const MainLayout: React.FC = () => {
    const { systemConfig } = useContext(DataContext);
    const { isAuthenticated, loading: authLoading } = useAuth();
    const [activeView, setActiveView] = useState<View>('calculo');
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null);

    useEffect(() => {
        document.title = `${systemConfig.companyName || 'Fuel360'} | Gestão`;
        getSystemStatus().then(setLicenseStatus).catch(console.error);
    }, [systemConfig]);

    const renderContent = () => {
        switch (activeView) {
            case 'calculo': return <Importacao />;
            case 'roteirizador': return <Roteirizador />; // Novo Componente
            case 'equipe': return <GestaoEquipe />;
            case 'ausencias': return <GestaoAusencias />;
            case 'relatorios': return <Relatorios />;
            case 'config': return <Configuracao />;
            case 'admin': return <AdminPanel />;
            default: return <Importacao />;
        }
    };

    if (authLoading) return (
        <div className="flex h-screen items-center justify-center bg-slate-50">
            <div className="flex flex-col items-center animate-pulse">
                <FuelLogo className="w-12 h-12 mb-4 opacity-80"/>
                <span className="text-slate-400 text-xs font-semibold tracking-widest uppercase">Iniciando Sistema...</span>
            </div>
        </div>
    );
    
    if (!isAuthenticated) return <Login />;

    return (
        <div className="flex flex-col h-screen bg-slate-50 text-slate-900 font-sans">
            <div className="flex flex-1 overflow-hidden">
                <Sidebar activeView={activeView} setView={setActiveView} isCollapsed={isSidebarCollapsed} setCollapsed={setIsSidebarCollapsed} licenseStatus={licenseStatus} />
                <main className="flex-1 p-8 overflow-y-auto bg-slate-50/50 relative scrollbar-thin scrollbar-thumb-slate-200">
                    <div className="max-w-7xl mx-auto h-full animate-fade-in">
                       {renderContent()}
                    </div>
                </main>
            </div>
        </div>
    );
};

const App: React.FC = () => {
    return <AuthProvider><DataProvider><MainLayout /></DataProvider></AuthProvider>;
}

export default App;
