'use client';

import React, { createContext, useContext, useCallback, useState } from 'react';
import { PrivyProvider, usePrivy, User as PrivyUser } from '@privy-io/react-auth';
import { PRIVY_APP_ID, SOLANA_RPC_URL } from '@/lib/config';
import { api } from '@/lib/api';

interface PrivyAuthContextType {
  isPrivyReady: boolean;
  isPrivyAuthenticated: boolean;
  privyUser: PrivyUser | null;
  loginWithPrivy: () => Promise<void>;
  logoutPrivy: () => Promise<void>;
  authenticateWithBackend: () => Promise<boolean>;
  getSolanaWalletAddress: () => string | null;
  getEvmWalletAddress: () => string | null;
  copySolanaAddress: () => Promise<boolean>;
}

const PrivyAuthContext = createContext<PrivyAuthContextType | undefined>(undefined);

function PrivyAuthContextProvider({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy();
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const getSolanaWalletAddress = useCallback((): string | null => {
    if (!user) return null;
    
    // Find Solana wallet from linked accounts
    const solanaWallet = user.linkedAccounts?.find(
      (account) => account.type === 'wallet' && 'chainType' in account && account.chainType === 'solana'
    );
    
    if (solanaWallet && 'address' in solanaWallet) {
      return solanaWallet.address;
    }
    
    return null;
  }, [user]);

  const getEvmWalletAddress = useCallback((): string | null => {
    if (!user) return null;
    
    // Find EVM wallet from linked accounts
    const evmWallet = user.linkedAccounts?.find(
      (account) => account.type === 'wallet' && 'chainType' in account && account.chainType === 'ethereum'
    );
    
    if (evmWallet && 'address' in evmWallet) {
      return evmWallet.address;
    }
    
    return null;
  }, [user]);

  const getTwitterData = useCallback(() => {
    if (!user) return null;
    
    const twitterAccount = user.linkedAccounts?.find(
      (account) => account.type === 'twitter_oauth'
    );
    
    if (twitterAccount && 'subject' in twitterAccount) {
      return {
        twitterId: twitterAccount.subject,
        twitterUsername: 'username' in twitterAccount ? twitterAccount.username : null,
        twitterName: 'name' in twitterAccount ? twitterAccount.name : null,
        twitterProfilePicture: 'profilePictureUrl' in twitterAccount ? twitterAccount.profilePictureUrl : null,
      };
    }
    
    return null;
  }, [user]);

  const authenticateWithBackend = useCallback(async (): Promise<boolean> => {
    if (!authenticated || !user || isAuthenticating) return false;
    
    setIsAuthenticating(true);
    
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        console.error('Failed to get Privy access token');
        return false;
      }

      // Call backend to authenticate with Privy
      // Backend will validate the token and fetch user/wallet data directly from Privy API
      await api.privyCallback({ accessToken });

      return true;
    } catch (error) {
      console.error('Failed to authenticate with backend:', error);
      return false;
    } finally {
      setIsAuthenticating(false);
    }
  }, [authenticated, user, isAuthenticating, getAccessToken]);

  const loginWithPrivy = useCallback(async () => {
    await login();
  }, [login]);

  const logoutPrivy = useCallback(async () => {
    await logout();
  }, [logout]);

  // Copy Solana address to clipboard
  const copySolanaAddress = useCallback(async (): Promise<boolean> => {
    const address = getSolanaWalletAddress();
    if (address) {
      try {
        await navigator.clipboard.writeText(address);
        return true;
      } catch (err) {
        console.error('Failed to copy address:', err);
        return false;
      }
    }
    return false;
  }, [getSolanaWalletAddress]);

  const value: PrivyAuthContextType = {
    isPrivyReady: ready,
    isPrivyAuthenticated: authenticated,
    privyUser: user,
    loginWithPrivy,
    logoutPrivy,
    authenticateWithBackend,
    getSolanaWalletAddress,
    getEvmWalletAddress,
    copySolanaAddress,
  };

  return (
    <PrivyAuthContext.Provider value={value}>
      {children}
    </PrivyAuthContext.Provider>
  );
}

// Fallback context for when Privy is not configured
const FallbackPrivyAuthContext: PrivyAuthContextType = {
  isPrivyReady: true,
  isPrivyAuthenticated: false,
  privyUser: null,
  loginWithPrivy: async () => {
    console.warn('Privy is not configured. Please set NEXT_PUBLIC_PRIVY_APP_ID.');
  },
  logoutPrivy: async () => {},
  authenticateWithBackend: async () => false,
  getSolanaWalletAddress: () => null,
  getEvmWalletAddress: () => null,
  copySolanaAddress: async () => {
    console.warn('Privy is not configured.');
    return false;
  },
};

function FallbackProvider({ children }: { children: React.ReactNode }) {
  return (
    <PrivyAuthContext.Provider value={FallbackPrivyAuthContext}>
      {children}
    </PrivyAuthContext.Provider>
  );
}

export function PrivyAuthProvider({ children }: { children: React.ReactNode }) {
  if (!PRIVY_APP_ID) {
    console.warn('PRIVY_APP_ID is not set. Privy authentication will not work.');
    return <FallbackProvider>{children}</FallbackProvider>;
  }

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        // Only allow Twitter login through Privy
        loginMethods: ['twitter'],
        // Appearance customization
        appearance: {
          theme: 'dark',
          accentColor: '#F59E0B', // Amber color to match the app
          logo: 'https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/96807945-a58d-48f2-bb50-efd65c3aa100/public',
        },
        // Embedded wallet configuration
        embeddedWallets: {
          solana: {
            createOnLogin: 'all-users',
          },
          ethereum: {
            createOnLogin: 'all-users',
          },
        },
      }}
    >
      <PrivyAuthContextProvider>
        {children}
      </PrivyAuthContextProvider>
    </PrivyProvider>
  );
}

export function usePrivyAuth() {
  const context = useContext(PrivyAuthContext);
  if (context === undefined) {
    throw new Error('usePrivyAuth must be used within a PrivyAuthProvider');
  }
  return context;
}

