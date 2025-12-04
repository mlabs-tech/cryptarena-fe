'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useWallet, useWalletContext } from '@/context/WalletContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import WalletConnectModal from '@/components/WalletConnectModal';
import Navbar from '@/components/Navbar';
import Image from 'next/image';
import localFont from 'next/font/local';

const aceOfSwords = localFont({
  src: '../fonts/AceOfSwords-R9x9W.otf',
  variable: '--font-ace-of-swords',
});

// Mock quest data
const mockQuests = [
  { id: 1, title: 'Connect X Account', reward: 50, current: 0, total: 1 },
  { id: 2, title: 'Enter 3 different arenas', reward: 30, current: 2, total: 3 },
  { id: 3, title: 'Win one arena match', reward: 100, current: 0, total: 1 },
  { id: 4, title: 'Invite a friend:', subtitle: 'Your Code: A-45162', reward: 20, current: 0, total: 1, hasCode: true },
];


function HomePage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { publicKey, connected } = useWallet();
  const { currentLinkedWallet, checkAndLinkWallet, isLinking } = useWalletContext();
  
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [isReadyingUp, setIsReadyingUp] = useState(false);

  // Handle Ready Up button click
  const handleReadyUp = async () => {
    setIsReadyingUp(true);
    
    // Check if wallet is connected
    if (!connected || !publicKey) {
      setShowWalletModal(true);
      setIsReadyingUp(false);
      return;
    }
    
    // Check if connected wallet is linked to this account
    if (!currentLinkedWallet) {
      // Try to link the wallet
      const result = await checkAndLinkWallet();
      if (!result.success) {
        // Show modal with error or to connect different wallet
        setShowWalletModal(true);
        setIsReadyingUp(false);
        return;
      }
    }
    
    // Wallet is connected and linked, proceed to queue page
    router.push('/queue');
    setIsReadyingUp(false);
  };

  const handleWalletSuccess = () => {
    // Wallet successfully connected and linked
    // Don't auto-navigate - user needs to click Ready Up again
    setShowWalletModal(false);
  };

  if (!user) return null;

  return (
    <div className="fixed inset-0 overflow-hidden">
      {/* Background Image */}
      <Image
        // src="https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/62da8283-758c-451a-e500-576a8d93ca00/public"
        // src="https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/62da8283-758c-451a-e500-576a8d93ca00/public"
        // src="https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/24bb63bf-f4af-4b59-5b87-fbc51efbe500/public"
        src="https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/7cad699c-265b-463d-1175-23d86aa9d200/public"
        // src="https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/26242d6d-81ad-4555-d47e-99273e3f3100/public"
        // src="https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/6eb59bf4-f5a2-4c8f-0a84-f1d11ac97f00/public"
        alt="CryptArena Background"
        fill
        priority
        className="object-cover object-center"
        quality={100}
      />
      
      {/* Dark overlay on background */}
      <div className="absolute inset-0 bg-black/10 z-[1]" />
      
      {/* Top gradient overlay for navbar visibility */}
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/70 via-black/40 to-transparent z-[5]" />

      {/* Content Overlay */}
      <div className="relative z-10 flex flex-col h-full p-6">
        {/* Top Navbar */}
        <Navbar transparent />

        {/* Main Content */}
        <div className="flex-1 flex justify-between">
          {/* Left Panel - Logo & Quests (Single Box) */}
          <div className="w-96 bg-white/20 backdrop-blur-md rounded-2xl border border-white/30 p-6 flex flex-col animate-slide-in-left">
            {/* Logo */}
            <div className="relative w-full h-24 mb-4">
              <Image
                src="https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/96807945-a58d-48f2-bb50-efd65c3aa100/public"
                alt="CryptArena Logo"
                fill
                className="object-contain"
              />
            </div>

            {/* Quests Header */}
            <div className={`bg-white/30 backdrop-blur-sm rounded-xl py-3 px-6 mb-4 ${aceOfSwords.variable}`}>
              <h2 className="text-3xl text-gray-700 text-center tracking-wide" style={{ fontFamily: 'var(--font-ace-of-swords)' }}>QUESTS</h2>
            </div>

            {/* Quest Items */}
            <div className="flex-1 space-y-3 overflow-y-auto">
              {mockQuests.map((quest) => (
                <div
                  key={quest.id}
                  className="bg-zinc-700/60 backdrop-blur-sm rounded-xl p-4"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-bold text-white text-sm">{quest.title}</p>
                      {quest.hasCode && quest.subtitle && (
                        <p className="text-white/70 text-xs flex items-center gap-1">
                          {quest.subtitle}
                          <button className="text-amber-400 hover:text-amber-300">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-amber-400 text-xs font-bold">REWARD</p>
                      <div className="flex items-center gap-1 justify-end">
                        <span className="font-bold text-white">{quest.reward}</span>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-amber-400">
                          <path d="M23.0049 12.0028V14.0028C23.0049 17.3165 18.08 20.0028 12.0049 20.0028C6.03824 20.0028 1.18114 17.4116 1.00957 14.1797L1.00488 14.0028V12.0028C1.00488 15.3165 5.92975 18.0028 12.0049 18.0028C18.08 18.0028 23.0049 15.3165 23.0049 12.0028ZM12.0049 4.00281C18.08 4.00281 23.0049 6.6891 23.0049 10.0028C23.0049 13.3165 18.08 16.0028 12.0049 16.0028C5.92975 16.0028 1.00488 13.3165 1.00488 10.0028C1.00488 6.6891 5.92975 4.00281 12.0049 4.00281Z"></path>
                        </svg>
                      </div>
                    </div>
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-zinc-900/50 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-amber-400 rounded-full transition-all"
                        style={{ width: `${(quest.current / quest.total) * 100}%` }}
                      />
                    </div>
                    <span className="text-white/60 text-xs font-medium">{quest.current}/{quest.total}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Resets Weekly */}
            <p className="text-center text-gray-900 text-sm mt-4">Resets weekly</p>
          </div>

          {/* Right Side - Empty space for arena view */}
          <div className="flex-1" />

          {/* Bottom Right - Game Mode & Ready Button */}
          <div className="absolute bottom-8 right-8 bg-white/20 backdrop-blur-md rounded-3xl border border-white/30 p-6 w-96 animate-slide-in-right">
            <div className="flex flex-col items-stretch gap-4">
              {/* Arena Info Box */}
              <div className={`bg-zinc-600/80 backdrop-blur-sm rounded-2xl px-10 py-6 text-center ${aceOfSwords.variable}`}>
                <p className="text-white font-bold text-2xl">Arena 10 players</p>
                <p className="text-amber-400 text-4xl tracking-wide" style={{ fontFamily: 'var(--font-ace-of-swords)' }}>SOLOS</p>
              </div>

              {/* Ready Up Button */}
              <button 
                onClick={handleReadyUp}
                disabled={isReadyingUp || isLinking}
                className="group relative bg-amber-400 hover:bg-amber-300 text-gray-800 font-black text-3xl py-6 rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-amber-400/20 cursor-pointer tracking-wide overflow-hidden disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                {/* Animated border gradient */}
                <span className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <span className="absolute inset-[-4px] rounded-2xl bg-[conic-gradient(from_0deg,#ffffff,#e5e5e5,#ffffff,#f5f5f5,#ffffff,#e5e5e5,#ffffff)] animate-[spin_4s_linear_infinite]" />
                  <span className="absolute inset-[3px] rounded-xl bg-amber-400 group-hover:bg-amber-300 transition-colors" />
                </span>
                <span className="relative z-10 flex items-center justify-center gap-3">
                  {(isReadyingUp || isLinking) && (
                    <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  )}
                  {isReadyingUp || isLinking ? 'PREPARING...' : 'READY UP'}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Wallet Connect Modal */}
      <WalletConnectModal
        isOpen={showWalletModal}
        onClose={() => setShowWalletModal(false)}
        onSuccess={handleWalletSuccess}
      />
    </div>
  );
}

export default function Home() {
  return (
    <ProtectedRoute>
      <HomePage />
    </ProtectedRoute>
  );
}
