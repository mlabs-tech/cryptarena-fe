'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useWallet } from '@/context/WalletContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import Navbar from '@/components/Navbar';
import VolatilityChart from '@/components/VolatilityChart';
import HexArenaChart from '@/components/HexArenaChart';
import SpaghettiChart from '@/components/SpaghettiChart';
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
  tokenAmount: number;
  usdValue: number;
  entryPrice?: number;
  actualUsdValue?: number;
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
  Ready: 2,
  Active: 3,
  Ended: 4,
  Suspended: 5,
  Starting: 6,
  Ending: 7,
};

// Token symbols
const TOKEN_SYMBOLS = ['SOL', 'TRUMP', 'PUMP', 'BONK', 'JUP', 'PENGU', 'PYTH', 'HNT', 'FARTCOIN', 'RAY', 'JTO', 'KMNO', 'MET', 'W'];

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
    
    // For ended arenas, use the stored priceMovementBps (final volatility)
    if (arena.status === ArenaStatus.Ended) {
      const volatilityMap = new Map<number, number>();
      arena.arenaAssets.forEach(asset => {
        if (asset.priceMovementBps !== undefined && asset.priceMovementBps !== null) {
          // Convert from basis points to percentage
          volatilityMap.set(asset.assetIndex, asset.priceMovementBps / 100);
        }
      });
      setVolatilityData(volatilityMap);
      return;
    }
    
    // For active/starting/ending arenas, fetch live volatility data
    if (arena.status !== ArenaStatus.Active && 
        arena.status !== ArenaStatus.Starting && 
        arena.status !== ArenaStatus.Ending) {
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
      
      // Poll for updates every 5 seconds - fetch both arena data and volatility
      const interval = setInterval(() => {
        fetchArena(); // Refresh arena data (including status)
        fetchVolatilityData(); // Refresh volatility data
      }, 5000);
      
      return () => clearInterval(interval);
    }
  }, [arena, fetchVolatilityData, fetchArena]);

  // Update current time every second to re-evaluate time-based conditions
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  if (!user) return null;

  // Get status badge
  const getStatusBadge = (status: number, statusLabel: string) => {
    const styles: Record<number, string> = {
      [ArenaStatus.Uninitialized]: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/40',
      [ArenaStatus.Waiting]: 'bg-sky-500/20 text-sky-400 border-sky-500/40',
      [ArenaStatus.Ready]: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
      [ArenaStatus.Active]: 'bg-sky-500/20 text-sky-400 border-sky-500/40 animate-pulse',
      [ArenaStatus.Ended]: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/40',
      [ArenaStatus.Suspended]: 'bg-red-500/20 text-red-400 border-red-500/40',
      [ArenaStatus.Starting]: 'bg-sky-500/20 text-sky-400 border-sky-500/40',
      [ArenaStatus.Ending]: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
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

  // Calculate winnings
  const calculateWinnings = (entry: PlayerEntry) => {
    if (!arena || !isWinner(entry)) return 0;
    
    // Winners get their share of 90% of the pool
    const winnersCount = arena.playerEntries.filter(p => p.assetIndex === arena.winningAsset).length;
    const loserPool = arena.totalPoolUsd - arena.playerEntries.filter(p => p.assetIndex === arena.winningAsset).reduce((sum, p) => sum + p.usdValue, 0);
    const winnerShare = (loserPool * 0.9) / winnersCount;
    
    return entry.usdValue + winnerShare;
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

  // Player card component
  const PlayerCard = ({ entry, showVolatility = true }: { entry: PlayerEntry; showVolatility?: boolean }) => {
    const profile = userProfiles[entry.playerWallet];
    const isCurrentUser = publicKey && entry.playerWallet === publicKey.toBase58();
    const playerIsWinner = isWinner(entry);
    const winnings = calculateWinnings(entry);
    const volatilityPercent = getAssetVolatility(entry.assetIndex); // Already in percent from API
    
    // Check if this player's token is currently leading
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
        {/* Winner badge for ended arenas */}
        {playerIsWinner && arena?.status === ArenaStatus.Ended && (
          <div className="absolute top-0 left-0 bg-gradient-to-r from-amber-400 to-yellow-400 text-gray-900 px-4 py-1.5 text-xs font-bold rounded-br-xl shadow-lg">
            WINNER
          </div>
        )}
        
        {/* Winning badge for live/active arenas (currently leading) */}
        {!playerIsWinner && isLeading && (arena?.status === ArenaStatus.Active || arena?.status === ArenaStatus.Starting || arena?.status === ArenaStatus.Ending) && (
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
            {showVolatility && (arena?.status === ArenaStatus.Active || arena?.status === ArenaStatus.Ending) && (
              <div className="text-center px-3">
                <p className={`text-lg font-bold ${
                  volatilityPercent > 0 ? 'text-green-400' : volatilityPercent < 0 ? 'text-red-400' : 'text-white/50'
                }`}>
                  {volatilityPercent > 0 ? '+' : ''}{volatilityPercent.toFixed(2)}%
                </p>
                <p className="text-white/30 text-[10px] uppercase tracking-wider">Volatility</p>
              </div>
            )}
            
            {/* Token & Value */}
            <div className="text-right">
              <div className="flex items-center gap-2 justify-end">
                <span className={`px-3 py-1.5 rounded-lg text-sm font-bold ${
                  playerIsWinner 
                    ? 'bg-amber-400/20 text-amber-400 border border-amber-500/40' 
                    : isLeading
                      ? 'bg-sky-400/20 text-sky-400 border border-sky-500/40'
                      : 'bg-white/10 text-white/70 border border-white/5'
                }`}>
                  {entry.assetSymbol}
                </span>
              </div>
              {/* Token amount */}
              <p className="text-white/60 text-xs mt-1">
                {entry.tokenAmount.toFixed(6)} {entry.assetSymbol}
              </p>
              {/* Show actual USD value if available, otherwise show submitted value */}
              {entry.actualUsdValue ? (
                <>
                  <p className="text-white/40 text-sm mt-0.5">
                    ${entry.actualUsdValue.toFixed(2)} entry
                  </p>
                  <p className="text-white/20 text-[10px]">
                    (${entry.usdValue.toFixed(2)} locked)
                  </p>
                </>
              ) : (
                <p className="text-white/40 text-sm mt-0.5">
                  ${entry.usdValue.toFixed(2)} entry
                </p>
              )}
              {playerIsWinner && arena?.status === ArenaStatus.Ended && (
                <>
                  <p className="text-green-400 text-sm font-bold mt-1">
                    +${(winnings - entry.usdValue).toFixed(2)} won
                  </p>
                  <p className={`text-xs mt-0.5 ${
                    volatilityPercent > 0 ? 'text-green-400/80' : volatilityPercent < 0 ? 'text-red-400/80' : 'text-white/30'
                  }`}>
                    {volatilityPercent > 0 ? '+' : ''}{volatilityPercent.toFixed(2)}% volatility
                  </p>
                </>
              )}
              {/* Show volatility for ended arenas (non-winners) */}
              {arena?.status === ArenaStatus.Ended && !playerIsWinner && (
                <p className={`text-sm mt-1 ${
                  volatilityPercent > 0 ? 'text-green-400/70' : volatilityPercent < 0 ? 'text-red-400/70' : 'text-white/30'
                }`}>
                  {volatilityPercent > 0 ? '+' : ''}{volatilityPercent.toFixed(2)}%
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
                      {getStatusBadge(arena.status, arena.statusLabel)}
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
                      ${arena.totalPoolUsd.toFixed(0)}
                    </p>
                    
                    {/* Tooltip */}
                    <div className="absolute bottom-full right-0 mb-2 opacity-0 group-hover/pool:opacity-100 transition-opacity duration-200 pointer-events-none z-[9999]">
                      <div className="bg-zinc-900/95 backdrop-blur-md rounded-lg px-3 py-2 border border-zinc-700/80 shadow-xl whitespace-nowrap">
                        <p className="text-white text-xs">Calculated at current market prices</p>
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
                  <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 text-center border border-white/5">
                    {arena.status === ArenaStatus.Active || arena.status === ArenaStatus.Starting || arena.status === ArenaStatus.Ending ? (
                      // Check if end time is in the past
                      arena.endTimestamp && new Date(arena.endTimestamp) < currentTime ? (
                        <p className="text-sm font-medium text-orange-400 animate-pulse">ARENA IS ENDING</p>
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

              {/* Chart Section - Show for Active arenas */}
              {(arena.status === ArenaStatus.Active || arena.status === ArenaStatus.Starting || arena.status === ArenaStatus.Ending) && (
                <div className="mb-6">
                  {/* View Mode Toggle */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
                      <h3 className="text-white/50 text-sm uppercase tracking-wider font-medium">Live Battle</h3>
                    </div>
                    <div className="flex items-center gap-1 bg-white/5 backdrop-blur-xl rounded-xl p-1 border border-white/10">
                      <button
                        onClick={() => setChartView('standard')}
                        className={`px-4 py-2 text-xs font-medium rounded-lg transition-all cursor-pointer ${
                          chartView === 'standard'
                            ? 'bg-gradient-to-r from-amber-400 to-yellow-400 text-gray-900 shadow-lg shadow-amber-500/30'
                            : 'text-white/50 hover:text-white hover:bg-white/10'
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                          </svg>
                          Tracks
                        </span>
                      </button>
                      <button
                        onClick={() => setChartView('hex')}
                        className={`px-4 py-2 text-xs font-medium rounded-lg transition-all cursor-pointer ${
                          chartView === 'hex'
                            ? 'bg-gradient-to-r from-amber-400 to-yellow-400 text-gray-900 shadow-lg shadow-amber-500/30'
                            : 'text-white/50 hover:text-white hover:bg-white/10'
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                          </svg>
                          Hex
                        </span>
                      </button>
                      <button
                        onClick={() => setChartView('spaghetti')}
                        className={`px-4 py-2 text-xs font-medium rounded-lg transition-all cursor-pointer ${
                          chartView === 'spaghetti'
                            ? 'bg-gradient-to-r from-amber-400 to-yellow-400 text-gray-900 shadow-lg shadow-amber-500/30'
                            : 'text-white/50 hover:text-white hover:bg-white/10'
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                          </svg>
                          Lines
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Chart Display */}
                  {chartView === 'standard' && (
                    <VolatilityChart arenaId={arena.arenaId} height={350} refreshInterval={5000} />
                  )}
                  {chartView === 'hex' && (
                    <div className="flex justify-center overflow-x-auto pb-2">
                      <HexArenaChart arenaId={arena.arenaId} size={550} refreshInterval={5000} />
                    </div>
                  )}
                  {chartView === 'spaghetti' && (
                    <SpaghettiChart arenaId={arena.arenaId} height={450} refreshInterval={5000} />
                  )}
                </div>
              )}

              {/* Participants */}
              <div className="space-y-8 mt-10 pb-8">
                {/* Winners Section - Only for ended arenas */}
                {arena.status === ArenaStatus.Ended && getWinners().length > 0 && (
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

                {/* Live Standings - For active arenas */}
                {(arena.status === ArenaStatus.Active || arena.status === ArenaStatus.Starting || arena.status === ArenaStatus.Ending) && arena.playerCount > 0 && (
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
                {arena.status === ArenaStatus.Ended && getLosers().length > 0 && (
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

                {/* Waiting participants - For waiting/ready arenas */}
                {(arena.status === ArenaStatus.Waiting || arena.status === ArenaStatus.Ready) && (
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

