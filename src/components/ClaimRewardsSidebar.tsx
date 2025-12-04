'use client';

import { useState, useEffect, useCallback } from 'react';
import { useCryptarena } from '@/hooks/useCryptarena';
import { useWallet } from '@solana/wallet-adapter-react';
import { indexerApi, LatestPriceData } from '@/lib/indexer-api';

interface PlayerEntry {
  playerWallet: string;
  playerIndex: number;
  assetIndex: number;
  assetSymbol: string;
  tokenAmount: number;
  usdValue: number;
  isWinner: boolean;
  ownTokensClaimed?: boolean;
  rewardsClaimedCount?: number;
  rewardsClaimedBitmap?: string; // u128 as string
}

interface ArenaData {
  arenaId: string;
  winningAsset: number | null;
  winningAssetSymbol: string | null;
  playerEntries: PlayerEntry[];
  totalPoolUsd: number;
}

interface ClaimRewardsSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  arena: ArenaData;
  onClaimSuccess?: () => void;
}

interface ClaimableReward {
  type: 'own' | 'loser';
  tokenSymbol: string;
  assetIndex: number;
  amount: number;
  entryUsdValue: number; // Original USD value at entry time
  currentUsdValue: number; // Current USD value based on latest price
  hasLivePrice: boolean; // Whether we have a live price or using fallback
  loserWallet?: string;
  loserIndex?: number;
  claimed: boolean;
}

const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL || 'http://localhost:3001';

// CoinMarketCap token IDs mapping
const TOKEN_CMC_IDS: Record<number, number> = {
  0: 5426,   // SOL Solana
  1: 35336,  // TRUMP OfficialTrump
  2: 36507,  // PUMP Pump.fun
  3: 23095,  // BONK Bonk
  4: 29210,  // JUP Jupyter
  5: 34466,  // PENGU PudgyPenguins
  6: 28177,  // PYTH PythNetwork
  7: 5665,   // HNT Helium
  8: 33597,  // FARTCOIN
  9: 8526,   // RAY Raydum
  10: 28541, // JTO Jito
  11: 30986, // KMNO Kamino Finance
  12: 38353, // MET Meteora
  13: 29587, // W Wormhole
};

// Fetch prices from CoinMarketCap for missing assets
async function fetchCMCPrices(assetIndices: number[]): Promise<Map<number, number>> {
  const priceMap = new Map<number, number>();
  
  if (assetIndices.length === 0) return priceMap;
  
  const cmcIds = assetIndices
    .map(idx => TOKEN_CMC_IDS[idx])
    .filter(id => id !== undefined);
  
  if (cmcIds.length === 0) return priceMap;
  
  try {
    // Use a proxy or server-side route to avoid CORS issues
    // For now, we'll call our own API route that proxies to CMC
    const response = await fetch(`/api/cmc-prices?ids=${cmcIds.join(',')}`);
    
    if (!response.ok) {
      console.warn('CMC API fallback failed:', response.status);
      return priceMap;
    }
    
    const data = await response.json();
    
    // Map CMC IDs back to asset indices
    for (const [indexStr, cmcId] of Object.entries(TOKEN_CMC_IDS)) {
      const assetIndex = parseInt(indexStr);
      if (assetIndices.includes(assetIndex) && data.prices?.[cmcId]) {
        priceMap.set(assetIndex, data.prices[cmcId]);
      }
    }
  } catch (error) {
    console.error('CMC price fetch error:', error);
  }
  
  return priceMap;
}

export default function ClaimRewardsSidebar({ isOpen, onClose, arena, onClaimSuccess }: ClaimRewardsSidebarProps) {
  const { publicKey } = useWallet();
  const { claimOwnTokens, claimLoserTokens, isLoading, getTokenSymbol } = useCryptarena();
  
  const [claimableRewards, setClaimableRewards] = useState<ClaimableReward[]>([]);
  const [claimingIndex, setClaimingIndex] = useState<number | null>(null);
  const [claimedIndices, setClaimedIndices] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [latestPrices, setLatestPrices] = useState<Map<number, number>>(new Map());
  const [pricesLoaded, setPricesLoaded] = useState(false);

  // Fetch latest prices from indexer, with CMC fallback for missing prices
  const fetchLatestPrices = useCallback(async (requiredAssets?: number[]) => {
    try {
      // First, get prices from the indexer
      const response = await indexerApi.getLatestPrices();
      const priceMap = new Map<number, number>();
      response.data.forEach((p: LatestPriceData) => {
        if (p.price > 0) {
          priceMap.set(p.assetIndex, p.price);
        }
      });
      
      // Check for missing prices from required assets
      const missingAssets = requiredAssets?.filter(idx => !priceMap.has(idx) || priceMap.get(idx) === 0) || [];
      
      // If there are missing prices, fetch from CoinMarketCap as fallback
      if (missingAssets.length > 0) {
        console.log('Fetching missing prices from CMC for assets:', missingAssets);
        const cmcPrices = await fetchCMCPrices(missingAssets);
        
        // Merge CMC prices into the map
        cmcPrices.forEach((price, assetIndex) => {
          if (price > 0) {
            priceMap.set(assetIndex, price);
            console.log(`CMC price for asset ${assetIndex}: $${price}`);
          }
        });
      }
      
      setLatestPrices(priceMap);
      setPricesLoaded(true);
      return priceMap;
    } catch (err) {
      console.error('Failed to fetch latest prices:', err);
      setPricesLoaded(true);
      return new Map<number, number>();
    }
  }, []);

  // Fetch detailed arena data with claim status
  const fetchClaimStatus = useCallback(async () => {
    if (!publicKey || !arena) return;

    try {
      // First fetch fresh arena data to know which assets we need prices for
      const arenaResponse = await fetch(`${INDEXER_URL}/api/v1/arenas/${arena.arenaId}`);
      if (!arenaResponse.ok) throw new Error('Failed to fetch arena');
      
      const freshArena = await arenaResponse.json();
      
      // Get all unique asset indices from player entries
      const requiredAssets = [...new Set(
        freshArena.playerEntries?.map((e: PlayerEntry) => e.assetIndex) || []
      )] as number[];
      
      // Fetch prices with CMC fallback for missing assets
      const priceMap = await fetchLatestPrices(requiredAssets);
      
      // Find user's entry
      const userEntry = freshArena.playerEntries?.find(
        (e: PlayerEntry) => e.playerWallet === publicKey.toBase58()
      );

      if (!userEntry || arena.winningAsset === null) {
        setClaimableRewards([]);
        return;
      }

      // Check if user is a winner
      if (userEntry.assetIndex !== arena.winningAsset) {
        setClaimableRewards([]);
        return;
      }

      const rewards: ClaimableReward[] = [];

      // Helper to calculate current USD value
      // Falls back to entry price if no live price is available
      const getCurrentUsdValue = (assetIndex: number, tokenAmount: number, entryUsdValue: number): { value: number; hasLivePrice: boolean } => {
        const price = priceMap.get(assetIndex);
        if (price && price > 0) {
          return { value: tokenAmount * price, hasLivePrice: true };
        }
        // If no price available, fall back to entry USD value
        console.warn(`No live price for asset ${assetIndex}, using entry value`);
        return { value: entryUsdValue, hasLivePrice: false };
      };

      // 1. Own tokens (the winner's original entry)
      const ownCurrentResult = getCurrentUsdValue(userEntry.assetIndex, userEntry.tokenAmount, userEntry.usdValue);
      rewards.push({
        type: 'own',
        tokenSymbol: userEntry.assetSymbol,
        assetIndex: userEntry.assetIndex,
        amount: userEntry.tokenAmount,
        entryUsdValue: userEntry.usdValue,
        currentUsdValue: ownCurrentResult.value,
        hasLivePrice: ownCurrentResult.hasLivePrice,
        claimed: userEntry.ownTokensClaimed || false,
      });

      // 2. Loser tokens (each loser in the arena)
      const losers = freshArena.playerEntries?.filter(
        (e: PlayerEntry) => e.assetIndex !== arena.winningAsset
      ) || [];

      // Count winners for this arena to split rewards
      const winnerCount = freshArena.playerEntries?.filter(
        (e: PlayerEntry) => e.assetIndex === arena.winningAsset
      ).length || 1;

      // Parse the bitmap from the indexer (stored as string)
      const rewardsClaimedBitmap = BigInt(userEntry.rewardsClaimedBitmap || '0');

      for (const loser of losers) {
        // Check if already claimed using the actual bitmap from indexer
        const loserBit = BigInt(1) << BigInt(loser.playerIndex);
        const alreadyClaimed = (rewardsClaimedBitmap & loserBit) !== BigInt(0);

        // Calculate share: loser's amount / winner_count, then 90% to winner
        const sharePerWinner = loser.tokenAmount / winnerCount;
        const winnerShare = sharePerWinner * 0.9; // 10% goes to treasury
        const loserEntryValue = (loser.usdValue / winnerCount) * 0.9;
        
        // Calculate current USD value for this loser's tokens (with fallback to entry value)
        const loserCurrentResult = getCurrentUsdValue(loser.assetIndex, winnerShare, loserEntryValue);

        rewards.push({
          type: 'loser',
          tokenSymbol: loser.assetSymbol,
          assetIndex: loser.assetIndex,
          amount: winnerShare,
          entryUsdValue: loserEntryValue,
          currentUsdValue: loserCurrentResult.value,
          hasLivePrice: loserCurrentResult.hasLivePrice,
          loserWallet: loser.playerWallet,
          loserIndex: loser.playerIndex,
          claimed: alreadyClaimed,
        });
      }

      setClaimableRewards(rewards);
    } catch (err) {
      console.error('Failed to fetch claim status:', err);
    }
  }, [publicKey, arena, claimedIndices, fetchLatestPrices]);

  useEffect(() => {
    if (isOpen && arena) {
      fetchClaimStatus();
    }
  }, [isOpen, arena, fetchClaimStatus]);

  // Handle claiming a reward
  const handleClaim = async (reward: ClaimableReward, index: number) => {
    if (!publicKey || reward.claimed || claimingIndex !== null) return;

    setClaimingIndex(index);
    setError(null);

    try {
      let result;

      if (reward.type === 'own') {
        result = await claimOwnTokens({
          arenaId: parseInt(arena.arenaId),
          tokenSymbol: reward.tokenSymbol,
        });
      } else if (reward.loserWallet && arena.winningAsset !== null) {
        result = await claimLoserTokens({
          arenaId: parseInt(arena.arenaId),
          loserWallet: reward.loserWallet,
          loserTokenSymbol: reward.tokenSymbol,
          winningAssetIndex: arena.winningAsset,
        });
      }

      if (result?.success) {
        // Mark as claimed locally immediately for UI feedback
        setClaimableRewards(prev => 
          prev.map((r, i) => i === index ? { ...r, claimed: true } : r)
        );
        
        // Also track in claimedIndices for loser claims
        if (reward.type === 'loser' && reward.loserIndex !== undefined) {
          setClaimedIndices(prev => new Set([...prev, reward.loserIndex!]));
        }
        
        onClaimSuccess?.();
        
        // Re-fetch claim status after a short delay to sync with indexer
        setTimeout(() => {
          fetchClaimStatus();
        }, 3000);
      } else {
        setError(result?.error || 'Claim failed');
      }
    } catch (err) {
      console.error('Claim failed:', err);
      setError(err instanceof Error ? err.message : 'Claim failed');
    } finally {
      setClaimingIndex(null);
    }
  };

  // Claim all unclaimed rewards sequentially
  const handleClaimAll = async () => {
    const unclaimed = claimableRewards.filter(r => !r.claimed);
    
    for (let i = 0; i < claimableRewards.length; i++) {
      const reward = claimableRewards[i];
      if (!reward.claimed) {
        await handleClaim(reward, i);
        // Small delay between transactions
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  };

  const totalUnclaimedCurrent = claimableRewards
    .filter(r => !r.claimed)
    .reduce((sum, r) => sum + r.currentUsdValue, 0);

  const totalUnclaimedEntry = claimableRewards
    .filter(r => !r.claimed)
    .reduce((sum, r) => sum + r.entryUsdValue, 0);

  const allClaimed = claimableRewards.length > 0 && claimableRewards.every(r => r.claimed);
  
  const hasMissingPrices = claimableRewards.some(r => !r.hasLivePrice);

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
            <h2 className="text-xl font-bold text-white">Claim Rewards</h2>
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
          
          {/* Total unclaimed */}
          {totalUnclaimedCurrent > 0 && (
            <div className="mt-4 p-4 bg-amber-500/10 rounded-xl border border-amber-500/30">
              <p className="text-amber-400/70 text-xs uppercase tracking-wider mb-1">Total Unclaimed (Current Value)</p>
              <p className="text-2xl font-bold text-amber-400">${totalUnclaimedCurrent.toFixed(2)}</p>
              {totalUnclaimedEntry !== totalUnclaimedCurrent && (
                <p className="text-white/40 text-xs mt-1">
                  Entry value: ${totalUnclaimedEntry.toFixed(2)}
                  <span className={`ml-2 ${totalUnclaimedCurrent > totalUnclaimedEntry ? 'text-green-400' : 'text-red-400'}`}>
                    ({totalUnclaimedCurrent > totalUnclaimedEntry ? '+' : ''}{((totalUnclaimedCurrent - totalUnclaimedEntry) / totalUnclaimedEntry * 100).toFixed(1)}%)
                  </span>
                </p>
              )}
            </div>
          )}
        </div>

        {/* Rewards List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {claimableRewards.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
                <svg className="w-8 h-8 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-white/50">No rewards to claim</p>
              <p className="text-white/30 text-sm mt-1">You may not be a winner or already claimed</p>
            </div>
          ) : (
            <>
              {/* Own tokens section */}
              {claimableRewards.filter(r => r.type === 'own').map((reward, idx) => {
                const priceChange = reward.entryUsdValue > 0 
                  ? ((reward.currentUsdValue - reward.entryUsdValue) / reward.entryUsdValue * 100)
                  : 0;
                return (
                  <div
                    key={`own-${idx}`}
                    className={`p-4 rounded-xl border transition-all ${
                      reward.claimed
                        ? 'bg-white/5 border-white/10 opacity-60'
                        : 'bg-sky-500/10 border-sky-500/30'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          reward.claimed ? 'bg-white/10' : 'bg-sky-500/20'
                        }`}>
                          <span className="text-lg">🎯</span>
                        </div>
                        <div>
                          <p className="text-white font-medium">Your Entry</p>
                          <p className="text-white/50 text-sm">
                            {reward.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })} {reward.tokenSymbol}
                          </p>
                        </div>
                      </div>
                      
                      <div className="text-right">
                        <p className="text-white font-bold">${reward.currentUsdValue.toFixed(2)}</p>
                        {!reward.hasLivePrice && (
                          <p className="text-amber-400/70 text-xs">⚠ Entry price (no live data)</p>
                        )}
                        {reward.hasLivePrice && reward.currentUsdValue !== reward.entryUsdValue && (
                          <p className="text-white/40 text-xs">
                            Entry: ${reward.entryUsdValue.toFixed(2)}
                            <span className={`ml-1 ${priceChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              ({priceChange >= 0 ? '+' : ''}{priceChange.toFixed(1)}%)
                            </span>
                          </p>
                        )}
                        {reward.claimed ? (
                          <span className="text-xs text-green-400">✓ Claimed</span>
                        ) : (
                          <button
                            onClick={() => handleClaim(reward, 0)}
                            disabled={claimingIndex !== null}
                            className="mt-1 px-3 py-1 bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            {claimingIndex === 0 ? 'Claiming...' : 'Claim'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Divider */}
              {claimableRewards.some(r => r.type === 'loser') && (
                <div className="flex items-center gap-3 py-2">
                  <div className="flex-1 h-px bg-white/10" />
                  <span className="text-white/30 text-xs uppercase tracking-wider">Loser Rewards</span>
                  <div className="flex-1 h-px bg-white/10" />
                </div>
              )}

              {/* Loser tokens */}
              {claimableRewards.filter(r => r.type === 'loser').map((reward, idx) => {
                const actualIndex = claimableRewards.findIndex(r => r === reward);
                const priceChange = reward.entryUsdValue > 0 
                  ? ((reward.currentUsdValue - reward.entryUsdValue) / reward.entryUsdValue * 100)
                  : 0;
                return (
                  <div
                    key={`loser-${idx}`}
                    className={`p-4 rounded-xl border transition-all ${
                      reward.claimed
                        ? 'bg-white/5 border-white/10 opacity-60'
                        : 'bg-amber-500/10 border-amber-500/30'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          reward.claimed ? 'bg-white/10' : 'bg-amber-500/20'
                        }`}>
                          <span className="text-lg font-bold text-amber-400">{reward.tokenSymbol.charAt(0)}</span>
                        </div>
                        <div>
                          <p className="text-white font-medium">{reward.tokenSymbol}</p>
                          <p className="text-white/50 text-xs font-mono">
                            from {reward.loserWallet?.slice(0, 4)}...{reward.loserWallet?.slice(-4)}
                          </p>
                          <p className="text-white/40 text-xs">
                            {reward.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })} tokens
                          </p>
                        </div>
                      </div>
                      
                      <div className="text-right">
                        <p className="text-white font-bold">${reward.currentUsdValue.toFixed(2)}</p>
                        {!reward.hasLivePrice && (
                          <p className="text-amber-400/70 text-xs">⚠ Entry price</p>
                        )}
                        {reward.hasLivePrice && reward.currentUsdValue !== reward.entryUsdValue && (
                          <p className="text-white/40 text-xs">
                            Entry: ${reward.entryUsdValue.toFixed(2)}
                            <span className={`ml-1 ${priceChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              ({priceChange >= 0 ? '+' : ''}{priceChange.toFixed(1)}%)
                            </span>
                          </p>
                        )}
                        {reward.claimed ? (
                          <span className="text-xs text-green-400">✓ Claimed</span>
                        ) : (
                          <button
                            onClick={() => handleClaim(reward, actualIndex)}
                            disabled={claimingIndex !== null}
                            className="mt-1 px-3 py-1 bg-amber-500 hover:bg-amber-400 text-gray-900 text-xs font-bold rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            {claimingIndex === actualIndex ? 'Claiming...' : 'Claim'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Footer */}
        {claimableRewards.length > 0 && !allClaimed && (
          <div className="p-6 border-t border-white/10">
            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}
            
            <button
              onClick={handleClaimAll}
              disabled={isLoading || claimingIndex !== null}
              className="w-full py-3 bg-gradient-to-r from-amber-400 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-gray-900 font-bold rounded-xl transition-all disabled:opacity-50 cursor-pointer shadow-lg shadow-amber-500/20"
            >
              {isLoading || claimingIndex !== null ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Claiming...
                </span>
              ) : (
                `Claim All (${claimableRewards.filter(r => !r.claimed).length} rewards)`
              )}
            </button>
            
            <p className="text-center text-white/30 text-xs mt-3">
              Each claim is a separate transaction
            </p>
            {hasMissingPrices && (
              <p className="text-center text-amber-400/70 text-xs mt-2">
                ⚠ Some prices use entry values (no live data available)
              </p>
            )}
          </div>
        )}

        {allClaimed && (
          <div className="p-6 border-t border-white/10">
            <div className="text-center py-4">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-green-500/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-green-400 font-bold">All Rewards Claimed!</p>
              <p className="text-white/50 text-sm mt-1">Check your wallet for the tokens</p>
            </div>
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

