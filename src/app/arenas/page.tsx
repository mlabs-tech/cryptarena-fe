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
}

interface Arena {
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
  playerEntries?: PlayerEntry[];
}

// Status constants (matching new cryptarena-sol program)
const ArenaStatus = {
  Uninitialized: 0,
  Waiting: 1,
  Active: 2,
  Ended: 3,
  Canceled: 4,
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
      [ArenaStatus.Waiting]: 'bg-sky-500/20 text-sky-400 border-sky-500/40',
      [ArenaStatus.Active]: 'bg-sky-500/20 text-sky-400 border-sky-500/40 animate-pulse',
      [ArenaStatus.Ended]: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/40',
      [ArenaStatus.Canceled]: 'bg-red-500/20 text-red-400 border-red-500/40',
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
        className={`group relative backdrop-blur-xl rounded-2xl border transition-all duration-300 hover:scale-[1.02] cursor-pointer ${
          isUserInArena 
            ? 'bg-gradient-to-br from-amber-500/15 to-orange-500/10 border-amber-500/40 shadow-lg shadow-amber-500/20' 
            : isOngoing
              ? 'bg-white/5 border-sky-500/30 hover:border-sky-400/50 hover:shadow-lg hover:shadow-sky-500/10'
              : 'bg-white/5 border-white/10 hover:border-white/20'
        }`}
        onClick={() => router.push(`/arenas/${arena.arenaId}`)}
      >
        {/* Glowing top accent */}
        <div className={`h-1 w-full rounded-t-2xl overflow-hidden ${
          isOngoing 
            ? 'bg-sky-400' 
            : 'bg-zinc-600'
        }`} />
        
        <div className="relative p-5">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-xl font-bold text-white">Arena #{arena.arenaId}</h3>
                {isUserInArena && (
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-400 text-gray-900 text-[10px] font-bold shadow-lg shadow-amber-500/30">
                    YOU
                  </span>
                )}
              </div>
              {getStatusBadge(arena.status, arena.statusLabel)}
            </div>
            
            {/* Pool Amount */}
            <div className="text-right group/pool relative z-[60]">
              <p className="text-xs text-white/50 uppercase tracking-wider mb-1 flex items-center justify-end gap-1">
                Pool
                <svg className="w-3 h-3 text-white/30" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </p>
              <p className="text-2xl font-bold bg-gradient-to-r from-sky-400 to-cyan-300 bg-clip-text text-transparent">
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
          
          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-white/5 backdrop-blur-sm rounded-xl p-3 text-center border border-white/5">
              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Players</p>
              <p className="text-lg font-bold text-white">
                {arena.playerCount}<span className="text-white/30">/10</span>
              </p>
            </div>
            <div className="bg-white/5 backdrop-blur-sm rounded-xl p-3 text-center border border-white/5">
              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Tokens</p>
              <p className="text-lg font-bold text-white">{arena.assetCount}</p>
            </div>
            <div className="bg-white/5 backdrop-blur-sm rounded-xl p-3 text-center border border-white/5">
              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">
                {isOngoing ? 'Ends' : 'Ended'}
              </p>
              <p className="text-sm font-medium text-white/70">
                {arena.endTimestamp ? formatTime(arena.endTimestamp) : '—'}
              </p>
            </div>
          </div>
          
          {/* Winner Badge (for ended arenas) */}
          {!isOngoing && arena.winningAsset !== null && (
            <div className="bg-gradient-to-r from-amber-500/20 to-yellow-500/10 rounded-xl p-3 border border-amber-500/30">
              <div className="flex items-center justify-between">
                <span className="text-xs text-amber-300/80 uppercase tracking-wider font-medium">Winner</span>
                <div className="flex items-center gap-2">
                  <span className="text-lg">🏆</span>
                  <span className="text-amber-400 font-bold">
                    {['SOL', 'TRUMP', 'PUMP', 'BONK', 'JUP', 'PENGU', 'PYTH', 'HNT', 'FARTCOIN', 'RAY', 'JTO', 'KMNO', 'MET', 'W', 'ETH', 'UNI', 'LINK', 'PEPE', 'SHIB'][arena.winningAsset] || `Token #${arena.winningAsset}`}
                  </span>
                </div>
              </div>
            </div>
          )}
          
          {/* Progress bar for waiting arenas */}
          {isOngoing && arena.status === ArenaStatus.Waiting && (
            <div className="mt-2">
              <div className="flex items-center justify-between text-xs text-white/40 mb-1.5">
                <span>Filling up...</span>
                <span className="text-amber-400 font-medium">{arena.playerCount}/10</span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-400 rounded-full transition-all duration-500 shadow-sm shadow-amber-500/50"
                  style={{ width: `${(arena.playerCount / 10) * 100}%` }}
                />
              </div>
            </div>
          )}
          
          {/* View Arrow */}
          <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-all duration-200 transform group-hover:translate-x-1">
            <svg className="w-6 h-6 text-amber-400/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
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
      
      {/* Top gradient overlay */}
      <div className="fixed inset-x-0 top-0 h-40 bg-gradient-to-b from-[#222732]/90 via-[#222732]/50 to-transparent z-[5] pointer-events-none" />

      {/* Content */}
      <div className="relative z-10 p-6">
        {/* Navbar */}
        <Navbar />

        {/* Page Title */}
        <div className="mb-8 mt-2">
          <h1 
            className="text-4xl text-white tracking-[0.15em] mb-2"
            style={{ fontFamily: 'var(--font-ace-of-swords)' }}
          >
            ARENAS
          </h1>
          <p className="text-white/40 text-sm">
            Browse ongoing battles and past victories
          </p>
        </div>

        {/* Content */}
        <div className="space-y-10 pb-8">
          {isLoading && !ongoingArenas.length && !endedArenas.length ? (
            <div className="flex items-center justify-center h-64">
              <div className="flex flex-col items-center gap-4 bg-white/5 backdrop-blur-xl px-10 py-8 rounded-2xl border border-white/10">
                <div className="relative">
                  <div className="w-12 h-12 rounded-full border-4 border-sky-500/20 border-t-sky-400 animate-spin" />
                  <div className="absolute inset-0 w-12 h-12 rounded-full border-4 border-cyan-500/20 border-b-cyan-400 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
                </div>
                <p className="text-white/50 font-medium">Loading arenas...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-64">
              <div className="bg-red-500/10 backdrop-blur-xl rounded-2xl px-8 py-5 border border-red-500/30">
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-red-400">{error}</p>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Ongoing Arenas Section */}
              <section>
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
                  <h2 className="text-lg font-bold text-white uppercase tracking-wider">
                    Ongoing
                  </h2>
                  <span className="text-white/40 font-normal">({ongoingArenas.length})</span>
                </div>
                
                {ongoingArenas.length === 0 ? (
                  <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-10 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-sky-500/20 flex items-center justify-center">
                      <svg className="w-8 h-8 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                    </div>
                    <p className="text-white/60 text-lg mb-2">No ongoing arenas</p>
                    <p className="text-white/30 text-sm mb-5">Start a new arena by clicking Ready Up!</p>
                    <button
                      onClick={() => router.push('/')}
                      className="px-8 py-3 bg-gradient-to-r from-amber-400 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-gray-900 font-bold rounded-xl transition-all cursor-pointer shadow-lg shadow-amber-500/30 hover:shadow-amber-500/50 hover:scale-105"
                    >
                      READY UP
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {ongoingArenas.map((arena) => (
                      <ArenaCard key={arena.arenaId} arena={arena} isOngoing={true} />
                    ))}
                  </div>
                )}
              </section>

              {/* Ended Arenas Section */}
              <section>
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-2 h-2 rounded-full bg-zinc-500" />
                  <h2 className="text-lg font-bold text-white uppercase tracking-wider">
                    Ended
                  </h2>
                  <span className="text-white/40 font-normal">({endedArenas.length})</span>
                </div>
                
                {endedArenas.length === 0 ? (
                  <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-10 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
                      <svg className="w-8 h-8 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <p className="text-white/40 text-lg">No completed arenas yet</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
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

