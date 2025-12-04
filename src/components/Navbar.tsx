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
          {/* Wallet Status - Now on the left */}
          {connected && publicKey && (
            <div 
              className="flex items-center gap-1.5 bg-white/15 backdrop-blur-xl rounded-full px-3.5 py-1.5 border border-white/30 cursor-pointer hover:bg-white/25 transition-all"
              onClick={() => !currentLinkedWallet && setShowWalletModal(true)}
              title={currentLinkedWallet ? 'Wallet linked' : 'Click to link wallet'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-sky-400">
                <path d="M2.00488 8.99979H21.0049C21.5572 8.99979 22.0049 9.4475 22.0049 9.99979V19.9998C22.0049 20.5521 21.5572 20.9998 21.0049 20.9998H3.00488C2.4526 20.9998 2.00488 20.5521 2.00488 19.9998V8.99979ZM3.00488 2.99979H18.0049V6.99979H2.00488V3.99979C2.00488 3.4475 2.4526 2.99979 3.00488 2.99979ZM15.0049 13.9998V15.9998H18.0049V13.9998H15.0049Z"></path>
              </svg>
              <span className="text-white text-sm font-mono">
                {publicKey.toBase58().slice(0, 4)}...{publicKey.toBase58().slice(-4)}
              </span>
            </div>
          )}

          {/* Gold Balance */}
          <div className="flex items-center gap-1.5 bg-white/15 backdrop-blur-xl rounded-full px-3.5 py-1.5 border border-white/30">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-amber-400">
              <path d="M23.0049 12.0028V14.0028C23.0049 17.3165 18.08 20.0028 12.0049 20.0028C6.03824 20.0028 1.18114 17.4116 1.00957 14.1797L1.00488 14.0028V12.0028C1.00488 15.3165 5.92975 18.0028 12.0049 18.0028C18.08 18.0028 23.0049 15.3165 23.0049 12.0028ZM12.0049 4.00281C18.08 4.00281 23.0049 6.6891 23.0049 10.0028C23.0049 13.3165 18.08 16.0028 12.0049 16.0028C5.92975 16.0028 1.00488 13.3165 1.00488 10.0028C1.00488 6.6891 5.92975 4.00281 12.0049 4.00281Z"></path>
            </svg>
            <span className="font-bold text-white text-sm">{user.gold.toLocaleString()}</span>
          </div>

          {/* User Profile */}
          <div className="flex items-center gap-2 bg-white/15 backdrop-blur-xl rounded-full pl-3 pr-1.5 py-1 border border-white/30 cursor-pointer hover:bg-white/25 transition-all">
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
            onClick={logout}
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

