'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useWallet } from '@/context/WalletContext';
import { useArenaVolatility } from '@/context/PythStreamContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import Navbar from '@/components/Navbar';
import VolatilityChart from '@/components/VolatilityChart';
import HexArenaChart from '@/components/HexArenaChart';
import { indexerApi } from '@/lib/indexer-api';
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
  priceMovementRaw?: string;  // Raw value from Solana (10^8 precision). Divide by 1,000,000 to get %
  priceMovementBps?: number;  // For backward compatibility
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

// Token symbols (including EVM tokens)
const TOKEN_SYMBOLS = [
  'SOL', 'TRUMP', 'PUMP', 'BONK', 'JUP', 'PENGU', 'PYTH', 'HNT', 'FARTCOIN', 'RAY', 'JTO', 'KMNO', 'MET', 'W',
  'ETH', 'UNI', 'LINK', 'PEPE', 'SHIB'
];

function ArenaDetailPage() {
  const router = useRouter();
  const params = useParams();
  const arenaId = params?.id as string;
  const { user } = useAuth();
  const { publicKey } = useWallet();
  
  const [arena, setArena] = useState<ArenaDetail | null>(null);
  const [userProfiles, setUserProfiles] = useState<Record<string, UserProfile | null>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartView, setChartView] = useState<'standard' | 'hex' | 'spaghetti'>('standard');
  const [volatilityData, setVolatilityData] = useState<Map<number, number>>(new Map());
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Track flash effects for participants
  const [flashingAssets, setFlashingAssets] = useState<Set<number>>(new Set());
  const [newLeader, setNewLeader] = useState<number | null>(null);
  
  // Countdown state for arena ending
  const [endCountdown, setEndCountdown] = useState<number | null>(null);
  const [useIndexerPrices, setUseIndexerPrices] = useState(false);
  const [isArenaEnding, setIsArenaEnding] = useState(false); // True when countdown <= 0 but not yet transitioned
  const [isLastTenSeconds, setIsLastTenSeconds] = useState(false); // True when countdown <= 10s (slow down Pyth)
  const [pendingEndedTransition, setPendingEndedTransition] = useState(false); // Delay before showing Ended state
  const [displayedStatus, setDisplayedStatus] = useState<number | null>(null); // What status to show in UI
  const [lastStreamUpdateTime, setLastStreamUpdateTime] = useState<number>(0); // For throttling stream updates

  // Only enable Pyth streaming for Active arenas (including "ending" state) until we get final prices
  // Stop streaming when useIndexerPrices becomes true (after arena is Ended on-chain)
  const shouldEnableStreaming = (arena?.status === ArenaStatus.Active || (displayedStatus === ArenaStatus.Active && pendingEndedTransition)) && !useIndexerPrices;
  const { data: streamVolatility, isStreaming: isStreamingVolatility } = useArenaVolatility(
    shouldEnableStreaming ? arenaId : ''
  );

  // Fetch arena details
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
      
      // Fetch user profiles for all players
      if (data.playerEntries) {
        const wallets = data.playerEntries.map((p: PlayerEntry) => p.playerWallet);
        fetchUserProfiles(wallets);
      }
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
    
    setUserProfiles(profiles);
  };

  // Fetch volatility data
  const fetchVolatilityData = useCallback(async () => {
    if (!arenaId || !arena) return;
    
    // For ended or canceled arenas, use the stored priceMovementRaw (final volatility)
    if (arena.status === ArenaStatus.Ended || arena.status === ArenaStatus.Canceled) {
      const volatilityMap = new Map<number, number>();
      arena.arenaAssets?.forEach(asset => {
        // Use raw value (10^8 precision) - divide by 1,000,000 to get percentage
        if (asset.priceMovementRaw) {
          const rawValue = parseFloat(asset.priceMovementRaw);
          volatilityMap.set(asset.assetIndex, rawValue / 1000000);
        } else if (asset.priceMovementBps !== undefined && asset.priceMovementBps !== null) {
          // Fallback to BPS for older data
          volatilityMap.set(asset.assetIndex, asset.priceMovementBps / 100);
        }
      });
      setVolatilityData(volatilityMap);
      return;
    }
    
    // For active arenas, fetch live volatility data
    if (arena.status !== ArenaStatus.Active) {
      return;
    }
    
    try {
      const response = await indexerApi.getArenaVolatility(arenaId, '1m');
      
      // Build a map of assetIndex -> current volatility
      const volatilityMap = new Map<number, number>();
      response.assets.forEach(asset => {
        if (asset.data.length > 0) {
          const latestVolatility = asset.data[asset.data.length - 1].volatility;
          volatilityMap.set(asset.assetIndex, latestVolatility);
        }
      });
      
      setVolatilityData(volatilityMap);
    } catch (err) {
      console.error('Failed to fetch volatility data:', err);
    }
  }, [arenaId, arena]);

  useEffect(() => {
    fetchArena();
  }, [fetchArena]);

  useEffect(() => {
    if (arena) {
      fetchVolatilityData();
      
      // Poll every 2s when arena is ending (to detect status change quickly), otherwise every 5s
      const pollInterval = isArenaEnding ? 2000 : 5000;
      
      const interval = setInterval(() => {
        fetchArena(); // Refresh arena data (including status and end prices from Solana)
        fetchVolatilityData(); // Refresh volatility data
      }, pollInterval);
      
      return () => clearInterval(interval);
    }
  }, [arena, fetchVolatilityData, fetchArena, isArenaEnding]);

  // Update current time and countdown every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
      
      // Calculate countdown for active arenas
      if (arena?.status === ArenaStatus.Active && arena.endTimestamp) {
        const endTime = new Date(arena.endTimestamp).getTime();
        const now = Date.now();
        const remaining = Math.max(0, endTime - now);
        setEndCountdown(remaining);
        
        // When countdown <= 10 seconds, slow down Pyth updates
        if (remaining <= 10000 && !isLastTenSeconds) {
          setIsLastTenSeconds(true);
          console.log('[Arena] Last 10 seconds - slowing down Pyth updates to 5s');
        }
        
        // When countdown reaches 0, set "arena is ending" state
        if (remaining <= 0 && !isArenaEnding) {
          setIsArenaEnding(true);
          console.log('[Arena] Countdown reached 0 - arena is ending');
        }
      } else {
        setEndCountdown(null);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [arena?.status, arena?.endTimestamp, isArenaEnding, isLastTenSeconds]);

  // Sync displayed status with arena status (except during ending transition)
  useEffect(() => {
    if (arena && !pendingEndedTransition) {
      // If arena becomes Active, update displayedStatus
      if (arena.status === ArenaStatus.Active && displayedStatus !== ArenaStatus.Active) {
        console.log('[Arena] Arena became Active, updating displayedStatus');
        setDisplayedStatus(ArenaStatus.Active);
      }
      // Initialize displayedStatus if null
      else if (displayedStatus === null) {
        setDisplayedStatus(arena.status);
      }
    }
  }, [arena, displayedStatus, pendingEndedTransition]);

  // Handle transition when arena becomes Ended or Canceled - delay UI update by 10 seconds
  // During this time, show the final prices from Solana program (via indexer)
  useEffect(() => {
    const isEnded = arena?.status === ArenaStatus.Ended;
    const isCanceled = arena?.status === ArenaStatus.Canceled;
    
    if ((isEnded || isCanceled) && displayedStatus === ArenaStatus.Active && !pendingEndedTransition) {
      console.log(`[Arena] Arena ${isEnded ? 'ended' : 'canceled'} on-chain, starting 10s transition...`);
      console.log('[Arena] Stopping Pyth stream, showing final indexed prices');
      setPendingEndedTransition(true);
      setUseIndexerPrices(true); // Stop Pyth stream, use final stored prices
      
      // Fetch final volatility data immediately (this has startPrice, endPrice, priceMovement from Solana)
      fetchVolatilityData();
      
      // After 10 seconds, update the displayed status to show Winners/Losers
      setTimeout(() => {
        console.log('[Arena] Transition complete - showing final state');
        setDisplayedStatus(arena?.status ?? ArenaStatus.Ended);
        setIsArenaEnding(false);
        setPendingEndedTransition(false);
        setIsLastTenSeconds(false);
      }, 10000);
    }
  }, [arena?.status, displayedStatus, pendingEndedTransition, fetchVolatilityData]);

  // Sync stream volatility data with local state (for real-time updates)
  // Skip when using indexer prices, throttle to 5s when in last 10 seconds
  useEffect(() => {
    if (streamVolatility.length > 0 && arena?.status === ArenaStatus.Active && !useIndexerPrices) {
      const now = Date.now();
      
      // Throttle updates to every 5 seconds when in last 10 seconds of countdown
      if (isLastTenSeconds && (now - lastStreamUpdateTime) < 5000) {
        return; // Skip this update
      }
      
      const volatilityMap = new Map<number, number>();
      const newFlashing = new Set<number>();
      
      // Get previous leader
      const prevLeaderEntry = [...volatilityData.entries()].sort((a, b) => b[1] - a[1])[0];
      const prevLeader = prevLeaderEntry ? prevLeaderEntry[0] : null;
      
      streamVolatility.forEach(item => {
        volatilityMap.set(item.assetIndex, item.volatility);
        
        // Check if this asset's volatility just changed (for flash effect)
        const prevVol = volatilityData.get(item.assetIndex);
        if (prevVol !== undefined && Math.abs(item.volatility - prevVol) > 0.0001) {
          newFlashing.add(item.assetIndex);
        }
        
        // Check if this is the new leader
        if (item.justTookLead) {
          setNewLeader(item.assetIndex);
          setTimeout(() => setNewLeader(null), 2000);
        }
      });
      
      setVolatilityData(volatilityMap);
      setLastStreamUpdateTime(now); // Track when we last updated
      
      // Set flashing and clear after animation
      if (newFlashing.size > 0) {
        setFlashingAssets(prev => new Set([...prev, ...newFlashing]));
        setTimeout(() => {
          setFlashingAssets(prev => {
            const updated = new Set(prev);
            newFlashing.forEach(id => updated.delete(id));
            return updated;
          });
        }, 500);
      }
    }
  }, [streamVolatility, arena?.status, useIndexerPrices, isLastTenSeconds, lastStreamUpdateTime]);

  if (!user) return null;

  // Get status badge
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

  // Format time
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

  // Format wallet address
  const formatWallet = (wallet: string) => {
    return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
  };

  // Check if player is winner
  const isWinner = (entry: PlayerEntry) => {
    if (!arena || arena.winningAsset === null) return false;
    return entry.assetIndex === arena.winningAsset;
  };

  // Calculate winnings (90% of total pool in SOL goes to winner)
  const calculateWinnings = () => {
    if (!arena) return 0;
    return (arena.totalPoolSol || 0) * 0.9;
  };

  // Get asset volatility from real-time data (same as charts use)
  const getAssetVolatility = (assetIndex: number): number => {
    return volatilityData.get(assetIndex) ?? 0;
  };

  // Sort participants by volatility (descending - highest volatility first)
  const sortByVolatility = (entries: PlayerEntry[]): PlayerEntry[] => {
    return [...entries].sort((a, b) => {
      const volA = getAssetVolatility(a.assetIndex);
      const volB = getAssetVolatility(b.assetIndex);
      return volB - volA; // Higher volatility = better ranking
    });
  };

  // Get winners and losers
  const getWinners = () => {
    if (!arena || arena.winningAsset === null) return [];
    return arena.playerEntries.filter(p => p.assetIndex === arena.winningAsset);
  };

  const getLosers = () => {
    if (!arena || arena.winningAsset === null) return arena?.playerEntries || [];
    // Sort losers by volatility (2nd place, 3rd place, etc.)
    return sortByVolatility(arena.playerEntries.filter(p => p.assetIndex !== arena.winningAsset));
  };

  // Get all participants sorted by standing (for live arenas)
  const getSortedParticipants = (): PlayerEntry[] => {
    if (!arena?.playerEntries) return [];
    return sortByVolatility(arena.playerEntries);
  };

  // Get the leading asset (highest volatility from real-time data)
  const getLeadingAsset = (): number | null => {
    if (volatilityData.size === 0) return null;
    
    let maxVolatility = -Infinity;
    let leadingAssetIndex: number | null = null;
    
    volatilityData.forEach((volatility, assetIndex) => {
      if (volatility > maxVolatility) {
        maxVolatility = volatility;
        leadingAssetIndex = assetIndex;
      }
    });
    
    return leadingAssetIndex;
  };

  // Get asset prices from arenaAssets (for ended/canceled arenas)
  const getAssetPrices = (assetIndex: number): { startPrice: number | null; endPrice: number | null } => {
    const asset = arena?.arenaAssets?.find(a => a.assetIndex === assetIndex);
    return {
      startPrice: asset?.startPrice ?? null,
      endPrice: asset?.endPrice ?? null,
    };
  };

  // Format price for display
  const formatPrice = (price: number | null): string => {
    if (price === null) return '-';
    if (price >= 1) return `$${price.toFixed(2)}`;
    if (price >= 0.01) return `$${price.toFixed(4)}`;
    return `$${price.toFixed(8)}`;
  };

  // Player card component
  const PlayerCard = ({ entry, showVolatility = true }: { entry: PlayerEntry; showVolatility?: boolean }) => {
    const profile = userProfiles[entry.playerWallet];
    const isCurrentUser = publicKey && entry.playerWallet === publicKey.toBase58();
    const playerIsWinner = isWinner(entry);
    const volatilityPercent = getAssetVolatility(entry.assetIndex); // Already in percent from API
    
    // Check if this player's token is currently leading
    const leadingAsset = getLeadingAsset();
    const isLeading = leadingAsset !== null && entry.assetIndex === leadingAsset && !playerIsWinner;
    
    // Flash effects from real-time stream
    const isFlashing = flashingAssets.has(entry.assetIndex);
    const isNewLeaderAsset = newLeader === entry.assetIndex;
    
    return (
      <div 
        className={`relative backdrop-blur-xl rounded-xl border overflow-hidden transition-all hover:scale-[1.01] ${
          isNewLeaderAsset
            ? 'bg-gradient-to-r from-amber-500/30 to-yellow-500/20 border-amber-400 shadow-lg shadow-amber-500/30 animate-pulse'
            : playerIsWinner 
              ? 'bg-gradient-to-r from-amber-500/15 to-yellow-500/10 border-amber-500/40 shadow-lg shadow-amber-500/10' 
              : isLeading
                ? 'bg-gradient-to-r from-sky-500/10 to-cyan-500/5 border-sky-500/40'
                : isCurrentUser 
                  ? 'bg-gradient-to-r from-white/8 to-white/4 border-white/20' 
                  : 'bg-white/5 border-white/10 hover:border-white/20'
        }`}
      >
        {/* New leader celebration effect */}
        {isNewLeaderAsset && (
          <>
            <div className="absolute inset-0 bg-gradient-to-r from-amber-500/0 via-amber-500/30 to-amber-500/0 animate-[shimmer_1s_ease-in-out_infinite] pointer-events-none" />
            <span className="absolute top-2 right-2 text-lg animate-bounce">🔥</span>
          </>
        )}
        {/* Winner badge for ended arenas */}
        {playerIsWinner && arena?.status === ArenaStatus.Ended && (
          <div className="absolute top-0 left-0 bg-gradient-to-r from-amber-400 to-yellow-400 text-gray-900 px-4 py-1.5 text-xs font-bold rounded-br-xl shadow-lg">
            WINNER
          </div>
        )}
        
        {/* Winning badge for live/active arenas (currently leading) */}
        {!playerIsWinner && isLeading && arena?.status === ArenaStatus.Active && (
          <div className="absolute top-0 left-0 bg-gradient-to-r from-sky-400 to-cyan-400 text-gray-900 px-4 py-1.5 text-xs font-bold rounded-br-xl shadow-lg">
            WINNING
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
            
            {/* Volatility (for live/active arenas) */}
            {showVolatility && arena?.status === ArenaStatus.Active && (
              <div className="text-center px-3">
                <p className={`font-bold transition-all duration-300 ${
                  isFlashing 
                    ? 'text-white text-xl scale-110' 
                    : `text-lg ${volatilityPercent > 0 ? 'text-green-400' : volatilityPercent < 0 ? 'text-red-400' : 'text-white/50'}`
                }`}>
                  {volatilityPercent > 0 ? '+' : ''}{volatilityPercent.toFixed(4)}%
                </p>
                <div className="flex items-center justify-center gap-1">
                  <p className="text-white/30 text-[10px] uppercase tracking-wider">Volatility</p>
                  {isStreamingVolatility && !useIndexerPrices && (
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Start/End Prices (for ended/canceled arenas - only after transition completes) */}
            {(displayedStatus === ArenaStatus.Ended || displayedStatus === ArenaStatus.Canceled) && (() => {
              const prices = getAssetPrices(entry.assetIndex);
              return (
                <div className="flex gap-4">
                  <div className="text-center px-2">
                    <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1">Start</p>
                    <p className="text-sm font-medium text-white/70">{formatPrice(prices.startPrice)}</p>
                  </div>
                  <div className="text-center px-2">
                    <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1">End</p>
                    <p className="text-sm font-medium text-white/70">{formatPrice(prices.endPrice)}</p>
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
              );
            })()}
            
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
              {playerIsWinner && arena?.status === ArenaStatus.Ended && (
                <p className={`text-xs mt-2 ${
                  volatilityPercent > 0 ? 'text-green-400/80' : volatilityPercent < 0 ? 'text-red-400/80' : 'text-white/30'
                }`}>
                  {volatilityPercent > 0 ? '+' : ''}{volatilityPercent.toFixed(4)}% volatility
                </p>
              )}
              {/* Show volatility for ended arenas (non-winners) */}
              {arena?.status === ArenaStatus.Ended && !playerIsWinner && (
                <p className={`text-sm mt-2 ${
                  volatilityPercent > 0 ? 'text-green-400/70' : volatilityPercent < 0 ? 'text-red-400/70' : 'text-white/30'
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
      {/* Background - Solid with gradient light effects */}
      <div className="fixed inset-0 pointer-events-none">
        {/* Light blue gradient orbs */}
        <div className="absolute top-[-15%] right-[5%] w-[700px] h-[700px] bg-cyan-400/15 rounded-full blur-[150px]" />
        <div className="absolute top-[30%] left-[-10%] w-[600px] h-[600px] bg-sky-400/12 rounded-full blur-[130px]" />
        <div className="absolute bottom-[0%] right-[30%] w-[500px] h-[500px] bg-blue-400/10 rounded-full blur-[120px]" />
        <div className="absolute top-[50%] left-[40%] w-[400px] h-[400px] bg-cyan-500/8 rounded-full blur-[140px]" />
        
        {/* Soft vignette */}
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
              {/* Starting Soon Banner - for Waiting arenas */}
              {arena.status === ArenaStatus.Waiting && (
                <div className="bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-amber-500/20 backdrop-blur-xl rounded-2xl border border-amber-500/30 p-6 mb-6 animate-pulse">
                  <div className="flex items-center justify-center gap-4">
                    {/* <svg className="w-8 h-8 text-amber-400 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg> */}
                    <div className="text-center">
                      <h2 
                        className="text-2xl text-amber-400 tracking-wider mb-1"
                        style={{ fontFamily: 'var(--font-ace-of-swords)' }}
                      >
                        ARENA STARTING SOON
                      </h2>
                      <p className="text-amber-400/70 text-sm">
                        The arena will begin automatically. Please wait...
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Arena Ending Banner - show when countdown reached 0 or in transition */}
              {(isArenaEnding || pendingEndedTransition) && (
                <div className="bg-gradient-to-r from-orange-500/20 via-amber-500/10 to-orange-500/20 backdrop-blur-xl rounded-2xl border border-orange-500/30 p-6 mb-6 animate-pulse">
                  <div className="flex items-center justify-center gap-4">
                    <svg className="w-8 h-8 text-orange-400 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <div className="text-center">
                      <h2 
                        className={`text-2xl text-orange-400 tracking-wider mb-1 ${aceOfSwords.className}`}
                      >
                        {pendingEndedTransition ? 'FINALIZING RESULTS' : 'ARENA ENDING'}
                      </h2>
                      <p className="text-orange-400/70 text-sm">
                        {pendingEndedTransition 
                          ? 'Calculating winner and final standings...' 
                          : 'Final prices are being locked in...'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Header */}
              <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-6 mb-6 relative">
                {/* Decorative glow - with overflow clipping */}
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
                        displayedStatus ?? arena.status, 
                        isArenaEnding || pendingEndedTransition ? 'Ending' : arena.statusLabel
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
                    
                    {/* Tooltip */}
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
                    isArenaEnding || pendingEndedTransition
                      ? 'bg-amber-500/10 border-amber-500/30'
                      : 'bg-white/5 border-white/5'
                  }`}>
                    {displayedStatus === ArenaStatus.Active || displayedStatus === null ? (
                      // Show countdown for active arenas
                      isArenaEnding || pendingEndedTransition ? (
                        <p className={`text-sm font-medium text-orange-400 animate-pulse ${aceOfSwords.className}`}>ARENA ENDING...</p>
                      ) : endCountdown !== null ? (
                        <>
                          <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1">Ends In</p>
                          <p className={`text-xl font-bold text-amber-400 tabular-nums ${aceOfSwords.className}`}>
                            {Math.floor(endCountdown / 60000).toString().padStart(2, '0')}:{Math.floor((endCountdown % 60000) / 1000).toString().padStart(2, '0')}
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

              {/* Chart Section - Show VolatilityChart for Active arenas (including ending/transition) */}
              {(displayedStatus === ArenaStatus.Active || displayedStatus === null) && arena.status !== ArenaStatus.Waiting && (
                <div className="mb-6">
                  {/* Header */}
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
                    <h3 className="text-white/50 text-sm uppercase tracking-wider font-medium">Live Battle</h3>
                    {useIndexerPrices && (
                      <span className="px-2 py-0.5 text-[10px] font-bold bg-orange-500/20 text-orange-400 rounded-full border border-orange-500/30">
                        FINAL PRICES
                      </span>
                    )}
                  </div>

                  {/* Volatility Chart - pass volatilityData for consistency with participant list */}
                  <VolatilityChart 
                    arenaId={arena.arenaId} 
                    height={350} 
                    refreshInterval={5000}
                    useIndexerPrices={useIndexerPrices}
                    externalVolatilityData={useIndexerPrices ? volatilityData : undefined}
                  />
                </div>
              )}

              {/* Chart Section - Show HexArenaChart for Ended/Canceled arenas */}
              {(displayedStatus === ArenaStatus.Ended || displayedStatus === ArenaStatus.Canceled) && (
                <div className="mb-6">
                  {/* Header */}
                  <div className="flex items-center gap-2 mb-4">
                    <h3 className="text-white/50 text-sm uppercase tracking-wider font-medium">Final Results</h3>
                  </div>

                  {/* Hex Chart - Pass final data from arenaAssets */}
                  <div className="flex justify-center overflow-x-auto pb-2">
                    <HexArenaChart 
                      size={550} 
                      data={arena.arenaAssets?.map(asset => ({
                        symbol: asset.assetSymbol,
                        assetIndex: asset.assetIndex,
                        volatility: asset.priceMovementRaw ? parseFloat(asset.priceMovementRaw) / 1000000 : 0,
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
                {displayedStatus === ArenaStatus.Ended && getWinners().length > 0 && (
                  <section>
                    <div className="flex items-center gap-3 mb-5">
                      <span className="text-lg">🏆</span>
                      <h2 className="text-lg font-bold text-white uppercase tracking-wider">
                        Winners
                      </h2>
                      <span className="text-white/40">({getWinners().length})</span>
                    </div>
                    <div className="space-y-3">
                      {getWinners().map((entry) => (
                        <PlayerCard key={entry.playerWallet} entry={entry} />
                      ))}
                    </div>
                  </section>
                )}

                {/* Live Standings - For active arenas (including ending/transition) */}
                {(displayedStatus === ArenaStatus.Active || displayedStatus === null) && arena.status !== ArenaStatus.Waiting && arena.playerCount > 0 && (
                  <section>
                    <div className="flex items-center gap-3 mb-5">
                      <div className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
                      <h2 className="text-lg font-bold text-white uppercase tracking-wider">
                        Live Standings
                      </h2>
                      <span className="text-white/40">({arena.playerCount})</span>
                      <span className="text-white/30 text-xs ml-2">Sorted by volatility</span>
                    </div>
                    <div className="space-y-3">
                      {getSortedParticipants().map((entry) => (
                        <PlayerCard 
                          key={entry.playerWallet} 
                          entry={entry} 
                          showVolatility={true}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {/* Other Participants - For ended arenas (losers) */}
                {displayedStatus === ArenaStatus.Ended && getLosers().length > 0 && (
                  <section>
                    <div className="flex items-center gap-3 mb-5">
                      <h2 className="text-lg font-bold text-white uppercase tracking-wider">
                        Other Participants
                      </h2>
                      <span className="text-white/40">({getLosers().length})</span>
                      <span className="text-white/30 text-xs ml-2">Sorted by volatility</span>
                    </div>
                    <div className="space-y-3">
                      {getLosers().map((entry) => (
                        <PlayerCard 
                          key={entry.playerWallet} 
                          entry={entry} 
                          showVolatility={false}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {/* Waiting participants - For waiting arenas */}
                {arena.status === ArenaStatus.Waiting && (
                  <section>
                    <div className="flex items-center gap-3 mb-5">
                      <h2 className="text-lg font-bold text-white uppercase tracking-wider">
                        Participants
                      </h2>
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
                          <PlayerCard 
                            key={entry.playerWallet} 
                            entry={entry} 
                            showVolatility={false}
                          />
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

