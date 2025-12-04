'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
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
  const { user, logout } = useAuth();
  const { publicKey, connected, disconnect } = useWallet();
  const { currentLinkedWallet } = useWalletContext();
  
  const [showWalletModal, setShowWalletModal] = useState(false);

  if (!user) return null;

  return (
    <>
      <nav className={`flex items-center justify-between ${transparent ? '' : 'mb-6'}`}>
        {/* Left - Menu Items */}
        <div className="flex items-center gap-2">
          {navItems.map((item) => {
            const isActive = pathname === item.path;
            return (
              <button
                key={item.name}
                onClick={() => router.push(item.path)}
                className={`px-6 py-2.5 rounded-lg font-bold text-sm transition-all cursor-pointer ${
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

        {/* Right - Gold Balance & Profile */}
        <div className="flex items-center gap-3">
          {/* Gold Balance */}
          <div className="flex items-center gap-2 bg-white/15 backdrop-blur-xl rounded-full px-5 py-2.5 border border-white/30 shadow-lg">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-amber-400">
              <path d="M23.0049 12.0028V14.0028C23.0049 17.3165 18.08 20.0028 12.0049 20.0028C6.03824 20.0028 1.18114 17.4116 1.00957 14.1797L1.00488 14.0028V12.0028C1.00488 15.3165 5.92975 18.0028 12.0049 18.0028C18.08 18.0028 23.0049 15.3165 23.0049 12.0028ZM12.0049 4.00281C18.08 4.00281 23.0049 6.6891 23.0049 10.0028C23.0049 13.3165 18.08 16.0028 12.0049 16.0028C5.92975 16.0028 1.00488 13.3165 1.00488 10.0028C1.00488 6.6891 5.92975 4.00281 12.0049 4.00281Z"></path>
            </svg>
            <span className="font-bold text-white">{user.gold.toLocaleString()} gold</span>
          </div>

          {/* Wallet Status */}
          {connected && publicKey && (
            <div 
              className={`flex items-center gap-2 backdrop-blur-xl rounded-full pl-4 pr-2 py-2 border shadow-lg transition-all ${
                currentLinkedWallet 
                  ? 'bg-green-500/20 border-green-500/40' 
                  : 'bg-amber-500/20 border-amber-500/40'
              }`}
            >
              <div 
                className="flex items-center gap-2 cursor-pointer"
                onClick={() => !currentLinkedWallet && setShowWalletModal(true)}
                title={currentLinkedWallet ? 'Wallet linked' : 'Click to link wallet'}
              >
                <div className={`w-2 h-2 rounded-full ${currentLinkedWallet ? 'bg-green-400' : 'bg-amber-400 animate-pulse'}`} />
                <span className="text-white text-sm font-mono">
                  {publicKey.toBase58().slice(0, 4)}...{publicKey.toBase58().slice(-4)}
                </span>
                {currentLinkedWallet && (
                  <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              {/* Disconnect button */}
              <button
                onClick={disconnect}
                className="p-1.5 rounded-full hover:bg-white/20 transition-all cursor-pointer"
                title="Disconnect wallet"
              >
                <svg className="w-4 h-4 text-white/60 hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* User Profile */}
          <div className="flex items-center gap-3 bg-white/15 backdrop-blur-xl rounded-full pl-4 pr-2 py-1.5 border border-white/30 shadow-lg cursor-pointer hover:bg-white/25 transition-all">
            <span className="text-white font-medium">@{user.twitterUsername}</span>
            {user.twitterProfilePicture ? (
              <Image
                src={user.twitterProfilePicture}
                alt={user.name}
                width={36}
                height={36}
                className="rounded-full"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white font-bold">
                {user.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {/* Logout Button */}
          <button
            onClick={logout}
            className="p-2.5 rounded-full bg-white/15 backdrop-blur-xl border border-white/30 shadow-lg text-white/70 hover:text-white hover:bg-white/25 transition-all cursor-pointer"
            title="Logout"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </nav>

      {/* Wallet Connect Modal */}
      <WalletConnectModal
        isOpen={showWalletModal}
        onClose={() => setShowWalletModal(false)}
        onSuccess={() => setShowWalletModal(false)}
      />
    </>
  );
}

