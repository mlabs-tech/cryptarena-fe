'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, ReactNode } from 'react';
import { ConnectionProvider, WalletProvider, useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';
import { api, Wallet as LinkedWallet, WalletCheckResponse } from '@/lib/api';
import { useAuth } from './AuthContext';

interface WalletContextState {
  // Linked wallets from backend
  linkedWallets: LinkedWallet[];
  isLoadingWallets: boolean;
  
  // Wallet linking flow
  isLinking: boolean;
  linkingError: string | null;
  
  // Actions
  checkAndLinkWallet: () => Promise<{ success: boolean; error?: string }>;
  refreshLinkedWallets: () => Promise<void>;
  unlinkWallet: (walletId: string) => Promise<void>;
  
  // Status
  hasLinkedWallet: boolean;
  currentLinkedWallet: LinkedWallet | null;
}

const WalletContext = createContext<WalletContextState | undefined>(undefined);

function WalletContextProvider({ children }: { children: ReactNode }) {
  const { publicKey, signMessage, connected, disconnect } = useWallet();
  const { isAuthenticated } = useAuth();
  
  const [linkedWallets, setLinkedWallets] = useState<LinkedWallet[]>([]);
  const [isLoadingWallets, setIsLoadingWallets] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [linkingError, setLinkingError] = useState<string | null>(null);

  // Load linked wallets when authenticated
  const refreshLinkedWallets = useCallback(async () => {
    if (!isAuthenticated) {
      setLinkedWallets([]);
      return;
    }

    setIsLoadingWallets(true);
    try {
      const wallets = await api.getUserWalletsByType('SOLANA');
      setLinkedWallets(wallets);
    } catch (error) {
      console.error('Failed to load linked wallets:', error);
    } finally {
      setIsLoadingWallets(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    refreshLinkedWallets();
  }, [refreshLinkedWallets]);

  // Check if the currently connected wallet is linked, and link it if not
  const checkAndLinkWallet = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!publicKey || !signMessage || !connected) {
      return { success: false, error: 'No wallet connected' };
    }

    const walletAddress = publicKey.toBase58();
    setIsLinking(true);
    setLinkingError(null);

    try {
      // Check if wallet is already linked
      const checkResponse: WalletCheckResponse = await api.checkWallet(walletAddress);

      if (checkResponse.linkedToOtherUser) {
        const error = 'This wallet is already linked to another account. Please use a different wallet.';
        setLinkingError(error);
        return { success: false, error };
      }

      if (checkResponse.linkedToCurrentUser) {
        // Wallet already linked to current user, we're good
        await refreshLinkedWallets();
        return { success: true };
      }

      // Wallet not linked, need to sign message and link
      const messageResponse = await api.generateLinkingMessage(walletAddress);
      
      // Request signature from wallet
      const messageBytes = new TextEncoder().encode(messageResponse.message);
      let signature: Uint8Array;
      
      try {
        signature = await signMessage(messageBytes);
      } catch (signError) {
        const error = 'Signature was rejected. Please try again.';
        setLinkingError(error);
        return { success: false, error };
      }

      // Convert signature to base64
      const signatureBase64 = Buffer.from(signature).toString('base64');

      // Link wallet via API
      await api.linkWallet({
        address: walletAddress,
        signature: signatureBase64,
        message: messageResponse.message,
        walletType: 'SOLANA',
      });

      await refreshLinkedWallets();
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to link wallet';
      setLinkingError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsLinking(false);
    }
  }, [publicKey, signMessage, connected, refreshLinkedWallets]);

  // Unlink a wallet
  const unlinkWallet = useCallback(async (walletId: string) => {
    try {
      await api.unlinkWallet(walletId);
      await refreshLinkedWallets();
    } catch (error) {
      console.error('Failed to unlink wallet:', error);
      throw error;
    }
  }, [refreshLinkedWallets]);

  // Check if the currently connected wallet is in the linked wallets list
  const currentLinkedWallet = useMemo(() => {
    if (!publicKey || !connected) return null;
    const address = publicKey.toBase58();
    return linkedWallets.find(w => w.address === address) || null;
  }, [publicKey, connected, linkedWallets]);

  const value: WalletContextState = {
    linkedWallets,
    isLoadingWallets,
    isLinking,
    linkingError,
    checkAndLinkWallet,
    refreshLinkedWallets,
    unlinkWallet,
    hasLinkedWallet: linkedWallets.length > 0,
    currentLinkedWallet,
  };

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
}

// RPC endpoints - Helius primary, public devnet fallback
const HELIUS_RPC = 'https://devnet.helius-rpc.com/?api-key=35d6175b-4d5e-4e99-924b-604c37cd2c9e';
const PUBLIC_DEVNET_RPC = clusterApiUrl('devnet');

// Main provider that wraps Solana wallet providers
export function SolanaWalletProvider({ children }: { children: ReactNode }) {
  // Use Helius RPC for faster performance (10 req/s), fallback to public devnet
  const endpoint = useMemo(() => HELIUS_RPC, []);
  
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ],
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletContextProvider>
          {children}
        </WalletContextProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

export function useWalletContext() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWalletContext must be used within a SolanaWalletProvider');
  }
  return context;
}

// Re-export solana wallet hooks for convenience
export { useWallet, useConnection } from '@solana/wallet-adapter-react';

