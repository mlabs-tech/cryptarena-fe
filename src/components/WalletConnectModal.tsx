'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useWallet, useWalletContext } from '@/context/WalletContext';
import { WalletReadyState } from '@solana/wallet-adapter-base';
import Image from 'next/image';
import localFont from 'next/font/local';

const aceOfSwords = localFont({
  src: '../fonts/AceOfSwords-R9x9W.otf',
  variable: '--font-ace-of-swords',
});

interface WalletConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type ModalStep = 'connect' | 'linking' | 'success' | 'error';

// Solana wallet icons
const WALLET_ICONS: Record<string, string> = {
  'Phantom': 'https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/df8f4955-d754-41d0-3b9a-48c58b6eec00/public',
  'Solflare': 'https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/01fb6e19-0a2d-45de-5bb1-f1b424c72100/public',
};

export default function WalletConnectModal({ isOpen, onClose, onSuccess }: WalletConnectModalProps) {
  const { publicKey, connected, disconnect, wallets, select } = useWallet();
  const { checkAndLinkWallet, isLinking, linkingError, currentLinkedWallet } = useWalletContext();
  
  const [step, setStep] = useState<ModalStep>('connect');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Filter to only show Solana wallets (Phantom, Solflare)
  const solanaWallets = wallets.filter(w => 
    w.adapter.name === 'Phantom' || w.adapter.name === 'Solflare'
  );

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      setIsConnecting(false);
      if (connected && currentLinkedWallet) {
        setStep('success');
      } else if (connected) {
        setStep('linking');
      } else {
        setStep('connect');
      }
    }
  }, [isOpen, connected, currentLinkedWallet]);

  // Handle wallet connection changes
  useEffect(() => {
    if (connected && step === 'connect') {
      setStep('linking');
      handleLinkWallet();
    }
  }, [connected, step]);

  const handleLinkWallet = useCallback(async () => {
    if (!connected) return;
    
    setStep('linking');
    const result = await checkAndLinkWallet();
    
    if (result.success) {
      setStep('success');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    } else {
      setErrorMessage(result.error || 'Failed to link wallet');
      setStep('error');
    }
  }, [connected, checkAndLinkWallet, onSuccess, onClose]);

  const handleSelectWallet = async (walletName: string) => {
    setIsConnecting(true);
    setErrorMessage(null);
    
    try {
      select(walletName as any);
    } catch (error) {
      console.error('Failed to select wallet:', error);
      setErrorMessage('Failed to connect wallet');
      setIsConnecting(false);
    }
  };

  const handleRetry = () => {
    setErrorMessage(null);
    if (connected) {
      handleLinkWallet();
    } else {
      setStep('connect');
    }
  };

  const handleDisconnectAndRetry = async () => {
    await disconnect();
    setStep('connect');
    setErrorMessage(null);
    setIsConnecting(false);
  };

  const getWalletStatus = (walletAdapter: any) => {
    if (walletAdapter.readyState === WalletReadyState.Installed) {
      return { installed: true, label: 'Detected' };
    }
    if (walletAdapter.readyState === WalletReadyState.Loadable) {
      return { installed: true, label: 'Available' };
    }
    return { installed: false, label: 'Not Installed' };
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop with blur */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal - Liquid Glass Effect */}
      <div className={`relative bg-white/20 backdrop-blur-md rounded-3xl border border-white/30 p-8 w-full max-w-md mx-4 shadow-2xl animate-slide-in-up ${aceOfSwords.variable}`}>
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-all cursor-pointer"
        >
          <svg className="w-5 h-5 text-white/70 hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Content based on step */}
        {step === 'connect' && (
          <div className="text-center">
            {/* Icon */}
            <div className="w-20 h-20 mx-auto mb-6 bg-white/30 backdrop-blur-sm rounded-2xl flex items-center justify-center border border-white/40">
              <svg className="w-10 h-10 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            
            {/* Title */}
            <h2 
              className="text-3xl text-white mb-2 tracking-wide"
              style={{ fontFamily: 'var(--font-ace-of-swords)' }}
            >
              CONNECT WALLET
            </h2>
            <p className="text-white mb-6 text-sm font-bold">
              Connect a Solana wallet to enter the Arena
            </p>
            
            {/* Wallet List */}
            <div className="space-y-3 mb-6">
              {solanaWallets.map((w) => {
                const status = getWalletStatus(w.adapter);
                const iconUrl = WALLET_ICONS[w.adapter.name] || w.adapter.icon;
                
                return (
                  <button
                    key={w.adapter.name}
                    onClick={() => status.installed && handleSelectWallet(w.adapter.name)}
                    disabled={isConnecting || !status.installed}
                    className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all ${
                      status.installed
                        ? 'bg-zinc-700/60 backdrop-blur-sm border-white/20 hover:bg-zinc-600/70 hover:border-amber-400/50 cursor-pointer'
                        : 'bg-zinc-800/40 border-white/10 opacity-60 cursor-not-allowed'
                    }`}
                  >
                    <div className="w-12 h-12 rounded-xl bg-white/10 p-2 flex items-center justify-center">
                      {iconUrl && (
                        <Image
                          src={iconUrl}
                          alt={w.adapter.name}
                          width={32}
                          height={32}
                          className="rounded-lg"
                        />
                      )}
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-white font-bold text-lg">{w.adapter.name}</p>
                      <p className={`text-sm ${status.installed ? 'text-amber-400' : 'text-white/40'}`}>
                        {status.label}
                      </p>
                    </div>
                    {status.installed ? (
                      <svg className="w-6 h-6 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    ) : (
                      <a
                        href={w.adapter.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="px-3 py-1.5 rounded-lg bg-amber-400/20 text-amber-400 text-sm font-bold hover:bg-amber-400/30 transition-all"
                      >
                        Install
                      </a>
                    )}
                  </button>
                );
              })}
            </div>
            
            <p className="text-white/80 text-xs font-bold">
              Solana wallets only • Sign to verify ownership
            </p>
          </div>
        )}

        {step === 'linking' && (
          <div className="text-center">
            {/* Loading animation */}
            <div className="w-20 h-20 mx-auto mb-6 relative">
              <div className="absolute inset-0 bg-amber-400/30 rounded-2xl animate-pulse" />
              <div className="absolute inset-2 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center border border-white/30">
                <svg className="w-8 h-8 text-amber-400 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            </div>
            
            <h2 
              className="text-3xl text-white mb-2 tracking-wide"
              style={{ fontFamily: 'var(--font-ace-of-swords)' }}
            >
              {isLinking ? 'LINKING...' : 'SIGN MESSAGE'}
            </h2>
            <p className="text-white/70 mb-6 text-sm">
              {isLinking 
                ? 'Verifying your signature...'
                : 'Please sign the message in your wallet'}
            </p>
            
            {publicKey && (
              <div className="bg-zinc-700/60 backdrop-blur-sm rounded-xl px-4 py-3 inline-block border border-white/20">
                <span className="text-white/80 font-mono text-sm">
                  {publicKey.toBase58().slice(0, 6)}...{publicKey.toBase58().slice(-6)}
                </span>
              </div>
            )}
          </div>
        )}

        {step === 'success' && (
          <div className="text-center">
            {/* Success icon */}
            <div className="w-20 h-20 mx-auto mb-6 bg-green-500/30 backdrop-blur-sm rounded-2xl flex items-center justify-center border border-green-400/40">
              <svg className="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            
            <h2 
              className="text-3xl text-white mb-2 tracking-wide"
              style={{ fontFamily: 'var(--font-ace-of-swords)' }}
            >
              CONNECTED!
            </h2>
            <p className="text-white/70 mb-6 text-sm">
              Your wallet has been linked successfully
            </p>
            
            {publicKey && (
              <div className="bg-green-500/20 backdrop-blur-sm rounded-xl px-4 py-3 inline-block border border-green-400/30">
                <span className="text-green-300 font-mono text-sm">
                  {publicKey.toBase58().slice(0, 6)}...{publicKey.toBase58().slice(-6)}
                </span>
              </div>
            )}
          </div>
        )}

        {step === 'error' && (
          <div className="text-center">
            {/* Error icon */}
            <div className="w-20 h-20 mx-auto mb-6 bg-red-500/30 backdrop-blur-sm rounded-2xl flex items-center justify-center border border-red-400/40">
              <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            
            <h2 
              className="text-3xl text-white mb-2 tracking-wide"
              style={{ fontFamily: 'var(--font-ace-of-swords)' }}
            >
              FAILED
            </h2>
            <p className="text-red-400/90 mb-6 text-sm px-4">
              {errorMessage || linkingError || 'An error occurred while linking your wallet'}
            </p>
            
            <div className="space-y-3">
              <button
                onClick={handleRetry}
                className="w-full bg-amber-400 hover:bg-amber-300 text-gray-900 font-black text-lg py-4 rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
              >
                TRY AGAIN
              </button>
              <button
                onClick={handleDisconnectAndRetry}
                className="w-full bg-zinc-700/60 backdrop-blur-sm border border-white/20 text-white font-bold py-4 rounded-2xl hover:bg-zinc-600/70 transition-all cursor-pointer"
              >
                Use Different Wallet
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
