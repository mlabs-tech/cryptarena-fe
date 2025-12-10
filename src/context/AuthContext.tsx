'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, User } from '@/lib/api';
import { initiateTwitterAuth } from '@/lib/twitter-auth';

export type AuthMethod = 'twitter' | 'privy';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  authMethod: AuthMethod | null;
  login: () => Promise<void>;
  logout: (logoutPrivyFn?: () => Promise<void>) => Promise<void>;
  refreshUser: () => Promise<void>;
  setUserFromPrivy: (user: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authMethod, setAuthMethod] = useState<AuthMethod | null>(null);

  // Check authentication status on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      if (api.isAuthenticated()) {
        const currentUser = await api.getCurrentUser();
        setUser(currentUser);
        // Determine auth method from stored preference or default to twitter
        const storedMethod = localStorage.getItem('cryptarena_auth_method') as AuthMethod | null;
        setAuthMethod(storedMethod || 'twitter');
      }
    } catch (error) {
      console.error('Failed to check auth:', error);
      // Clear invalid tokens
      api.clearTokens();
      localStorage.removeItem('cryptarena_auth_method');
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = useCallback(async () => {
    // This is for direct Twitter OAuth flow (non-Privy)
    localStorage.setItem('cryptarena_auth_method', 'twitter');
    setAuthMethod('twitter');
    await initiateTwitterAuth();
  }, []);

  const logout = useCallback(async (logoutPrivyFn?: () => Promise<void>) => {
    await api.logout();
    localStorage.removeItem('cryptarena_auth_method');
    setUser(null);
    setAuthMethod(null);
    
    // If user was logged in via Privy, also logout from Privy
    if (logoutPrivyFn) {
      try {
        await logoutPrivyFn();
      } catch (error) {
        console.error('Failed to logout from Privy:', error);
      }
    }
  }, []);

  const refreshUser = useCallback(async () => {
    if (api.isAuthenticated()) {
      try {
        const currentUser = await api.getCurrentUser();
        setUser(currentUser);
      } catch (error) {
        console.error('Failed to refresh user:', error);
      }
    }
  }, []);

  const setUserFromPrivy = useCallback((privyUser: User) => {
    setUser(privyUser);
    localStorage.setItem('cryptarena_auth_method', 'privy');
    setAuthMethod('privy');
  }, []);

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    authMethod,
    login,
    logout,
    refreshUser,
    setUserFromPrivy,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// HOC for protected components
export function withAuth<P extends object>(
  WrappedComponent: React.ComponentType<P>
): React.FC<P> {
  return function WithAuthComponent(props: P) {
    const { isAuthenticated, isLoading } = useAuth();

    if (isLoading) {
      return (
        <div className="flex min-h-screen items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500"></div>
        </div>
      );
    }

    if (!isAuthenticated) {
      return null; // Will be handled by middleware
    }

    return <WrappedComponent {...props} />;
  };
}

