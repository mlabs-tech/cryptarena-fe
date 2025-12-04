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

  useEffect(() => {
    fetchArena();
    // Poll for updates every 15 seconds
    const interval = setInterval(fetchArena, 15000);
    return () => clearInterval(interval);
  }, [fetchArena]);

  if (!user) return null;

  // Get status badge
  const getStatusBadge = (status: number, statusLabel: string) => {
    const styles: Record<number, string> = {
      [ArenaStatus.Uninitialized]: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/40',
      [ArenaStatus.Waiting]: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
      [ArenaStatus.Ready]: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
      [ArenaStatus.Active]: 'bg-green-500/20 text-green-400 border-green-500/40 animate-pulse',
      [ArenaStatus.Ended]: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/40',
      [ArenaStatus.Suspended]: 'bg-red-500/20 text-red-400 border-red-500/40',
      [ArenaStatus.Starting]: 'bg-purple-500/20 text-purple-400 border-purple-500/40',
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

  // Get winners and losers
  const getWinners = () => {
    if (!arena || arena.winningAsset === null) return [];
    return arena.playerEntries.filter(p => p.assetIndex === arena.winningAsset);
  };

  const getLosers = () => {
    if (!arena || arena.winningAsset === null) return arena?.playerEntries || [];
    return arena.playerEntries.filter(p => p.assetIndex !== arena.winningAsset);
  };

  // Player card component
  const PlayerCard = ({ entry, rank }: { entry: PlayerEntry; rank: number }) => {
    const profile = userProfiles[entry.playerWallet];
    const isCurrentUser = publicKey && entry.playerWallet === publicKey.toBase58();
    const playerIsWinner = isWinner(entry);
    const winnings = calculateWinnings(entry);
    
    return (
      <div 
        className={`relative bg-white/5 backdrop-blur-md rounded-xl border overflow-hidden transition-all ${
          playerIsWinner 
            ? 'border-amber-500/50 bg-gradient-to-r from-amber-500/10 to-orange-500/10' 
            : isCurrentUser 
              ? 'border-blue-500/50' 
              : 'border-white/10'
        }`}
      >
        {/* Winner badge */}
        {playerIsWinner && (
          <div className="absolute top-0 right-0 bg-amber-500 text-gray-900 px-3 py-1 text-xs font-bold rounded-bl-lg">
            🏆 WINNER
          </div>
        )}
        
        <div className="p-4">
          <div className="flex items-center gap-4">
            {/* Rank */}
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
              playerIsWinner ? 'bg-amber-500 text-gray-900' : 'bg-white/10 text-white/60'
            }`}>
              {rank}
            </div>
            
            {/* Avatar */}
            {profile?.twitterProfilePicture ? (
              <Image
                src={profile.twitterProfilePicture}
                alt={profile.name || 'Player'}
                width={48}
                height={48}
                className="rounded-full"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-zinc-600 to-zinc-700 flex items-center justify-center text-white/60">
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
                      <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-[10px] font-bold border border-blue-500/40">
                        YOU
                      </span>
                    )}
                  </div>
                  <p className="text-white/40 text-xs font-mono">{formatWallet(entry.playerWallet)}</p>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-white/70 font-mono">{formatWallet(entry.playerWallet)}</span>
                  {isCurrentUser && (
                    <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-[10px] font-bold border border-blue-500/40">
                      YOU
                    </span>
                  )}
                </div>
              )}
            </div>
            
            {/* Token & Value */}
            <div className="text-right">
              <div className="flex items-center gap-2 justify-end">
                <span className={`px-3 py-1 rounded-lg text-sm font-bold ${
                  playerIsWinner 
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' 
                    : 'bg-white/10 text-white/80'
                }`}>
                  {entry.assetSymbol}
                </span>
              </div>
              <p className="text-white/60 text-sm mt-1">
                ${entry.usdValue.toFixed(2)} entry
              </p>
              {playerIsWinner && arena?.status === ArenaStatus.Ended && (
                <p className="text-green-400 text-sm font-bold mt-1">
                  +${(winnings - entry.usdValue).toFixed(2)} won
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={`fixed inset-0 overflow-hidden bg-[#0a0a0f] ${aceOfSwords.variable}`}>
      {/* Background */}
      <div className="absolute inset-0">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl animate-pulse delay-1000" />
        <div 
          className="absolute inset-0 opacity-[0.01]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='49' viewBox='0 0 28 49'%3E%3Cg fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M13.99 9.25l13 7.5v15l-13 7.5L1 31.75v-15l12.99-7.5zM3 17.9v12.7l10.99 6.34 11-6.35V17.9l-11-6.34L3 17.9zM0 15l12.98-7.5V0h-2v6.35L0 12.69v2.3zm0 18.5L12.98 41v8h-2v-6.85L0 35.81v-2.3zM15 0v7.5L27.99 15H28v-2.31h-.01L17 6.35V0h-2zm0 49v-8l12.99-7.5H28v2.31h-.01L17 42.15V49h-2z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />
      </div>
      
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/80 via-black/40 to-transparent z-[5]" />

      {/* Content */}
      <div className="relative z-10 flex flex-col h-full p-6 overflow-hidden">
        <Navbar />

        {/* Back button */}
        <button
          onClick={() => router.push('/arenas')}
          className="flex items-center gap-2 text-white/60 hover:text-white transition-colors mb-4 w-fit cursor-pointer"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Arenas
        </button>

        {/* Content */}
        <div className="flex-1 overflow-y-auto pr-2">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="flex flex-col items-center gap-4">
                <svg className="w-10 h-10 text-amber-400 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <p className="text-white/60">Loading arena...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-64">
              <div className="bg-red-500/10 backdrop-blur-md rounded-xl px-6 py-4 border border-red-500/30 text-center">
                <p className="text-red-400 text-lg mb-2">{error}</p>
                <button
                  onClick={() => router.push('/arenas')}
                  className="text-white/60 hover:text-white text-sm underline cursor-pointer"
                >
                  Go back to arenas
                </button>
              </div>
            </div>
          ) : arena && (
            <>
              {/* Header */}
              <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 p-6 mb-6">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <div className="flex items-center gap-4 mb-2">
                      <h1 
                        className="text-4xl text-white tracking-wide"
                        style={{ fontFamily: 'var(--font-ace-of-swords)' }}
                      >
                        ARENA #{arena.arenaId}
                      </h1>
                      {getStatusBadge(arena.status, arena.statusLabel)}
                    </div>
                    <p className="text-white/40 text-sm font-mono">{arena.pda}</p>
                  </div>
                  
                  {/* Pool */}
                  <div className="text-right">
                    <p className="text-white/50 text-sm uppercase tracking-wider">Total Pool</p>
                    <p className="text-4xl font-bold text-amber-400">${arena.totalPoolUsd.toFixed(0)}</p>
                  </div>
                </div>
                
                {/* Stats */}
                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-white/5 rounded-xl p-4 text-center">
                    <p className="text-white/50 text-xs uppercase mb-1">Players</p>
                    <p className="text-2xl font-bold text-white">{arena.playerCount}<span className="text-white/40">/10</span></p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-4 text-center">
                    <p className="text-white/50 text-xs uppercase mb-1">Tokens</p>
                    <p className="text-2xl font-bold text-white">{arena.assetCount}</p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-4 text-center">
                    <p className="text-white/50 text-xs uppercase mb-1">Started</p>
                    <p className="text-lg font-medium text-white/80">{formatTime(arena.startTimestamp)}</p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-4 text-center">
                    <p className="text-white/50 text-xs uppercase mb-1">Ended</p>
                    <p className="text-lg font-medium text-white/80">{formatTime(arena.endTimestamp)}</p>
                  </div>
                </div>
                
                {/* Winner Banner */}
                {arena.status === ArenaStatus.Ended && arena.winningAsset !== null && (
                  <div className="mt-6 bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-amber-500/20 rounded-xl p-4 border border-amber-500/30">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-3xl">🏆</span>
                        <div>
                          <p className="text-amber-400/80 text-xs uppercase tracking-wider">Winning Token</p>
                          <p className="text-2xl font-bold text-amber-400">
                            {TOKEN_SYMBOLS[arena.winningAsset] || `Token #${arena.winningAsset}`}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-amber-400/80 text-xs uppercase tracking-wider">{getWinners().length} Winner{getWinners().length !== 1 ? 's' : ''}</p>
                        <p className="text-xl font-bold text-green-400">
                          +${((arena.totalPoolUsd - getWinners().reduce((s, p) => s + p.usdValue, 0)) * 0.9).toFixed(2)} rewards
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Chart Section - Show for Active arenas */}
              {(arena.status === ArenaStatus.Active || arena.status === ArenaStatus.Starting || arena.status === ArenaStatus.Ending) && (
                <div className="mb-6">
                  {/* View Mode Toggle */}
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-white/60 text-sm uppercase tracking-wider">Live Battle</h3>
                    <div className="flex items-center gap-1 bg-white/5 backdrop-blur-sm rounded-lg p-1 border border-white/10">
                      <button
                        onClick={() => setChartView('standard')}
                        className={`px-3 py-2 text-xs font-medium rounded-md transition-all cursor-pointer ${
                          chartView === 'standard'
                            ? 'bg-amber-500/80 text-gray-900 shadow-lg'
                            : 'text-white/60 hover:text-white hover:bg-white/10'
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
                        className={`px-3 py-2 text-xs font-medium rounded-md transition-all cursor-pointer ${
                          chartView === 'hex'
                            ? 'bg-amber-500/80 text-gray-900 shadow-lg'
                            : 'text-white/60 hover:text-white hover:bg-white/10'
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
                        className={`px-3 py-2 text-xs font-medium rounded-md transition-all cursor-pointer ${
                          chartView === 'spaghetti'
                            ? 'bg-amber-500/80 text-gray-900 shadow-lg'
                            : 'text-white/60 hover:text-white hover:bg-white/10'
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
              <div className="space-y-6 pb-8">
                {/* Winners Section */}
                {arena.status === ArenaStatus.Ended && getWinners().length > 0 && (
                  <section>
                    <div className="flex items-center gap-3 mb-4">
                      <span className="text-2xl">🏆</span>
                      <h2 className="text-xl font-bold text-amber-400">
                        WINNERS
                        <span className="text-amber-400/40 font-normal ml-2">({getWinners().length})</span>
                      </h2>
                    </div>
                    <div className="space-y-3">
                      {getWinners().map((entry, idx) => (
                        <PlayerCard key={entry.playerWallet} entry={entry} rank={idx + 1} />
                      ))}
                    </div>
                  </section>
                )}

                {/* All Participants / Losers */}
                <section>
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-3 h-3 rounded-full ${arena.status === ArenaStatus.Ended ? 'bg-zinc-500' : 'bg-blue-500'}`} />
                    <h2 className="text-xl font-bold text-white">
                      {arena.status === ArenaStatus.Ended && getWinners().length > 0 ? 'OTHER PARTICIPANTS' : 'PARTICIPANTS'}
                      <span className="text-white/40 font-normal ml-2">
                        ({arena.status === ArenaStatus.Ended ? getLosers().length : arena.playerCount})
                      </span>
                    </h2>
                  </div>
                  
                  {arena.playerCount === 0 ? (
                    <div className="bg-white/5 backdrop-blur-md rounded-xl border border-white/10 p-8 text-center">
                      <p className="text-white/40 text-lg">No participants yet</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {(arena.status === ArenaStatus.Ended && getWinners().length > 0
                        ? getLosers()
                        : arena.playerEntries
                      ).map((entry, idx) => (
                        <PlayerCard 
                          key={entry.playerWallet} 
                          entry={entry} 
                          rank={arena.status === ArenaStatus.Ended && getWinners().length > 0 ? getWinners().length + idx + 1 : idx + 1} 
                        />
                      ))}
                    </div>
                  )}
                </section>
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

