'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useWallet, useWalletContext } from '@/context/WalletContext';
import { api } from '@/lib/api';
import ProtectedRoute from '@/components/ProtectedRoute';
import WalletConnectModal from '@/components/WalletConnectModal';
import Navbar from '@/components/Navbar';
import Image from 'next/image';
import localFont from 'next/font/local';

const aceOfSwords = localFont({
  src: '../fonts/AceOfSwords-R9x9W.otf',
  variable: '--font-ace-of-swords',
});

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080';

// Quest type from backend
interface QuestProgress {
  progressId: string;
  questId: string;
  code: string;
  title: string;
  description: string;
  questType: 'ONE_TIME' | 'WEEKLY';
  goldReward: number;
  currentAmount: number;
  requiredAmount: number;
  isCompleted: boolean;
  rewardClaimed: boolean;
  progressPercent: number;
}


function HomePage() {
  const router = useRouter();
  const { user, logout, isAuthenticated } = useAuth();
  const { publicKey, connected } = useWallet();
  const { currentLinkedWallet, checkAndLinkWallet, isLinking } = useWalletContext();
  
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [isReadyingUp, setIsReadyingUp] = useState(false);
  const [quests, setQuests] = useState<QuestProgress[]>([]);
  const [isLoadingQuests, setIsLoadingQuests] = useState(false);

  // Fetch quests from backend
  const fetchQuests = useCallback(async () => {
    const token = api.getAccessToken();
    if (!token) {
      console.log('No token, skipping quest fetch');
      return;
    }
    
    try {
      setIsLoadingQuests(true);
      const response = await fetch(`${BACKEND_URL}/api/quests/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('Quests fetched:', data);
        setQuests(data);
      } else {
        console.error('Failed to fetch quests:', response.status, await response.text());
      }
    } catch (error) {
      console.error('Failed to fetch quests:', error);
    } finally {
      setIsLoadingQuests(false);
    }
  }, []);

  // Fetch quests when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchQuests();
    }
  }, [isAuthenticated, fetchQuests]);

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
              {isLoadingQuests ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
                </div>
              ) : quests.length === 0 ? (
                <div className="text-center py-8 text-white/50">
                  <p>No quests available</p>
                </div>
              ) : (
                quests.map((quest) => (
                  <div
                    key={quest.questId}
                    className={`backdrop-blur-sm rounded-xl p-4 transition-all ${
                      quest.isCompleted 
                        ? 'bg-green-500/20 border border-green-500/30' 
                        : 'bg-zinc-700/60'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-white text-sm">{quest.title}</p>
                          {quest.questType === 'WEEKLY' && (
                            <span className="px-1.5 py-0.5 bg-sky-500/20 text-sky-400 text-[10px] font-bold rounded">
                              WEEKLY
                            </span>
                          )}
                          {quest.isCompleted && (
                            <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                        {quest.description && (
                          <p className="text-white/50 text-xs mt-0.5">{quest.description}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-amber-400 text-xs font-bold">REWARD</p>
                        <div className="flex items-center gap-1 justify-end">
                          <span className="font-bold text-white">{quest.goldReward}</span>
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
                          className={`h-full rounded-full transition-all ${
                            quest.isCompleted ? 'bg-green-400' : 'bg-amber-400'
                          }`}
                          style={{ width: `${quest.progressPercent}%` }}
                        />
                      </div>
                      <span className="text-white/60 text-xs font-medium">
                        {quest.currentAmount}/{quest.requiredAmount}
                      </span>
                    </div>
                  </div>
                ))
              )}
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
                {/* Animated border gradient - always visible */}
                <span className="absolute inset-0 rounded-2xl">
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
