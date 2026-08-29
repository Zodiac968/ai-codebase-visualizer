import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../types/auth';
import { loginUser, registerUser, fetchCurrentUser } from '../services/api';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  clearError: () => void;
  verifyToken: () => Promise<{ success: boolean; data?: any; error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_STORAGE_KEY = 'visualizer_auth_token';

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_STORAGE_KEY));
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Restore authenticated session on initial mount
  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
      if (storedToken) {
        setToken(storedToken);
        const { data, error: userError } = await fetchCurrentUser(storedToken);
        if (data) {
          setUser(data);
        } else {
          // Token is invalid/expired
          localStorage.removeItem(TOKEN_STORAGE_KEY);
          setToken(null);
          setUser(null);
          if (userError) {
            console.warn('Session restoration failed:', userError);
          }
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    const { data, error: loginError } = await loginUser(email, password);

    if (loginError || !data) {
      setError(loginError || 'Login failed');
      setIsLoading(false);
      return false;
    }

    localStorage.setItem(TOKEN_STORAGE_KEY, data.access_token);
    setToken(data.access_token);

    if (data.user) {
      setUser(data.user);
    } else {
      const { data: userData } = await fetchCurrentUser(data.access_token);
      if (userData) setUser(userData);
    }

    setIsLoading(false);
    return true;
  };

  const register = async (email: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    const { data, error: regError } = await registerUser(email, password);

    if (regError || !data) {
      setError(regError || 'Registration failed');
      setIsLoading(false);
      return false;
    }

    localStorage.setItem(TOKEN_STORAGE_KEY, data.access_token);
    setToken(data.access_token);

    if (data.user) {
      setUser(data.user);
    } else {
      const { data: userData } = await fetchCurrentUser(data.access_token);
      if (userData) setUser(userData);
    }

    setIsLoading(false);
    return true;
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setUser(null);
    setError(null);
  };

  const clearError = () => setError(null);

  const verifyToken = async () => {
    if (!token) {
      return { success: false, error: 'No token present' };
    }
    const result = await fetchCurrentUser(token);
    if (result.data) {
      return { success: true, data: result.data };
    }
    return { success: false, error: result.error || 'Token validation failed' };
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        error,
        login,
        register,
        logout,
        clearError,
        verifyToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
