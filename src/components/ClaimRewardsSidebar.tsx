'use client';

import { useState, useEffect, useCallback } from 'react';
import { useCryptarena } from '@/hooks/useCryptarena';

interface ArenaData {
  arenaId: string;
  winningAsset: number | null;
  winningAssetSymbol: string | null;
  totalPoolSol: number;
  totalPoolUsd: number;
  status?: number; // Arena status
  playerCount?: number; // For refund calculation
}

interface ClaimRewardsSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  arena: ArenaData;
  onClaimSuccess?: () => void;
  isRefund?: boolean; // true for canceled arenas
}

const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL || 'http://localhost:3001';

// Arena status constants
const ArenaStatus = {
  Canceled: 4,
};

export default function ClaimRewardsSidebar({ isOpen, onClose, arena, onClaimSuccess, isRefund = false }: ClaimRewardsSidebarProps) {
  // Use useCryptarena which handles both Privy and external wallets
  const { claimWinnerRewards, claimRefund, isLoading, publicKey, connected } = useCryptarena();
  
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(true);

  // Check if rewards have already been claimed
  const checkClaimStatus = useCallback(async () => {
    if (!publicKey || !arena) return;

    try {
      setCheckingStatus(true);
      const response = await fetch(`${INDEXER_URL}/api/v1/arenas/${arena.arenaId}`);
      if (!response.ok) return;
      
      const arenaData = await response.json();
      
      // Find user's entry
      const userEntry = arenaData.playerEntries?.find(
        (e: { playerWallet: string; isWinner: boolean }) => e.playerWallet === publicKey.toBase58()
      );

      // Check if user is winner and has already claimed
      if (userEntry && userEntry.isWinner) {
        setClaimed(true);
      }
    } catch (err) {
      console.error('Failed to check claim status:', err);
    } finally {
      setCheckingStatus(false);
    }
  }, [publicKey, arena]);

  useEffect(() => {
    if (isOpen && arena) {
      checkClaimStatus();
    }
  }, [isOpen, arena, checkClaimStatus]);

  // Handle claiming SOL reward or refund
  const handleClaim = async () => {
    if (!publicKey || !connected || claiming || claimed) return;

    setClaiming(true);
    setError(null);

    try {
      let result;
      if (isRefund) {
        result = await claimRefund({
          arenaId: parseInt(arena.arenaId),
        });
      } else {
        result = await claimWinnerRewards({
          arenaId: parseInt(arena.arenaId),
        });
      }

      if (result?.success) {
        setClaimed(true);
        onClaimSuccess?.();
        // Auto-close sidebar after 2 seconds so user sees the updated list
        setTimeout(() => {
          onClose();
        }, 2000);
      } else {
        setError(result?.error || 'Claim failed');
      }
    } catch (err) {
      console.error('Claim failed:', err);
      setError(err instanceof Error ? err.message : 'Claim failed');
    } finally {
      setClaiming(false);
    }
  };

  // Calculate amounts
  // Single-player arenas: winner gets 100%, multi-player: 90%
  const isSinglePlayer = arena.playerCount === 1;
  const winnerShare = isSinglePlayer ? 1.0 : 0.9;
  const winnerReward = (arena.totalPoolSol || 0) * winnerShare;
  // Refund amount is the entry fee (total pool / player count)
  const refundAmount = arena.playerCount && arena.playerCount > 0 
    ? (arena.totalPoolSol || 0) / arena.playerCount 
    : 0;

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
        onClick={onClose}
      />
      
      {/* Sidebar */}
      <div className="fixed right-0 top-0 h-full w-[480px] bg-[#1a1d24] border-l border-white/10 z-50 flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-bold text-white">{isRefund ? 'Claim Refund' : 'Claim Rewards'}</h2>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
            >
              <svg className="w-5 h-5 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-white/50 text-sm">Arena #{arena.arenaId}</p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {checkingStatus ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                <p className="text-white/50 text-sm">Checking claim status...</p>
              </div>
            </div>
          ) : claimed ? (
            <div className="text-center py-12">
              <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${isRefund ? 'bg-zinc-500/20' : 'bg-green-500/20'}`}>
                <svg className={`w-8 h-8 ${isRefund ? 'text-zinc-400' : 'text-green-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className={`font-bold text-xl mb-2 ${isRefund ? 'text-zinc-300' : 'text-green-400'}`}>{isRefund ? 'Refund Claimed!' : 'Rewards Claimed!'}</p>
              <p className="text-white/50 text-sm">Your SOL has been transferred to your wallet</p>
            </div>
          ) : isRefund ? (
            /* Refund UI for canceled arenas */
            <div className="space-y-6">
              {/* Canceled Arena Info */}
              <div className="bg-zinc-500/10 rounded-2xl border border-zinc-500/30 p-6 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-zinc-500/20 flex items-center justify-center">
                  <svg className="w-8 h-8 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                </div>
                <p className="text-zinc-400/70 text-xs uppercase tracking-wider mb-2">Arena Canceled</p>
                <p className="text-2xl font-bold text-zinc-300 mb-1">Tie Scenario</p>
                <p className="text-white/40 text-sm">Two tokens had the same volatility</p>
              </div>

              {/* Refund Amount */}
              <div className="bg-white/5 rounded-2xl border border-white/10 p-6">
                <p className="text-white/40 text-xs uppercase tracking-wider mb-3">Your Refund (Entry Fee)</p>
                
                <div className="flex items-end justify-between mb-4">
                  <div>
                    <p className="text-4xl font-bold bg-gradient-to-r from-zinc-300 to-zinc-400 bg-clip-text text-transparent">
                      {refundAmount.toFixed(4)}
                    </p>
                    <p className="text-white/50 text-lg">SOL</p>
                  </div>
                </div>

                {/* Info note */}
                <div className="bg-white/5 rounded-xl p-4">
                  <p className="text-white/40 text-sm">
                    Since this arena was canceled due to a tie, all participants can reclaim their entry fee in full.
                  </p>
                </div>
              </div>

              {/* Info */}
              <div className="bg-zinc-500/10 rounded-xl p-4 border border-zinc-500/20">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-zinc-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="text-zinc-400 text-sm font-medium mb-1">Why was this arena canceled?</p>
                    <p className="text-white/50 text-xs">
                      When two tokens end with exactly the same volatility, there is no clear winner. 
                      In this case, the arena is canceled and all participants can claim their entry fee back.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Winning Token Info */}
              <div className="bg-amber-500/10 rounded-2xl border border-amber-500/30 p-6 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-500/20 flex items-center justify-center">
                  <span className="text-3xl">🏆</span>
                </div>
                <p className="text-amber-400/70 text-xs uppercase tracking-wider mb-2">Winning Champion</p>
                <p className="text-3xl font-bold text-amber-400 mb-1">{arena.winningAssetSymbol || '?'}</p>
                <p className="text-white/40 text-sm">Congratulations on your victory!</p>
              </div>

              {/* Reward Amount */}
              <div className="bg-white/5 rounded-2xl border border-white/10 p-6">
                <p className="text-white/40 text-xs uppercase tracking-wider mb-3">
                  Your Reward ({isSinglePlayer ? '100%' : '90%'} of Pool)
                </p>
                
                <div className="flex items-end justify-between mb-4">
                  <div>
                    <p className="text-4xl font-bold bg-gradient-to-r from-amber-400 to-yellow-300 bg-clip-text text-transparent">
                      {winnerReward.toFixed(4)}
                    </p>
                    <p className="text-white/50 text-lg">SOL</p>
                  </div>
                  <div className="text-right">
                    <p className="text-white/40 text-sm">≈ ${((arena.totalPoolUsd || 0) * winnerShare).toFixed(2)} USD</p>
                  </div>
                </div>

                {/* Pool breakdown */}
                <div className="bg-white/5 rounded-xl p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-white/40">Total Pool</span>
                    <span className="text-white">{(arena.totalPoolSol || 0).toFixed(4)} SOL</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/40">Winner Share ({isSinglePlayer ? '100%' : '90%'})</span>
                    <span className="text-amber-400">{winnerReward.toFixed(4)} SOL</span>
                  </div>
                  {!isSinglePlayer && (
                    <div className="flex justify-between text-sm">
                      <span className="text-white/40">Treasury (10%)</span>
                      <span className="text-white/60">{((arena.totalPoolSol || 0) * 0.1).toFixed(4)} SOL</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Info */}
              <div className="bg-sky-500/10 rounded-xl p-4 border border-sky-500/20">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-sky-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="text-sky-400 text-sm font-medium mb-1">How it works</p>
                    <p className="text-white/50 text-xs">
                      {isSinglePlayer 
                        ? "Since you were the only player in this arena, you receive 100% of the total SOL pool. Click the button below to claim your reward."
                        : "As the winner, you receive 90% of the total SOL pool. The remaining 10% goes to the treasury. Click the button below to claim your reward."
                      }
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!checkingStatus && !claimed && (
          <div className="p-6 border-t border-white/10">
            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}
            
            <button
              onClick={handleClaim}
              disabled={isLoading || claiming}
              className={`w-full py-4 font-bold text-lg rounded-xl transition-all disabled:opacity-50 cursor-pointer hover:scale-[1.02] ${
                isRefund 
                  ? 'bg-gradient-to-r from-zinc-400 to-zinc-500 hover:from-zinc-300 hover:to-zinc-400 text-gray-900 shadow-lg shadow-zinc-500/20'
                  : 'bg-gradient-to-r from-amber-400 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-gray-900 shadow-lg shadow-amber-500/20'
              }`}
            >
              {isLoading || claiming ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  {isRefund ? 'Claiming Refund...' : 'Claiming...'}
                </span>
              ) : isRefund ? (
                `Claim Refund ${refundAmount.toFixed(4)} SOL`
              ) : (
                `Claim ${winnerReward.toFixed(4)} SOL`
              )}
            </button>
            
            <p className="text-center text-white/30 text-xs mt-3">
              This will transfer SOL directly to your wallet
            </p>
          </div>
        )}

        {claimed && (
          <div className="p-6 border-t border-white/10">
            <button
              onClick={onClose}
              className="w-full py-3 bg-white/10 hover:bg-white/20 text-white font-medium rounded-xl transition-all cursor-pointer"
            >
              Close
            </button>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes slide-in-right {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        .animate-slide-in-right {
          animation: slide-in-right 0.3s ease-out;
        }
      `}</style>
    </>
  );
}
