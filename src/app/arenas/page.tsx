'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useWallet } from '@/context/WalletContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import Navbar from '@/components/Navbar';
import Image from 'next/image';
import localFont from 'next/font/local';

const aceOfSwords = localFont({
  src: '../../fonts/AceOfSwords-R9x9W.otf',
  variable: '--font-ace-of-swords',
});

// Indexer API
const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL || 'http://localhost:3001';

interface PlayerEntry {
  playerWallet: string;
  playerIndex: number;
  assetIndex: number;
  assetSymbol: string;
  tokenAmount: number;
  usdValue: number;
}

interface Arena {
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
  playerEntries?: PlayerEntry[];
}

// Status constants (matching on-chain program)
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

function ArenasPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { publicKey, connected } = useWallet();
  
  const [ongoingArenas, setOngoingArenas] = useState<Arena[]>([]);
  const [endedArenas, setEndedArenas] = useState<Arena[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch arenas from indexer
  const fetchArenas = useCallback(async () => {
    try {
      // Fetch all arenas
      const response = await fetch(`${INDEXER_URL}/api/v1/arenas?limit=50`);
      if (!response.ok) throw new Error('Failed to fetch arenas');
      
      const data = await response.json();
      const arenas: Arena[] = data.data || [];
      
      // Separate ongoing and ended
      const ongoing: Arena[] = [];
      const ended: Arena[] = [];
      
      arenas.forEach((arena: Arena) => {
        if (arena.status === ArenaStatus.Ended) {
          ended.push(arena);
        } else {
          ongoing.push(arena);
        }
      });
      
      // Sort: ongoing by newest first, ended by newest first
      ongoing.sort((a, b) => Number(b.arenaId) - Number(a.arenaId));
      ended.sort((a, b) => Number(b.arenaId) - Number(a.arenaId));
      
      setOngoingArenas(ongoing);
      setEndedArenas(ended);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch arenas:', err);
      setError('Could not connect to arena service');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchArenas();
    // Poll every 15 seconds
    const interval = setInterval(fetchArenas, 15000);
    return () => clearInterval(interval);
  }, [fetchArenas]);

  if (!user) return null;

  // Get status badge style
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
      <span className={`px-3 py-1 rounded-full text-xs font-bold border ${styles[status] || styles[ArenaStatus.Waiting]}`}>
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

  // Arena card component
  const ArenaCard = ({ arena, isOngoing }: { arena: Arena; isOngoing: boolean }) => {
    const isUserInArena = arena.playerEntries?.some(
      (entry) => publicKey && entry.playerWallet === publicKey.toBase58()
    );
    
    return (
      <div 
        className={`group relative bg-white/10 backdrop-blur-md rounded-2xl border overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:bg-white/15 cursor-pointer ${
          isUserInArena 
            ? 'border-amber-500/50 shadow-lg shadow-amber-500/10' 
            : 'border-white/20'
        }`}
        onClick={() => router.push(`/arenas/${arena.arenaId}`)}
      >
        {/* Gradient accent on top */}
        <div className={`h-1 w-full ${
          isOngoing 
            ? 'bg-gradient-to-r from-amber-500 via-orange-500 to-red-500' 
            : 'bg-gradient-to-r from-zinc-500 via-zinc-600 to-zinc-700'
        }`} />
        
        <div className="p-5">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h3 className="text-xl font-bold text-white">Arena #{arena.arenaId}</h3>
                {isUserInArena && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold border border-amber-500/40">
                    YOU
                  </span>
                )}
              </div>
              {getStatusBadge(arena.status, arena.statusLabel)}
            </div>
            
            {/* Pool Amount */}
            <div className="text-right">
              <p className="text-xs text-white/50 uppercase tracking-wider">Pool</p>
              <p className="text-2xl font-bold text-amber-400">
                ${arena.totalPoolUsd.toFixed(0)}
              </p>
            </div>
          </div>
          
          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-white/5 rounded-xl p-3 text-center">
              <p className="text-xs text-white/50 mb-1">Players</p>
              <p className="text-lg font-bold text-white">
                {arena.playerCount}<span className="text-white/40">/10</span>
              </p>
            </div>
            <div className="bg-white/5 rounded-xl p-3 text-center">
              <p className="text-xs text-white/50 mb-1">Tokens</p>
              <p className="text-lg font-bold text-white">{arena.assetCount}</p>
            </div>
            <div className="bg-white/5 rounded-xl p-3 text-center">
              <p className="text-xs text-white/50 mb-1">
                {isOngoing ? 'Ends' : 'Ended'}
              </p>
              <p className="text-sm font-medium text-white/80">
                {arena.endTimestamp ? formatTime(arena.endTimestamp) : '—'}
              </p>
            </div>
          </div>
          
          {/* Winner Badge (for ended arenas) */}
          {!isOngoing && arena.winningAsset !== null && (
            <div className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 rounded-xl p-3 border border-amber-500/30">
              <div className="flex items-center justify-between">
                <span className="text-xs text-amber-400/80 uppercase tracking-wider">Winning Token</span>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-amber-400">🏆</span>
                  <span className="text-white font-bold">
                    {/* Get token symbol from index */}
                    {['SOL', 'TRUMP', 'PUMP', 'BONK', 'JUP', 'PENGU', 'PYTH', 'HNT', 'FARTCOIN', 'RAY', 'JTO', 'KMNO', 'MET', 'W'][arena.winningAsset] || `Token #${arena.winningAsset}`}
                  </span>
                </div>
              </div>
            </div>
          )}
          
          {/* Progress bar for waiting arenas */}
          {isOngoing && arena.status === ArenaStatus.Waiting && (
            <div className="mt-2">
              <div className="flex items-center justify-between text-xs text-white/50 mb-1">
                <span>Filling up...</span>
                <span>{arena.playerCount}/10</span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all duration-500"
                  style={{ width: `${(arena.playerCount / 10) * 100}%` }}
                />
              </div>
            </div>
          )}
          
          {/* View Arrow */}
          <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
            <svg className="w-6 h-6 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={`fixed inset-0 overflow-hidden bg-[#0a0a0f] ${aceOfSwords.variable}`}>
      {/* Background Pattern */}
      <div className="absolute inset-0">
        {/* Animated gradient orbs */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-500/5 rounded-full blur-3xl" />
        
        {/* Hexagon pattern overlay */}
        <div 
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='49' viewBox='0 0 28 49'%3E%3Cg fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M13.99 9.25l13 7.5v15l-13 7.5L1 31.75v-15l12.99-7.5zM3 17.9v12.7l10.99 6.34 11-6.35V17.9l-11-6.34L3 17.9zM0 15l12.98-7.5V0h-2v6.35L0 12.69v2.3zm0 18.5L12.98 41v8h-2v-6.85L0 35.81v-2.3zM15 0v7.5L27.99 15H28v-2.31h-.01L17 6.35V0h-2zm0 49v-8l12.99-7.5H28v2.31h-.01L17 42.15V49h-2z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />
      </div>
      
      {/* Top gradient overlay */}
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/80 via-black/40 to-transparent z-[5]" />

      {/* Content */}
      <div className="relative z-10 flex flex-col h-full p-6 overflow-hidden">
        {/* Navbar */}
        <Navbar />

        {/* Page Title */}
        <div className="flex items-center justify-between mb-6 mt-2">
          <div>
            <h1 
              className="text-4xl text-white tracking-[0.1em]"
              style={{ fontFamily: 'var(--font-ace-of-swords)' }}
            >
              ARENAS
            </h1>
            <p className="text-white/50 text-sm mt-1">
              Browse ongoing battles and past victories
            </p>
          </div>
          
          {/* Quick stats */}
          <div className="flex items-center gap-4">
            <div className="bg-white/10 backdrop-blur-md rounded-xl px-5 py-3 border border-white/20">
              <p className="text-xs text-white/50 uppercase tracking-wider">Live Arenas</p>
              <p className="text-2xl font-bold text-green-400">{ongoingArenas.length}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-xl px-5 py-3 border border-white/20">
              <p className="text-xs text-white/50 uppercase tracking-wider">Completed</p>
              <p className="text-2xl font-bold text-white">{endedArenas.length}</p>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto pr-2 space-y-8 pb-8">
          {isLoading && !ongoingArenas.length && !endedArenas.length ? (
            <div className="flex items-center justify-center h-64">
              <div className="flex flex-col items-center gap-4">
                <svg className="w-10 h-10 text-amber-400 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <p className="text-white/60">Loading arenas...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-64">
              <div className="bg-red-500/10 backdrop-blur-md rounded-xl px-6 py-4 border border-red-500/30">
                <p className="text-red-400">{error}</p>
              </div>
            </div>
          ) : (
            <>
              {/* Ongoing Arenas Section */}
              <section>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
                  <h2 className="text-xl font-bold text-white">
                    ONGOING
                    <span className="text-white/40 font-normal ml-2">({ongoingArenas.length})</span>
                  </h2>
                </div>
                
                {ongoingArenas.length === 0 ? (
                  <div className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-8 text-center">
                    <p className="text-white/40 text-lg mb-2">No ongoing arenas</p>
                    <p className="text-white/30 text-sm">Start a new arena by clicking Ready Up!</p>
                    <button
                      onClick={() => router.push('/')}
                      className="mt-4 px-6 py-2 bg-amber-500 hover:bg-amber-400 text-gray-900 font-bold rounded-lg transition-all cursor-pointer"
                    >
                      Play Now
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {ongoingArenas.map((arena) => (
                      <ArenaCard key={arena.arenaId} arena={arena} isOngoing={true} />
                    ))}
                  </div>
                )}
              </section>

              {/* Ended Arenas Section */}
              <section>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-3 h-3 rounded-full bg-zinc-500" />
                  <h2 className="text-xl font-bold text-white">
                    ENDED
                    <span className="text-white/40 font-normal ml-2">({endedArenas.length})</span>
                  </h2>
                </div>
                
                {endedArenas.length === 0 ? (
                  <div className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-8 text-center">
                    <p className="text-white/40 text-lg">No completed arenas yet</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {endedArenas.map((arena) => (
                      <ArenaCard key={arena.arenaId} arena={arena} isOngoing={false} />
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Arenas() {
  return (
    <ProtectedRoute>
      <ArenasPage />
    </ProtectedRoute>
  );
}

