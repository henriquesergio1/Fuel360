
import React, { createContext, useState, useEffect, ReactNode, useContext } from 'react';
import { Usuario } from '../types.ts';
import * as api from '../services/apiService.ts';

interface AuthContextType {
    user: Usuario | null;
    isAuthenticated: boolean;
    loading: boolean;
    login: (usuario: string, senha: string) => Promise<void>;
    logout: () => void;
}

export const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider: React.FC<{children: ReactNode}> = ({ children }) => {
    const [user, setUser] = useState<Usuario | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const savedUser = localStorage.getItem('AUTH_USER');
        const token = localStorage.getItem('AUTH_TOKEN');
        
        if (savedUser && token) {
            try {
                setUser(JSON.parse(savedUser));
            } catch (e) {
                localStorage.removeItem('AUTH_USER');
                localStorage.removeItem('AUTH_TOKEN');
            }
        }
        setLoading(false);
    }, []);

    const login = async (usuario: string, senha: string) => {
        const response = await api.login(usuario, senha);
        localStorage.setItem('AUTH_TOKEN', response.token);
        localStorage.setItem('AUTH_USER', JSON.stringify(response.user));
        setUser(response.user);
    };

    const logout = () => {
        localStorage.removeItem('AUTH_TOKEN');
        localStorage.removeItem('AUTH_USER');
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{
            user,
            isAuthenticated: !!user,
            loading,
            login,
            logout
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
