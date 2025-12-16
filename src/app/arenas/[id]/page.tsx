'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useWallet } from '@/context/WalletContext';
import { usePythStream, useArenaVolatility } from '@/context/PythStreamContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import Navbar from '@/components/Navbar';
import SimpleVolatilityChart, { ChartDataPoint } from '@/components/SimpleVolatilityChart';
import HexArenaChart from '@/components/HexArenaChart';
import Image from 'next/image';
import localFont from 'next/font/local';

const aceOfSwords = localFont({
  src: '../../../fonts/AceOfSwords-R9x9W.otf',
  variable: '--font-ace-of-swords',
});

// API URLs
const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL || 'http://localhost:3001';
const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

// Types
interface PlayerEntry {
  playerWallet: string;
  playerIndex: number;
  assetIndex: number;
  assetSymbol: string;
  entryTimestamp: string;
  isWinner?: boolean;
}

interface ArenaAsset {
  assetIndex: number;
  assetSymbol: string;
  playerCount: number;
  isWinner: boolean;
  startPrice?: number;
  endPrice?: number;
  priceMovementRaw?: string;
  priceMovementBps?: number;
}

interface ArenaDetail {
  id: string;
  arenaId: string;
  pda: string;
  status: number;
  statusLabel: string;
  playerCount: number;
  assetCount: number;
  totalPoolSol: number;
  totalPoolUsd: number;
  startTimestamp: string | null;
  endTimestamp: string | null;
  winningAsset: number | null;
  winningAssetSymbol: string | null;
  playerEntries: PlayerEntry[];
  arenaAssets: ArenaAsset[];
}

interface UserProfile {
  name: string;
  twitterUsername: string;
  twitterProfilePicture: string | null;
  profileBanner: string | null;
}

// Status constants
const ArenaStatus = {
  Uninitialized: 0,
  Waiting: 1,
  Active: 2,
  Ended: 3,
  Canceled: 4,
};

function ArenaDetailPage() {
  const router = useRouter();
  const params = useParams();
  const arenaId = params?.id as string;
  const { user } = useAuth();
  const { publicKey } = useWallet();
  
  // Pyth streaming
  const { subscribeToArena, unsubscribeFromArena } = usePythStream();
  const { data: pythVolatility, isStreaming } = useArenaVolatility(arenaId || '');
  
  // Core state
  const [arena, setArena] = useState<ArenaDetail | null>(null);
  const [userProfiles, setUserProfiles] = useState<Record<string, UserProfile | null>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Countdown state
  const [endCountdown, setEndCountdown] = useState<number | null>(null);
  const [displayCountdown, setDisplayCountdown] = useState<number | null>(null); // Slowed countdown for display
  const [isPolling, setIsPolling] = useState(false);
  const [isWaitingPolling, setIsWaitingPolling] = useState(false); // Polling for Waiting -> Active
  
  // Transition states for smooth end animation
  const [showArenaEndedBanner, setShowArenaEndedBanner] = useState(false); // 2s banner after receiving endPrice
  const [endedArenaData, setEndedArenaData] = useState<ArenaDetail | null>(null); // Store ended data for transition
  const [wasLiveDuringArena, setWasLiveDuringArena] = useState(false); // Track if user was on page during active
  
  // Refs to track state without causing re-renders
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const waitingPollingRef = useRef<NodeJS.Timeout | null>(null);
  const hasStartedPollingRef = useRef(false);
  const hasSubscribedRef = useRef(false);
  const previousStatusRef = useRef<number | null>(null);
  const countdownStartTimeRef = useRef<number | null>(null);
  const totalDurationRef = useRef<number | null>(null);

  // Fetch arena data from indexer
  const fetchArena = useCallback(async () => {
    if (!arenaId) return;
    
    try {
      const response = await fetch(`${INDEXER_URL}/api/v1/arenas/${arenaId}`);
      if (!response.ok) {
        if (response.status === 404) {
          setError('Arena not found');
        } else {
          throw new Error('Failed to fetch arena');
        }
        return;
      }
      
      const data = await response.json();
      setArena(data);
      setError(null);
      
      // Fetch user profiles for all players (only on initial load or when players change)
      if (data.playerEntries) {
        const wallets = data.playerEntries.map((p: PlayerEntry) => p.playerWallet);
        fetchUserProfiles(wallets);
      }
      
      return data;
    } catch (err) {
      console.error('Failed to fetch arena:', err);
      setError('Could not load arena');
    } finally {
      setIsLoading(false);
    }
  }, [arenaId]);

  // Fetch user profiles from backend
  const fetchUserProfiles = async (wallets: string[]) => {
    const profiles: Record<string, UserProfile | null> = {};
    
    await Promise.all(
      wallets.map(async (wallet) => {
        try {
          const response = await fetch(`${BACKEND_URL}/api/wallets/public/user/${wallet}`);
          if (response.ok) {
            profiles[wallet] = await response.json();
          } else {
            profiles[wallet] = null;
          }
        } catch {
          profiles[wallet] = null;
        }
      })
    );
    
    setUserProfiles(prev => ({ ...prev, ...profiles }));
  };

  // Initial fetch on mount
  useEffect(() => {
    fetchArena();
  }, [fetchArena]);

  // Subscribe to Pyth stream when arena is Active AND all tokens have startPrice
  useEffect(() => {
    if (!arena || !arenaId) return;
    
    // Only subscribe for Active arenas with assets where ALL have startPrice
    if (arena.status === ArenaStatus.Active && arena.arenaAssets && arena.arenaAssets.length > 0) {
      // Don't re-subscribe if already subscribed
      if (hasSubscribedRef.current) return;
      
      // Check that ALL assets have startPrice
      const allHaveStartPrices = arena.arenaAssets.every(asset => asset.startPrice && asset.startPrice > 0);
      if (!allHaveStartPrices) {
        console.log('[Arena] Waiting for all tokens to have startPrice before subscribing to Pyth');
        return;
      }
      
      const tokens = arena.arenaAssets.map(asset => ({
        symbol: asset.assetSymbol,
        assetIndex: asset.assetIndex,
        startPrice: asset.startPrice || 0,
      }));
      
      console.log('[Arena] Subscribing to Pyth stream with tokens:', tokens.map(t => `${t.symbol}@${t.startPrice}`));
      subscribeToArena(arenaId, tokens);
      hasSubscribedRef.current = true;
    }
    
    // Unsubscribe when arena ends
    if (arena.status === ArenaStatus.Ended || arena.status === ArenaStatus.Canceled) {
      if (hasSubscribedRef.current) {
        console.log('[Arena] Arena ended, unsubscribing from Pyth stream');
        unsubscribeFromArena(arenaId);
        hasSubscribedRef.current = false;
      }
    }
  }, [arena, arenaId, subscribeToArena, unsubscribeFromArena]);

  // Cleanup: unsubscribe on unmount
  useEffect(() => {
    return () => {
      if (hasSubscribedRef.current && arenaId) {
        console.log('[Arena] Component unmounting, unsubscribing from Pyth stream');
        unsubscribeFromArena(arenaId);
        hasSubscribedRef.current = false;
      }
    };
  }, [arenaId, unsubscribeFromArena]);

  // Track if user was on page during active arena (for smooth transition)
  useEffect(() => {
    if (arena?.status === ArenaStatus.Active && !wasLiveDuringArena) {
      setWasLiveDuringArena(true);
    }
  }, [arena?.status, wasLiveDuringArena]);

  // Countdown timer - runs every second, starts polling when < 10 seconds
  // Also implements "slowing" countdown that adds ~10 seconds over 3 minutes
  useEffect(() => {
    if (!arena || arena.status !== ArenaStatus.Active || !arena.endTimestamp) {
      setEndCountdown(null);
      setDisplayCountdown(null);
      return;
    }

    const endTime = new Date(arena.endTimestamp!).getTime();
    const startTime = arena.startTimestamp ? new Date(arena.startTimestamp).getTime() : null;
    
    // Calculate total duration once
    if (startTime && totalDurationRef.current === null) {
      totalDurationRef.current = endTime - startTime;
      countdownStartTimeRef.current = Date.now();
    }

    const updateCountdown = () => {
      const now = Date.now();
      const remaining = Math.max(0, endTime - now);
      setEndCountdown(remaining);
      
      // Calculate slowed display countdown
      // Adds ~10 seconds over the full duration (progressively slower as we approach 0)
      // This makes it feel like time slows down dramatically near the end
      if (totalDurationRef.current && totalDurationRef.current > 0) {
        const totalDuration = totalDurationRef.current;
        const elapsed = totalDuration - remaining;
        const progress = Math.min(1, elapsed / totalDuration); // 0 to 1
        
        // Add up to 10 seconds total, distributed with quadratic easing
        // extraTimeToAdd grows faster as we approach end (more dramatic slowdown)
        const maxExtraTime = 10000; // 10 seconds total to add
        const extraTimeToAdd = maxExtraTime * Math.pow(progress, 2);
        
        // Display shows more time remaining than actual
        const displayRemaining = Math.max(0, remaining + extraTimeToAdd);
        setDisplayCountdown(displayRemaining);
      } else {
        setDisplayCountdown(remaining);
      }
      
      // Start polling when countdown < 10 seconds
      if (remaining <= 10000 && remaining > 0 && !hasStartedPollingRef.current) {
        console.log('[Arena] Countdown < 10s - starting polling');
        hasStartedPollingRef.current = true;
        setIsPolling(true);
      }
    };

    // Initial calculation
    updateCountdown();
    
    // Update every second
    const timer = setInterval(updateCountdown, 1000);
    
    return () => clearInterval(timer);
  }, [arena?.status, arena?.endTimestamp, arena?.startTimestamp]);

  // Polling effect for Active arenas (near end) - only runs when isPolling is true
  // When arena ends, trigger 2-second "ARENA ENDED" banner if user was live
  useEffect(() => {
    if (!isPolling || !arenaId) return;

    const pollArena = async () => {
      try {
        const response = await fetch(`${INDEXER_URL}/api/v1/arenas/${arenaId}`);
        if (response.ok) {
          const data = await response.json();
          
          // Check if arena has ended with endPrice
          if (data.status === ArenaStatus.Ended) {
            const hasEndPrices = data.arenaAssets?.some((a: ArenaAsset) => a.endPrice && a.endPrice > 0);
            
            if (hasEndPrices && wasLiveDuringArena) {
              // User was live - show smooth transition
              console.log('[Arena] Arena ended with endPrices - showing 2s transition');
              setEndedArenaData(data); // Store for transition display
              setShowArenaEndedBanner(true);
              setIsPolling(false);
              hasStartedPollingRef.current = false;
              
              // After 2 seconds, update to final ended state
              setTimeout(() => {
                setShowArenaEndedBanner(false);
                setEndedArenaData(null);
                setArena(data);
              }, 2000);
            } else {
              // User wasn't live or no endPrices yet - just update directly
              console.log('[Arena] Arena ended - updating directly');
              setArena(data);
              setIsPolling(false);
              hasStartedPollingRef.current = false;
            }
          } else {
            // Still active, just update the data
            setArena(data);
          }
        }
      } catch (err) {
        console.error('[Arena] Polling error:', err);
      }
    };

    // Poll every 2 seconds
    pollingIntervalRef.current = setInterval(pollArena, 2000);
    
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [isPolling, arenaId, wasLiveDuringArena]);

  // Polling effect for Waiting arenas OR Active arenas missing startPrices
  useEffect(() => {
    if (!arena || !arenaId) return;
    
    // Check if all assets have startPrice
    const allHaveStartPrices = arena.arenaAssets?.length > 0 && 
      arena.arenaAssets.every(asset => asset.startPrice && asset.startPrice > 0);
    
    // Start polling when arena is Waiting OR Active but missing startPrices
    if ((arena.status === ArenaStatus.Waiting || 
        (arena.status === ArenaStatus.Active && !allHaveStartPrices)) && !isWaitingPolling) {
      const reason = arena.status === ArenaStatus.Waiting 
        ? 'Arena is Waiting' 
        : 'Arena is Active but missing startPrices';
      console.log(`[Arena] ${reason} - starting poll`);
      setIsWaitingPolling(true);
    }
    
    // Stop polling when arena is Active with ALL startPrices, or ended
    if (arena.status === ArenaStatus.Active && allHaveStartPrices && isWaitingPolling) {
      console.log('[Arena] Arena Active with all startPrices - stopping poll');
      setIsWaitingPolling(false);
    }
    
    // Stop polling if arena ended/canceled
    if ((arena.status === ArenaStatus.Ended || arena.status === ArenaStatus.Canceled) && isWaitingPolling) {
      console.log('[Arena] Arena ended/canceled - stopping poll');
      setIsWaitingPolling(false);
    }
  }, [arena?.status, arena?.arenaAssets, arenaId, isWaitingPolling]);

  // Waiting status polling interval
  useEffect(() => {
    if (!isWaitingPolling || !arenaId) return;

    const pollWaitingArena = async () => {
      try {
        const response = await fetch(`${INDEXER_URL}/api/v1/arenas/${arenaId}`);
        if (response.ok) {
          const data = await response.json();
          
          // Check if arena has startPrice for ALL tokens
          const allHaveStartPrices = data.arenaAssets?.length > 0 && 
            data.arenaAssets.every((a: ArenaAsset) => a.startPrice && a.startPrice > 0);
          
          if (data.status === ArenaStatus.Active && allHaveStartPrices) {
            // Arena is Active with ALL startPrices - ready to go!
            console.log('[Arena] Arena now Active with ALL startPrices - updating');
            setArena(data);
            setIsWaitingPolling(false);
            
            // Fetch user profiles for players
            if (data.playerEntries) {
              const wallets = data.playerEntries.map((p: PlayerEntry) => p.playerWallet);
              fetchUserProfiles(wallets);
            }
          } else if (data.status === ArenaStatus.Active && !allHaveStartPrices) {
            // Active but not all tokens have startPrices yet, keep polling
            const missingCount = data.arenaAssets?.filter((a: ArenaAsset) => !a.startPrice || a.startPrice === 0).length || 0;
            const missingSymbols = data.arenaAssets?.filter((a: ArenaAsset) => !a.startPrice || a.startPrice === 0).map((a: ArenaAsset) => a.assetSymbol) || [];
            console.log(`[Arena] Arena Active but ${missingCount} token(s) missing startPrice: ${missingSymbols.join(', ')} - continuing poll`);
          } else if (data.status === ArenaStatus.Ended || data.status === ArenaStatus.Canceled) {
            // Arena ended/canceled
            console.log('[Arena] Arena ended/canceled during poll');
            setArena(data);
            setIsWaitingPolling(false);
          }
          // If still Waiting, just keep polling (no state update needed)
        }
      } catch (err) {
        console.error('[Arena] Waiting poll error:', err);
      }
    };

    // Poll every 3 seconds for waiting status
    waitingPollingRef.current = setInterval(pollWaitingArena, 3000);
    
    // Also poll immediately
    pollWaitingArena();
    
    return () => {
      if (waitingPollingRef.current) {
        clearInterval(waitingPollingRef.current);
        waitingPollingRef.current = null;
      }
    };
  }, [isWaitingPolling, arenaId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
      if (waitingPollingRef.current) {
        clearInterval(waitingPollingRef.current);
      }
    };
  }, []);

  if (!user) return null;

  // Helper functions
  const getStatusBadge = (status: number, statusLabel: string) => {
    const styles: Record<number, string> = {
      [ArenaStatus.Uninitialized]: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/40',
      [ArenaStatus.Waiting]: 'bg-sky-500/20 text-sky-400 border-sky-500/40',
      [ArenaStatus.Active]: 'bg-sky-500/20 text-sky-400 border-sky-500/40 animate-pulse',
      [ArenaStatus.Ended]: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/40',
      [ArenaStatus.Canceled]: 'bg-red-500/20 text-red-400 border-red-500/40',
    };
    
    return (
      <span className={`px-4 py-1.5 rounded-full text-sm font-bold border ${styles[status] || styles[ArenaStatus.Waiting]}`}>
        {statusLabel}
      </span>
    );
  };

  const formatTime = (timestamp: string | null) => {
    if (!timestamp) return '—';
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatWallet = (wallet: string) => {
    return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
  };

  const isWinner = (entry: PlayerEntry) => {
    if (!arena || arena.winningAsset === null) return false;
    return entry.assetIndex === arena.winningAsset;
  };

  // Get volatility - use ended data during transition, Pyth for Active, indexed for Ended
  const getAssetVolatility = (assetIndex: number): number => {
    // During "ARENA ENDED" banner transition, use the final volatility from ended data
    if (showArenaEndedBanner && endedArenaData) {
      const asset = endedArenaData.arenaAssets?.find(a => a.assetIndex === assetIndex);
      if (asset?.priceMovementRaw) {
        return parseFloat(asset.priceMovementRaw) / 1e10;
      }
    }
    
    // For Active arenas, use Pyth real-time data if available
    if (arena?.status === ArenaStatus.Active && pythVolatility.length > 0) {
      const pythData = pythVolatility.find(p => p.assetIndex === assetIndex);
      if (pythData) {
        return pythData.volatility;
      }
    }
    
    // For Ended arenas or fallback, use indexed data
    // Solana stores: priceMovementRaw = ((end - start) / start) * 1e12 (ratio with 12 decimals)
    // To get percentage: ratio * 100 = priceMovementRaw / 1e12 * 100 = priceMovementRaw / 1e10
    const asset = arena?.arenaAssets?.find(a => a.assetIndex === assetIndex);
    if (!asset) return 0;
    
    if (asset.priceMovementRaw) {
      return parseFloat(asset.priceMovementRaw) / 1e10; // Divide by 1e10 to get percentage
    } else if (asset.priceMovementBps !== undefined) {
      return asset.priceMovementBps / 100;
    }
    return 0;
  };

  // Get current price - use endPrice during transition banner, otherwise Pyth stream
  const getAssetCurrentPrice = (assetIndex: number): number | null => {
    // During "ARENA ENDED" banner transition, use endPrice as currentPrice
    if (showArenaEndedBanner && endedArenaData) {
      const asset = endedArenaData.arenaAssets?.find(a => a.assetIndex === assetIndex);
      if (asset?.endPrice) {
        return asset.endPrice;
      }
    }
    
    // Otherwise use Pyth stream data
    if (pythVolatility.length > 0) {
      const pythData = pythVolatility.find(p => p.assetIndex === assetIndex);
      if (pythData) {
        return pythData.currentPrice;
      }
    }
    return null;
  };

  const getAssetStartPrice = (assetIndex: number): number | null => {
    const asset = arena?.arenaAssets?.find(a => a.assetIndex === assetIndex);
    return asset?.startPrice ?? null;
  };

  const getAssetEndPrice = (assetIndex: number): number | null => {
    const asset = arena?.arenaAssets?.find(a => a.assetIndex === assetIndex);
    return asset?.endPrice ?? null;
  };

  const formatPrice = (price: number | null): string => {
    if (price === null || price === undefined) return '-';
    
    // For prices >= $100, show 2 decimals
    if (price >= 100) return `$${price.toFixed(2)}`;
    // For prices >= $1, show 4 decimals
    if (price >= 1) return `$${price.toFixed(4)}`;
    // For prices >= $0.01, show 6 decimals to capture small changes
    if (price >= 0.01) return `$${price.toFixed(6)}`;
    // For very small prices, show 8 decimals
    return `$${price.toFixed(8)}`;
  };

  const sortByVolatility = (entries: PlayerEntry[]): PlayerEntry[] => {
    return [...entries].sort((a, b) => {
      const volA = getAssetVolatility(a.assetIndex);
      const volB = getAssetVolatility(b.assetIndex);
      return volB - volA;
    });
  };

  const getWinners = () => {
    if (!arena || arena.winningAsset === null) return [];
    return arena.playerEntries.filter(p => p.assetIndex === arena.winningAsset);
  };

  const getLosers = () => {
    if (!arena || arena.winningAsset === null) return arena?.playerEntries || [];
    return sortByVolatility(arena.playerEntries.filter(p => p.assetIndex !== arena.winningAsset));
  };

  const getSortedParticipants = (): PlayerEntry[] => {
    if (!arena?.playerEntries) return [];
    return sortByVolatility(arena.playerEntries);
  };

  const getLeadingAsset = (): number | null => {
    if (!arena?.arenaAssets || arena.arenaAssets.length === 0) return null;
    
    let maxVolatility = -Infinity;
    let leadingAssetIndex: number | null = null;
    
    arena.arenaAssets.forEach(asset => {
      const volatility = getAssetVolatility(asset.assetIndex);
      if (volatility > maxVolatility) {
        maxVolatility = volatility;
        leadingAssetIndex = asset.assetIndex;
      }
    });
    
    return leadingAssetIndex;
  };

  // Player card component
  const PlayerCard = ({ entry, showPrices = false }: { entry: PlayerEntry; showPrices?: boolean }) => {
    const profile = userProfiles[entry.playerWallet];
    const isCurrentUser = publicKey && entry.playerWallet === publicKey.toBase58();
    const playerIsWinner = isWinner(entry);
    const volatilityPercent = getAssetVolatility(entry.assetIndex);
    const startPrice = getAssetStartPrice(entry.assetIndex);
    const endPrice = getAssetEndPrice(entry.assetIndex);
    const currentPrice = getAssetCurrentPrice(entry.assetIndex);
    
    const leadingAsset = getLeadingAsset();
    const isLeading = leadingAsset !== null && entry.assetIndex === leadingAsset && !playerIsWinner;
    
    return (
      <div 
        className={`relative backdrop-blur-xl rounded-xl border overflow-hidden transition-all hover:scale-[1.01] ${
          playerIsWinner 
            ? 'bg-gradient-to-r from-amber-500/15 to-yellow-500/10 border-amber-500/40 shadow-lg shadow-amber-500/10' 
            : isLeading
              ? 'bg-gradient-to-r from-sky-500/10 to-cyan-500/5 border-sky-500/40'
              : isCurrentUser 
                ? 'bg-gradient-to-r from-white/8 to-white/4 border-white/20' 
                : 'bg-white/5 border-white/10 hover:border-white/20'
        }`}
      >
        {/* Winner badge */}
        {playerIsWinner && arena?.status === ArenaStatus.Ended && (
          <div className="absolute top-0 left-0 bg-gradient-to-r from-amber-400 to-yellow-400 text-gray-900 px-4 py-1.5 text-xs font-bold rounded-br-xl shadow-lg">
            WINNER
          </div>
        )}
        
        {/* Leading badge for active arenas */}
        {!playerIsWinner && isLeading && arena?.status === ArenaStatus.Active && (
          <div className="absolute top-0 left-0 bg-gradient-to-r from-sky-400 to-cyan-400 text-gray-900 px-4 py-1.5 text-xs font-bold rounded-br-xl shadow-lg">
            LEADING
          </div>
        )}
        
        <div className="p-4">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            {profile?.twitterProfilePicture ? (
              <Image
                src={profile.twitterProfilePicture}
                alt={profile.name || 'Player'}
                width={48}
                height={48}
                className="rounded-xl"
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-zinc-700 to-zinc-800 flex items-center justify-center text-white/40 border border-white/5">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
            )}
            
            {/* User info */}
            <div className="flex-1 min-w-0">
              {profile?.twitterUsername ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium">@{profile.twitterUsername}</span>
                    {isCurrentUser && (
                      <span className="px-2.5 py-0.5 rounded-full bg-amber-400 text-gray-900 text-[10px] font-bold shadow-lg shadow-amber-500/30">
                        YOU
                      </span>
                    )}
                  </div>
                  <p className="text-white/30 text-xs font-mono mt-0.5">{formatWallet(entry.playerWallet)}</p>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-white/60 font-mono">{formatWallet(entry.playerWallet)}</span>
                  {isCurrentUser && (
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-400 text-gray-900 text-[10px] font-bold shadow-lg shadow-amber-500/30">
                      YOU
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Prices (for ended arenas) */}
            {showPrices && (arena?.status === ArenaStatus.Ended || arena?.status === ArenaStatus.Canceled) && (
              <div className="flex gap-4">
                <div className="text-center px-2">
                  <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1">Start</p>
                  <p className="text-sm font-medium text-white/70">{formatPrice(startPrice)}</p>
                </div>
                <div className="text-center px-2">
                  <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1">End</p>
                  <p className="text-sm font-medium text-white/70">{formatPrice(endPrice)}</p>
                </div>
                <div className="text-center px-2">
                  <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1">Change</p>
                  <p className={`text-sm font-bold ${
                    volatilityPercent > 0 ? 'text-green-400' : volatilityPercent < 0 ? 'text-red-400' : 'text-white/50'
                  }`}>
                    {volatilityPercent > 0 ? '+' : ''}{volatilityPercent.toFixed(4)}%
                  </p>
                </div>
              </div>
            )}

            {/* Real-time volatility and prices (for active arenas) */}
            {arena?.status === ArenaStatus.Active && (
              <div className="flex gap-3">
                {/* Start Price */}
                <div className="text-center px-2">
                  <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1">Start</p>
                  <p className="text-sm font-medium text-white/70">{formatPrice(startPrice)}</p>
                </div>
                {/* Current Price (from Pyth) */}
                <div className="text-center px-2">
                  <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1 flex items-center justify-center gap-1">
                    Current
                    {isStreaming && (
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
                      </span>
                    )}
                  </p>
                  <p className="text-sm font-medium text-white">{formatPrice(currentPrice)}</p>
                </div>
                {/* Volatility */}
                <div className="text-center px-2">
                  <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1">Change</p>
                  <p className={`text-sm font-bold ${
                    volatilityPercent > 0 ? 'text-green-400' : volatilityPercent < 0 ? 'text-red-400' : 'text-white/50'
                  }`}>
                    {volatilityPercent > 0 ? '+' : ''}{volatilityPercent.toFixed(4)}%
                  </p>
                </div>
              </div>
            )}
            
            {/* Token Symbol */}
            <div className="text-right">
              <div className="flex items-center gap-2 justify-end">
                <span className={`px-4 py-2 rounded-lg text-base font-bold ${
                  playerIsWinner 
                    ? 'bg-amber-400/20 text-amber-400 border border-amber-500/40' 
                    : isLeading
                      ? 'bg-sky-400/20 text-sky-400 border border-sky-500/40'
                      : 'bg-white/10 text-white/70 border border-white/5'
                }`}>
                  {entry.assetSymbol}
                </span>
              </div>
              {(arena?.status === ArenaStatus.Ended) && (
                <p className={`text-xs mt-2 ${
                  volatilityPercent > 0 ? 'text-green-400/80' : volatilityPercent < 0 ? 'text-red-400/80' : 'text-white/30'
                }`}>
                  {volatilityPercent > 0 ? '+' : ''}{volatilityPercent.toFixed(4)}%
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={`min-h-screen bg-[#222732] ${aceOfSwords.variable}`}>
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-15%] right-[5%] w-[700px] h-[700px] bg-cyan-400/15 rounded-full blur-[150px]" />
        <div className="absolute top-[30%] left-[-10%] w-[600px] h-[600px] bg-sky-400/12 rounded-full blur-[130px]" />
        <div className="absolute bottom-[0%] right-[30%] w-[500px] h-[500px] bg-blue-400/10 rounded-full blur-[120px]" />
        <div className="absolute top-[50%] left-[40%] w-[400px] h-[400px] bg-cyan-500/8 rounded-full blur-[140px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_0%,_rgba(34,39,50,0.5)_100%)]" />
      </div>
      
      <div className="fixed inset-x-0 top-0 h-40 bg-gradient-to-b from-[#222732]/90 via-[#222732]/50 to-transparent z-[5] pointer-events-none" />

      {/* Content */}
      <div className="relative z-10 p-6">
        <Navbar />

        {/* Back button */}
        <button
          onClick={() => router.push('/arenas')}
          className="flex items-center gap-2 text-white/50 hover:text-white transition-all mb-4 w-fit cursor-pointer group"
        >
          <div className="p-1.5 rounded-lg bg-white/5 group-hover:bg-white/10 transition-all">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </div>
          <span className="text-sm">Back to Arenas</span>
        </button>

        {/* Main Content */}
        <div>
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="flex flex-col items-center gap-4 bg-white/5 backdrop-blur-xl px-10 py-8 rounded-2xl border border-white/10">
                <div className="relative">
                  <div className="w-12 h-12 rounded-full border-4 border-sky-500/20 border-t-sky-400 animate-spin" />
                  <div className="absolute inset-0 w-12 h-12 rounded-full border-4 border-cyan-500/20 border-b-cyan-400 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
                </div>
                <p className="text-white/50 font-medium">Loading arena...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-64">
              <div className="bg-red-500/10 backdrop-blur-xl rounded-2xl px-8 py-6 border border-red-500/30 text-center">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-red-500/20 flex items-center justify-center">
                  <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-red-400 text-lg mb-3">{error}</p>
                <button
                  onClick={() => router.push('/arenas')}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white/70 hover:text-white text-sm transition-all cursor-pointer"
                >
                  Go back to arenas
                </button>
              </div>
            </div>
          ) : arena && (
            <>
              {/* Starting Soon Banner */}
              {arena.status === ArenaStatus.Waiting && (
                <div className="bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-amber-500/20 backdrop-blur-xl rounded-2xl border border-amber-500/30 p-6 mb-6">
                  <div className="flex items-center justify-center gap-4">
                    {isWaitingPolling && (
                      <svg className="w-8 h-8 text-amber-400 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    )}
                    <div className="text-center">
                      <h2 
                        className="text-2xl text-amber-400 tracking-wider mb-1"
                        style={{ fontFamily: 'var(--font-ace-of-swords)' }}
                      >
                        ARENA STARTING SOON
                      </h2>
                      <p className="text-amber-400/70 text-sm">
                        Waiting for arena to begin...
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Arena Ended Banner - 2 second transition showing final volatility */}
              {showArenaEndedBanner && (
                <div className="bg-gradient-to-r from-amber-500/30 via-yellow-500/20 to-amber-500/30 backdrop-blur-xl rounded-2xl border border-amber-500/50 p-6 mb-6">
                  <div className="flex items-center justify-center gap-4">
                    <svg className="w-10 h-10 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="text-center">
                      <h2 className={`text-3xl text-amber-400 tracking-wider mb-1 ${aceOfSwords.className}`}>
                        ARENA ENDED
                      </h2>
                      <p className="text-amber-400/70 text-sm">
                        Final results locked on-chain
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Final Seconds Banner - show when countdown < 10 seconds (polling active) */}
              {isPolling && !showArenaEndedBanner && (
                <div className="bg-gradient-to-r from-orange-500/20 via-amber-500/10 to-orange-500/20 backdrop-blur-xl rounded-2xl border border-orange-500/30 p-6 mb-6 animate-pulse">
                  <div className="flex items-center justify-center gap-4">
                    <svg className="w-8 h-8 text-orange-400 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <div className="text-center">
                      <h2 className={`text-2xl text-orange-400 tracking-wider mb-1 ${aceOfSwords.className}`}>
                        FINAL SECONDS
                      </h2>
                      <p className="text-orange-400/70 text-sm">
                        Waiting for final prices to be locked...
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Header */}
              <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-6 mb-6 relative">
                <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
                  <div className="absolute -top-20 -right-20 w-40 h-40 bg-sky-500/15 rounded-full blur-3xl" />
                  <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl" />
                </div>
                
                <div className="relative flex items-start justify-between mb-6">
                  <div>
                    <div className="flex items-center gap-4 mb-3">
                      <h1 
                        className="text-4xl bg-gradient-to-r from-white via-white to-white/80 bg-clip-text text-transparent tracking-wide"
                        style={{ fontFamily: 'var(--font-ace-of-swords)' }}
                      >
                        ARENA #{arena.arenaId}
                      </h1>
                      {getStatusBadge(
                        arena.status, 
                        showArenaEndedBanner 
                          ? 'Ended' 
                          : isPolling 
                            ? 'Final Seconds' 
                            : isWaitingPolling && arena.status === ArenaStatus.Waiting
                              ? 'Starting...'
                              : arena.statusLabel
                      )}
                    </div>
                    <p className="text-white/30 text-xs font-mono bg-white/5 px-2 py-1 rounded inline-block">{arena.pda}</p>
                  </div>
                  
                  {/* Pool */}
                  <div className="text-right bg-white/5 backdrop-blur-sm rounded-xl px-5 py-3 border border-white/10 group/pool relative z-[60]">
                    <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1 flex items-center justify-end gap-1">
                      Total Pool
                      <svg className="w-3 h-3 text-white/30" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                    </p>
                    <p className="text-3xl font-bold bg-gradient-to-r from-sky-400 to-cyan-300 bg-clip-text text-transparent">
                      {(arena.totalPoolSol || 0).toFixed(2)} SOL
                    </p>
                    
                    <div className="absolute bottom-full right-0 mb-2 opacity-0 group-hover/pool:opacity-100 transition-opacity duration-200 pointer-events-none z-[9999]">
                      <div className="bg-zinc-900/95 backdrop-blur-md rounded-lg px-3 py-2 border border-zinc-700/80 shadow-xl whitespace-nowrap">
                        <p className="text-white text-xs">≈ ${(arena.totalPoolUsd || 0).toFixed(2)} USD</p>
                        <div className="absolute top-full right-4 -mt-1 border-4 border-transparent border-t-zinc-900/95"></div>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Stats */}
                <div className="relative grid grid-cols-4 gap-3">
                  <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 text-center border border-white/5">
                    <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1">Players</p>
                    <p className="text-2xl font-bold text-white">{arena.playerCount}<span className="text-white/30">/10</span></p>
                  </div>
                  <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 text-center border border-white/5">
                    <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1">Tokens</p>
                    <p className="text-2xl font-bold text-white">{arena.assetCount}</p>
                  </div>
                  <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 text-center border border-white/5">
                    <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1">Started</p>
                    <p className="text-sm font-medium text-white/70">{formatTime(arena.startTimestamp)}</p>
                  </div>
                  <div className={`backdrop-blur-sm rounded-xl p-4 text-center border ${
                    showArenaEndedBanner 
                      ? 'bg-gradient-to-r from-amber-500/20 to-yellow-500/10 border-amber-500/40' 
                      : isPolling 
                        ? 'bg-amber-500/10 border-amber-500/30' 
                        : 'bg-white/5 border-white/5'
                  }`}>
                    {/* Show arena ended transition */}
                    {showArenaEndedBanner ? (
                      <div className="flex flex-col items-center">
                        <svg className="w-6 h-6 text-amber-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className={`text-sm font-medium text-amber-400 ${aceOfSwords.className}`}>
                          ENDED
                        </p>
                      </div>
                    ) : arena.status === ArenaStatus.Active ? (
                      isPolling ? (
                        <div className="flex flex-col items-center">
                          <div className="w-5 h-5 border-2 border-orange-400 border-t-transparent rounded-full animate-spin mb-2" />
                          <p className={`text-sm font-medium text-orange-400 ${aceOfSwords.className}`}>
                            FINAL SECONDS
                          </p>
                        </div>
                      ) : displayCountdown !== null ? (
                        <>
                          <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1">Ends In</p>
                          <p className={`text-xl font-bold text-amber-400 tabular-nums ${aceOfSwords.className}`}>
                            {Math.floor(displayCountdown / 60000).toString().padStart(2, '0')}:{Math.floor((displayCountdown % 60000) / 1000).toString().padStart(2, '0')}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1">Ending On</p>
                          <p className="text-sm font-medium text-white/70">{formatTime(arena.endTimestamp)}</p>
                        </>
                      )
                    ) : (
                      <>
                        <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1">Ended</p>
                        <p className="text-sm font-medium text-white/70">{formatTime(arena.endTimestamp)}</p>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Live Volatility Chart - For Active arenas (not during ended transition) */}
              {arena.status === ArenaStatus.Active && !showArenaEndedBanner && arena.arenaAssets && arena.arenaAssets.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
                    <h3 className="text-white/50 text-sm uppercase tracking-wider font-medium">Live Race</h3>
                  </div>
                  <SimpleVolatilityChart 
                    data={arena.arenaAssets.map(asset => ({
                      symbol: asset.assetSymbol,
                      assetIndex: asset.assetIndex,
                      volatility: getAssetVolatility(asset.assetIndex),
                      startPrice: getAssetStartPrice(asset.assetIndex),
                      currentPrice: getAssetCurrentPrice(asset.assetIndex),
                    }))}
                    height={Math.max(300, 90 + arena.arenaAssets.length * 55)}
                    isStreaming={isStreaming}
                  />
                </div>
              )}

              {/* Chart Section - HexArenaChart for Ended/Canceled arenas */}
              {(arena.status === ArenaStatus.Ended || arena.status === ArenaStatus.Canceled) && (
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-4">
                    <h3 className="text-white/50 text-sm uppercase tracking-wider font-medium">Final Results</h3>
                  </div>

                  <div className="flex justify-center overflow-x-auto pb-2">
                    <HexArenaChart 
                      size={550} 
                      data={arena.arenaAssets?.map(asset => ({
                        symbol: asset.assetSymbol,
                        assetIndex: asset.assetIndex,
                        volatility: asset.priceMovementRaw ? parseFloat(asset.priceMovementRaw) / 1e10 : 0, // 1e10 to get percentage
                        startPrice: asset.startPrice,
                        endPrice: asset.endPrice,
                      })) || []}
                    />
                  </div>
                </div>
              )}

              {/* Participants */}
              <div className="space-y-8 mt-10 pb-8">
                {/* Winners Section - Only for ended arenas */}
                {arena.status === ArenaStatus.Ended && getWinners().length > 0 && (
                  <section>
                    <div className="flex items-center gap-3 mb-5">
                      <span className="text-lg">🏆</span>
                      <h2 className="text-lg font-bold text-white uppercase tracking-wider">Winners</h2>
                      <span className="text-white/40">({getWinners().length})</span>
                    </div>
                    <div className="space-y-3">
                      {getWinners().map((entry) => (
                        <PlayerCard key={entry.playerWallet} entry={entry} showPrices={true} />
                      ))}
                    </div>
                  </section>
                )}

                {/* Live Standings - For active arenas */}
                {arena.status === ArenaStatus.Active && arena.playerCount > 0 && (
                  <section>
                    <div className="flex items-center gap-3 mb-5">
                      <div className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
                      <h2 className="text-lg font-bold text-white uppercase tracking-wider">Live Standings</h2>
                      <span className="text-white/40">({arena.playerCount})</span>
                      {isStreaming && (
                        <div className="flex items-center gap-2 px-2 py-1 bg-green-500/20 rounded-lg border border-green-500/30">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                          </span>
                          <span className="text-green-400 text-xs font-medium">Pyth Live</span>
                        </div>
                      )}
                    </div>
                    <div className="space-y-3">
                      {getSortedParticipants().map((entry) => (
                        <PlayerCard key={entry.playerWallet} entry={entry} showPrices={false} />
                      ))}
                    </div>
                  </section>
                )}

                {/* Other Participants - For ended arenas (losers) */}
                {arena.status === ArenaStatus.Ended && getLosers().length > 0 && (
                  <section>
                    <div className="flex items-center gap-3 mb-5">
                      <h2 className="text-lg font-bold text-white uppercase tracking-wider">Other Participants</h2>
                      <span className="text-white/40">({getLosers().length})</span>
                    </div>
                    <div className="space-y-3">
                      {getLosers().map((entry) => (
                        <PlayerCard key={entry.playerWallet} entry={entry} showPrices={true} />
                      ))}
                    </div>
                  </section>
                )}

                {/* Waiting participants */}
                {arena.status === ArenaStatus.Waiting && (
                  <section>
                    <div className="flex items-center gap-3 mb-5">
                      <h2 className="text-lg font-bold text-white uppercase tracking-wider">Participants</h2>
                      <span className="text-white/40">({arena.playerCount})</span>
                    </div>
                    
                    {arena.playerCount === 0 ? (
                      <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-10 text-center">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-sky-500/10 flex items-center justify-center">
                          <svg className="w-8 h-8 text-sky-400/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                        </div>
                        <p className="text-white/40 text-lg">No participants yet</p>
                        <p className="text-white/20 text-sm mt-1">Be the first to enter this arena!</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {arena.playerEntries.map((entry) => (
                          <PlayerCard key={entry.playerWallet} entry={entry} showPrices={false} />
                        ))}
                      </div>
                    )}
                  </section>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ArenaDetail() {
  return (
    <ProtectedRoute>
      <ArenaDetailPage />
    </ProtectedRoute>
  );
}
