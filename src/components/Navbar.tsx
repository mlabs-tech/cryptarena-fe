'use client';

import { useState, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { usePrivyAuth } from '@/context/PrivyContext';
import { useWallet, useWalletContext } from '@/context/WalletContext';
import WalletConnectModal from '@/components/WalletConnectModal';
import Image from 'next/image';

interface NavItem {
  name: string;
  path: string;
}

const navItems: NavItem[] = [
  { name: 'PLAY', path: '/' },
  { name: 'ARENAS', path: '/arenas' },
];

interface NavbarProps {
  transparent?: boolean;
}

export default function Navbar({ transparent = false }: NavbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout, authMethod } = useAuth();
  const { logoutPrivy, getSolanaWalletAddress, isPrivyAuthenticated, copySolanaAddress } = usePrivyAuth();
  const [copiedAddress, setCopiedAddress] = useState(false);
  const { publicKey, connected } = useWallet();
  const { currentLinkedWallet } = useWalletContext();
  
  const [showWalletModal, setShowWalletModal] = useState(false);

  // Get the wallet address to display based on auth method
  const walletDisplay = useMemo(() => {
    // If user is authenticated via Privy, show the Privy embedded wallet
    if (authMethod === 'privy' && isPrivyAuthenticated) {
      const privyWalletAddress = getSolanaWalletAddress();
      if (privyWalletAddress) {
        return {
          address: privyWalletAddress,
          isPrivy: true,
          isLinked: true, // Privy wallets are automatically linked
        };
      }
    }
    
    // Otherwise, show external wallet if connected
    if (connected && publicKey) {
      return {
        address: publicKey.toBase58(),
        isPrivy: false,
        isLinked: !!currentLinkedWallet,
      };
    }
    
    return null;
  }, [authMethod, isPrivyAuthenticated, getSolanaWalletAddress, connected, publicKey, currentLinkedWallet]);

  if (!user) return null;

  return (
    <>
      {/* Fixed navbar */}
      <nav className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between py-3 px-6 ${
        transparent 
          ? '' 
          : 'bg-[#222732]/90 backdrop-blur-xl border-b border-white/5'
      }`}>
        {/* Left - Menu Items */}
        <div className="flex items-center gap-1.5">
          {navItems.map((item) => {
            const isActive = pathname === item.path;
            return (
              <button
                key={item.name}
                onClick={() => router.push(item.path)}
                className={`px-5 py-2 rounded-lg font-bold text-sm transition-all cursor-pointer ${
                  isActive
                    ? 'bg-white text-zinc-900'
                    : 'text-white/80 hover:text-white hover:bg-white/80 hover:text-zinc-900'
                }`}
              >
                {item.name}
              </button>
            );
          })}
        </div>

        {/* Right - Wallet, Gold Balance & Profile */}
        <div className="flex items-center gap-2">
          {/* Wallet Status */}
          {walletDisplay ? (
            <div 
              className={`flex items-center gap-1.5 bg-white/15 backdrop-blur-xl rounded-full px-3.5 py-1.5 border border-white/30 transition-all cursor-pointer hover:bg-white/25`}
              onClick={async () => {
                if (walletDisplay.isPrivy) {
                  // Copy address to clipboard for Privy wallets
                  const copied = await copySolanaAddress();
                  if (copied) {
                    setCopiedAddress(true);
                    setTimeout(() => setCopiedAddress(false), 2000);
                  }
                } else if (!walletDisplay.isLinked) {
                  // Open wallet link modal for external wallets
                  setShowWalletModal(true);
                }
              }}
              title={
                walletDisplay.isPrivy 
                  ? copiedAddress ? 'Copied!' : 'Click to copy address' 
                  : walletDisplay.isLinked 
                    ? 'External wallet linked' 
                    : 'Click to link wallet'
              }
            >
              {/* Wallet icon - different color for Privy vs External */}
              {copiedAddress ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-green-400">
                  <path fillRule="evenodd" d="M19.916 4.626a.75.75 0 01.208 1.04l-9 13.5a.75.75 0 01-1.154.114l-6-6a.75.75 0 011.06-1.06l5.353 5.353 8.493-12.739a.75.75 0 011.04-.208z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`w-4 h-4 ${walletDisplay.isPrivy ? 'text-amber-400' : 'text-sky-400'}`}>
                  <path d="M2.00488 8.99979H21.0049C21.5572 8.99979 22.0049 9.4475 22.0049 9.99979V19.9998C22.0049 20.5521 21.5572 20.9998 21.0049 20.9998H3.00488C2.4526 20.9998 2.00488 20.5521 2.00488 19.9998V8.99979ZM3.00488 2.99979H18.0049V6.99979H2.00488V3.99979C2.00488 3.4475 2.4526 2.99979 3.00488 2.99979ZM15.0049 13.9998V15.9998H18.0049V13.9998H15.0049Z"></path>
                </svg>
              )}
              <span className="text-white text-sm font-mono">
                {copiedAddress ? 'Copied!' : `${walletDisplay.address.slice(0, 4)}...${walletDisplay.address.slice(-4)}`}
              </span>
              {/* Privy badge */}
              {walletDisplay.isPrivy && !copiedAddress && (
                <span className="text-[10px] bg-amber-500/30 text-amber-300 px-1.5 py-0.5 rounded-full font-medium">
                  PRIVY
                </span>
              )}
            </div>
          ) : authMethod !== 'privy' && (
            /* Show connect wallet button for non-Privy users without a wallet */
            <button
              onClick={() => setShowWalletModal(true)}
              className="flex items-center gap-1.5 bg-white/15 backdrop-blur-xl rounded-full px-3.5 py-1.5 border border-white/30 cursor-pointer hover:bg-white/25 transition-all text-white/70 hover:text-white"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path d="M2.00488 8.99979H21.0049C21.5572 8.99979 22.0049 9.4475 22.0049 9.99979V19.9998C22.0049 20.5521 21.5572 20.9998 21.0049 20.9998H3.00488C2.4526 20.9998 2.00488 20.5521 2.00488 19.9998V8.99979ZM3.00488 2.99979H18.0049V6.99979H2.00488V3.99979C2.00488 3.4475 2.4526 2.99979 3.00488 2.99979ZM15.0049 13.9998V15.9998H18.0049V13.9998H15.0049Z"></path>
              </svg>
              <span className="text-sm">Connect Wallet</span>
            </button>
          )}

          {/* Gold Balance */}
          <div className="flex items-center gap-1.5 bg-white/15 backdrop-blur-xl rounded-full px-3.5 py-1.5 border border-white/30">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-amber-400">
              <path d="M23.0049 12.0028V14.0028C23.0049 17.3165 18.08 20.0028 12.0049 20.0028C6.03824 20.0028 1.18114 17.4116 1.00957 14.1797L1.00488 14.0028V12.0028C1.00488 15.3165 5.92975 18.0028 12.0049 18.0028C18.08 18.0028 23.0049 15.3165 23.0049 12.0028ZM12.0049 4.00281C18.08 4.00281 23.0049 6.6891 23.0049 10.0028C23.0049 13.3165 18.08 16.0028 12.0049 16.0028C5.92975 16.0028 1.00488 13.3165 1.00488 10.0028C1.00488 6.6891 5.92975 4.00281 12.0049 4.00281Z"></path>
            </svg>
            <span className="font-bold text-white text-sm">{user.gold.toLocaleString()}</span>
          </div>

          {/* User Profile */}
          <div 
            className="flex items-center gap-2 bg-white/15 backdrop-blur-xl rounded-full pl-3 pr-1.5 py-1 border border-white/30 cursor-pointer hover:bg-white/25 transition-all"
            onClick={() => router.push(`/profile/${user.id}`)}
            title="View your profile"
          >
            <span className="text-white text-sm font-medium">@{user.twitterUsername}</span>
            {user.twitterProfilePicture ? (
              <Image
                src={user.twitterProfilePicture}
                alt={user.name}
                width={28}
                height={28}
                className="rounded-full"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white font-bold text-xs">
                {user.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {/* Logout Button */}
          <button
            onClick={() => logout(authMethod === 'privy' ? logoutPrivy : undefined)}
            className="p-2 rounded-full bg-white/15 backdrop-blur-xl border border-white/30 text-white/70 hover:text-white hover:bg-white/25 transition-all cursor-pointer"
            title="Logout"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </nav>
      
      {/* Spacer to push content below fixed navbar */}
      <div className={`h-14 ${transparent ? '' : 'mb-6'}`} />

      {/* Wallet Connect Modal */}
      <WalletConnectModal
        isOpen={showWalletModal}
        onClose={() => setShowWalletModal(false)}
        onSuccess={() => setShowWalletModal(false)}
      />
    </>
  );
}

