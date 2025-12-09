'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useWallet, useWalletContext, useConnection } from '@/context/WalletContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import Navbar from '@/components/Navbar';
import { indexerApi, CurrentArenaResponse, PlayerCheckResponse } from '@/lib/indexer-api';
import { useCryptarena } from '@/hooks/useCryptarena';
import Image from 'next/image';
import localFont from 'next/font/local';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

// Format countdown time (mm:ss)
function formatCountdown(ms: number): { minutes: string; seconds: string } {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return {
    minutes: minutes.toString().padStart(2, '0'),
    seconds: seconds.toString().padStart(2, '0'),
  };
}

const aceOfSwords = localFont({
  src: '../../fonts/AceOfSwords-R9x9W.otf',
  variable: '--font-ace-of-swords',
});

// Token list with images - includes both Solana and EVM tokens
// All champions are unlocked (no balance requirements)
const TOKENS = [
  // Solana tokens (indices 0-13)
  { 
    name: 'Solana', 
    symbol: 'SOL', 
    index: 0,
    chainType: 'solana',
    image: 'https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/53645b0e-c1af-4785-5bee-788e0548bc00/public',
    imageAlt: 'https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/6e62d62c-c638-43a9-45ef-7b7c77063400/public'
  },
  { 
    name: 'Official Trump', 
    symbol: 'TRUMP', 
    index: 1,
    chainType: 'solana',
    image: 'https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/3e376b08-9941-489a-a985-70b0ff59ba00/public',
    imageAlt: 'https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/bad2d191-8df9-43b6-4a46-00b7a564fc00/public'
  },
  { 
    name: 'Pump.fun', 
    symbol: 'PUMP', 
    index: 2,
    chainType: 'solana',
    image: 'https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/7b8f0b51-d513-45ae-b363-007729824600/public',
    imageAlt: 'https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/1e6839a0-0bd7-40e5-b597-000ed113e600/public'
  },
  { 
    name: 'Bonk', 
    symbol: 'BONK', 
    index: 3,
    chainType: 'solana',
    image: 'https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/eef48f24-ce2b-4a48-8749-15372de88200/public',
    imageAlt: 'https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/5d0bf0e4-3e46-4c2c-0780-521f8871ba00/public'
  },
  { 
    name: 'Jupiter', 
    symbol: 'JUP', 
    index: 4,
    chainType: 'solana',
    image: 'https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/1e7a795f-3891-4292-10c2-6895db46c700/public',
    imageAlt: 'https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/94f91670-6b37-44a0-266a-795a2f2c4200/public'
  },
  { 
    name: 'Pudgy Penguin', 
    symbol: 'PENGU', 
    index: 5,
    chainType: 'solana',
    image: 'https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/34ccf0fe-8b70-432d-54fd-8491e1450500/public',
    imageAlt: 'https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/f9c695a9-0ed4-44dc-06c8-4c345f327000/public'
  },
  { 
    name: 'Pyth Network', 
    symbol: 'PYTH', 
    index: 6,
    chainType: 'solana',
    image: 'https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/4949f311-878d-4846-98dd-3c37956c9e00/public',
    imageAlt: 'https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/dc01a5f9-f706-4666-73fa-7975a9e78900/public'
  },
  { 
    name: 'Helium', 
    symbol: 'HNT', 
    index: 7,
    chainType: 'solana',
    image: 'https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/8fa845cb-d0f3-4b9f-bbdf-0a0db98d4b00/public',
    imageAlt: 'https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/d3aafc32-ffd0-4e5f-bf29-50b34a989400/public'
  },
  { 
    name: 'Fartcoin', 
    symbol: 'FARTCOIN', 
    index: 8,
    chainType: 'solana',
    image: 'https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/5a59acb7-320e-43c9-4338-255d27c55100/public',
    imageAlt: 'https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/bccba14b-e8d6-4a61-6f1a-109c5552d700/public'
  },
  { 
    name: 'Raydium', 
    symbol: 'RAY', 
    index: 9,
    chainType: 'solana',
    image: 'https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/1d46be69-859c-48b6-0944-db3a039f5f00/public',
    imageAlt: 'https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/53eb773b-364b-4248-5c60-4d0d35dfea00/public'
  },
  { 
    name: 'Jito', 
    symbol: 'JTO', 
    index: 10,
    chainType: 'solana',
    image: 'https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/f85c5172-9836-4baa-6bf0-e63a22039800/public',
    imageAlt: 'https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/35993580-89d1-487d-9a36-e55c77e72100/public'
  },
  { 
    name: 'Kamino', 
    symbol: 'KMNO', 
    index: 11,
    chainType: 'solana',
    image: 'https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/8be9163e-b761-4982-d9f4-b10bec5fd100/public',
    imageAlt: 'https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/5bb386d1-41a5-449d-8d72-b06641584600/public'
  },
  { 
    name: 'Meteora', 
    symbol: 'MET', 
    index: 12,
    chainType: 'solana',
    image: 'https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/cf0d3708-0f01-4fb9-8c77-eb2ce597d700/public',
    imageAlt: 'https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/7a45aa3d-9e01-40f3-6481-fdaa76926d00/public'
  },
  { 
    name: 'Wormhole', 
    symbol: 'W', 
    index: 13,
    chainType: 'solana',
    image: 'https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/d41f94d9-5d4b-4605-9af1-867f52cec400/public',
    imageAlt: 'https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/1e4bca1d-11e9-4ea6-166d-1587f86ede00/public'
  },
  // EVM tokens (indices 14-18)
  { 
    name: 'Ethereum', 
    symbol: 'ETH', 
    index: 14,
    chainType: 'evm',
    image: 'https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/57f1a06f-1d6b-4da5-07e1-b2cb741aac00/public',
    imageAlt: 'https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/57f1a06f-1d6b-4da5-07e1-b2cb741aac00/public'
  },
  { 
    name: 'Uniswap', 
    symbol: 'UNI', 
    index: 15,
    chainType: 'evm',
    image: 'https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/d6aad948-431b-47ce-51f0-106e53c0cf00/public',
    imageAlt: 'https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/d6aad948-431b-47ce-51f0-106e53c0cf00/public'
  },
  { 
    name: 'Chainlink', 
    symbol: 'LINK', 
    index: 16,
    chainType: 'evm',
    image: 'https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/62e43cd7-a536-4904-ffb3-fa05410eff00/public',
    imageAlt: 'https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/62e43cd7-a536-4904-ffb3-fa05410eff00/public'
  },
  { 
    name: 'Pepe', 
    symbol: 'PEPE', 
    index: 17,
    chainType: 'evm',
    image: 'https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/9049e18a-f653-4cb1-0b51-625f78429500/public',
    imageAlt: 'https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/9049e18a-f653-4cb1-0b51-625f78429500/public'
  },
  { 
    name: 'Shiba Inu', 
    symbol: 'SHIB', 
    index: 18,
    chainType: 'evm',
    image: 'https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/a8d779d6-a0d5-4233-f4e6-215ec0bfcf00/public',
    imageAlt: 'https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/a8d779d6-a0d5-4233-f4e6-215ec0bfcf00/public'
  },
];

function QueueMatchPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();
  const { enterArena, getEntryFee, isLoading: isEntering } = useCryptarena();
  
  const [selectedToken, setSelectedToken] = useState<string | null>(null);
  const [backgroundImage, setBackgroundImage] = useState<string>(
    'https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/ba74054b-26b7-4f47-949a-9f9a2edefc00/public'
  );
  const [bgImageLoaded, setBgImageLoaded] = useState(true);
  
  // SOL balance for entry fee check
  const [solBalance, setSolBalance] = useState<number>(0);
  const [entryFee, setEntryFee] = useState<number>(0.01); // Default entry fee in SOL
  
  // Transaction state
  const [txStatus, setTxStatus] = useState<'idle' | 'signing' | 'confirming' | 'success' | 'error'>('idle');
  const [txError, setTxError] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);

  // Arena state from indexer
  const [arenaData, setArenaData] = useState<CurrentArenaResponse | null>(null);
  const [playerCheck, setPlayerCheck] = useState<PlayerCheckResponse | null>(null);
  const [isLoadingArena, setIsLoadingArena] = useState(true);
  const [arenaError, setArenaError] = useState<string | null>(null);

  // User profiles for participants
  const [playerProfiles, setPlayerProfiles] = useState<Record<string, { name: string; twitterUsername: string; twitterProfilePicture: string | null } | null>>({});

  // Players count from real arena data
  const playersLocked = arenaData?.exists ? arenaData.arena?.playerEntries.length || 0 : 0;
  const totalPlayers = 10;
  const playersNeeded = totalPlayers - playersLocked;
  
  // Check if user is already in arena
  const userAlreadyInArena = playerCheck?.isInArena || false;

  // Countdown timer state
  const [countdownMs, setCountdownMs] = useState<number>(0);

  // Calculate countdown from arena data
  useEffect(() => {
    if (!arenaData?.exists || !arenaData.arena?.countdownEndsAt) {
      setCountdownMs(0);
      return;
    }

    const updateCountdown = () => {
      const endsAt = new Date(arenaData.arena!.countdownEndsAt!).getTime();
      const remaining = Math.max(0, endsAt - Date.now());
      setCountdownMs(remaining);
      
      // Redirect to arena page when countdown reaches 0
      if (remaining === 0 && arenaData.arena) {
        router.push(`/arenas/${arenaData.arena.arenaId}`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [arenaData, router]);

  const countdownTime = useMemo(() => formatCountdown(countdownMs), [countdownMs]);
  const hasCountdown = arenaData?.exists && arenaData.arena?.countdownEndsAt && countdownMs > 0;

  // Check if selected token is already taken in the current arena
  const isTokenTaken = useCallback((symbol: string): boolean => {
    if (!arenaData?.exists || !arenaData.arena?.playerEntries) return false;
    return arenaData.arena.playerEntries.some(p => p.assetSymbol === symbol);
  }, [arenaData]);

  // Fetch SOL balance and entry fee
  const fetchSolBalanceAndFee = useCallback(async () => {
    if (!publicKey || !connected) {
      setSolBalance(0);
      return;
    }

    try {
      const balance = await connection.getBalance(publicKey);
      setSolBalance(balance / LAMPORTS_PER_SOL);
      
      // Fetch current entry fee from program
      const fee = await getEntryFee();
      setEntryFee(fee);
    } catch (err) {
      console.error('Failed to fetch SOL balance:', err);
    }
  }, [publicKey, connected, connection, getEntryFee]);

  useEffect(() => {
    fetchSolBalanceAndFee();
  }, [fetchSolBalanceAndFee]);

  // Fetch current arena data from indexer
  const fetchArenaData = useCallback(async () => {
    setIsLoadingArena(true);
    setArenaError(null);
    
    try {
      const data = await indexerApi.getCurrentArena();
      setArenaData(data);
      
      // If wallet is connected, check if player is already in arena
      if (publicKey && connected) {
        try {
          const checkResult = await indexerApi.checkPlayerInCurrentArena(publicKey.toBase58());
          setPlayerCheck(checkResult);
        } catch (err) {
          console.warn('Could not check player status:', err);
        }
      }
    } catch (err) {
      console.error('Failed to fetch arena data:', err);
      setArenaError('Could not connect to arena service');
    } finally {
      setIsLoadingArena(false);
    }
  }, [publicKey, connected]);

  useEffect(() => {
    fetchArenaData();
    // Poll for updates every 10 seconds
    const interval = setInterval(fetchArenaData, 10000);
    return () => clearInterval(interval);
  }, [fetchArenaData]);

  // Fetch player profiles when arena data changes
  useEffect(() => {
    const fetchPlayerProfiles = async () => {
      if (!arenaData?.exists || !arenaData.arena?.playerEntries?.length) return;
      
      const wallets = arenaData.arena.playerEntries.map(p => p.playerWallet);
      const profiles: Record<string, { name: string; twitterUsername: string; twitterProfilePicture: string | null } | null> = {};
      
      await Promise.all(
        wallets.map(async (wallet) => {
          // Skip if we already have this profile
          if (playerProfiles[wallet] !== undefined) {
            profiles[wallet] = playerProfiles[wallet];
            return;
          }
          
          try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/wallets/public/user/${wallet}`);
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
      
      setPlayerProfiles(prev => ({ ...prev, ...profiles }));
    };
    
    fetchPlayerProfiles();
  }, [arenaData?.arena?.playerEntries]);

  if (!user) return null;

  const handleTokenSelect = (symbol: string) => {
    // Don't select if already taken
    if (isTokenTaken(symbol)) return;
    
    setSelectedToken(symbol);
    // Use token image as background with fade effect
    setBgImageLoaded(false);
    const token = TOKENS.find(t => t.symbol === symbol);
    if (token) {
      setBackgroundImage(token.image);
    }
  };

  // Handle LOCK IN button click
  const handleLockIn = async () => {
    if (!selectedToken) return;
    
    setTxStatus('signing');
    setTxError(null);
    setTxSignature(null);
    
    try {
      const result = await enterArena({
        tokenSymbol: selectedToken,
      });
      
      if (result.success && result.signature) {
        setTxStatus('success');
        setTxSignature(result.signature);
        // Refresh arena data after successful entry
        setTimeout(() => {
          fetchArenaData();
          fetchSolBalanceAndFee();
          setTxStatus('idle');
        }, 2000);
      } else {
        setTxStatus('error');
        setTxError(result.error || 'Transaction failed');
      }
    } catch (err) {
      setTxStatus('error');
      setTxError(err instanceof Error ? err.message : 'Transaction failed');
    }
  };

  // Check if user has sufficient SOL balance for entry fee + tx fee
  const hasInsufficientBalance = () => {
    // Need entry fee + ~0.01 SOL for tx fees and rent
    return solBalance < (entryFee + 0.01);
  };

  return (
    <div className={`fixed inset-0 overflow-hidden bg-[#222732] ${aceOfSwords.variable}`}>
      {/* Default background with gradient light effects (when no champion selected) */}
      {!selectedToken && (
        <div className="absolute inset-0 pointer-events-none">
          {/* Light blue gradient orbs */}
          <div className="absolute top-[-15%] right-[5%] w-[700px] h-[700px] bg-cyan-400/15 rounded-full blur-[150px]" />
          <div className="absolute top-[30%] left-[-10%] w-[600px] h-[600px] bg-sky-400/12 rounded-full blur-[130px]" />
          <div className="absolute bottom-[0%] right-[30%] w-[500px] h-[500px] bg-blue-400/10 rounded-full blur-[120px]" />
          <div className="absolute top-[50%] left-[40%] w-[400px] h-[400px] bg-cyan-500/8 rounded-full blur-[140px]" />
          
          {/* Soft vignette */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_0%,_rgba(34,39,50,0.5)_100%)]" />
        </div>
      )}

      {/* Champion Background Image (only when champion selected) */}
      {selectedToken && (
        <>
          <Image
            src={backgroundImage}
            alt="Arena Background"
            fill
            priority
            className={`object-cover object-center transition-opacity duration-700 ease-in-out scale-x-[-1] ${
              bgImageLoaded ? 'opacity-100' : 'opacity-0'
            }`}
            quality={100}
            key={backgroundImage}
            onLoad={() => setBgImageLoaded(true)}
          />
          {/* Dark overlay on background - 50% darker */}
          <div className="absolute inset-0 bg-black/30 z-[1]" />
        </>
      )}
      
      {/* Content */}
      <div className="relative z-10 flex flex-col h-full">
        {/* Top Section - Title, Players, Navbar */}
        <div className="px-6 pt-4">
          {/* Navbar - transparent like home page */}
          <Navbar transparent={true} />

          {/* Title */}
          <div className="text-center mb-4">
            <h1 
              className="text-white text-4xl tracking-[0.15em]"
              style={{ fontFamily: 'var(--font-ace-of-swords)' }}
            >
              PICK YOUR CHAMPION
            </h1>
          </div>

          {/* Player Slots Row - Clean Circular Design */}
          <div className="flex justify-center gap-4 mb-3">
            {Array.from({ length: totalPlayers }).map((_, idx) => {
              const players = arenaData?.arena?.playerEntries || [];
              const player = players[idx];
              const isLocked = idx < playersLocked;
              const isCurrentUser = player && publicKey && player.playerWallet === publicKey.toBase58();
              const profile = player ? playerProfiles[player.playerWallet] : null;
              
              return (
                <div 
                  key={idx}
                  className={`flex flex-col items-center transition-all duration-300 group ${
                    isLocked ? 'hover:scale-110 hover:z-10' : ''
                  }`}
                  style={{ width: '72px' }}
                >
                  {isLocked && player ? (
                    <>
                      {/* "You" label on top */}
                      {isCurrentUser && (
                        <span className="text-white font-bold text-xs mb-1 tracking-wide">You</span>
                      )}
                      {!isCurrentUser && <div className="h-4 mb-1" />}
                      
                      {/* Circular Avatar with ring */}
                      <div className="relative">
                        <div className={`w-14 h-14 rounded-full p-[3px] ${
                          isCurrentUser 
                            ? 'bg-gradient-to-b from-yellow-300 to-yellow-500' 
                            : 'bg-gradient-to-b from-zinc-400 to-zinc-600'
                        }`}>
                          <div className="w-full h-full rounded-full overflow-hidden bg-zinc-900">
                            {profile?.twitterProfilePicture ? (
                              <Image
                                src={profile.twitterProfilePicture}
                                alt={profile.name || 'Player'}
                                width={56}
                                height={56}
                                className="object-cover w-full h-full"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-700 to-zinc-800">
                                <svg className="w-7 h-7 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* Token Badge at bottom */}
                        <div className={`absolute -bottom-1 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded text-[10px] font-bold ${
                          isCurrentUser 
                            ? 'bg-zinc-900 text-white border border-yellow-400/50' 
                            : 'bg-zinc-900 text-white/80 border border-zinc-600'
                        }`}>
                          ${player.assetSymbol}
                        </div>
                      </div>
                      
                      {/* Username/Address below */}
                      <div className="mt-2 text-center truncate w-full">
                        {profile?.twitterUsername ? (
                          <span className={`text-[11px] font-medium truncate block ${
                            isCurrentUser ? 'text-white' : 'text-white/80'
                          }`}>
                            @{profile.twitterUsername.length > 9 ? profile.twitterUsername.slice(0, 8) + '..' : profile.twitterUsername}
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono text-white/50 truncate block">
                            {player.playerWallet.slice(0, 4)}..{player.playerWallet.slice(-3)}
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Empty slot - liquid glass effect (more visible when champion selected) */}
                      <div className="h-4 mb-1" />
                      <div className={`w-14 h-14 rounded-full border border-dashed flex items-center justify-center backdrop-blur-xl shadow-lg transition-all ${
                        selectedToken 
                          ? 'bg-white/20 border-white/30' 
                          : 'bg-white/5 border-white/20'
                      }`}>
                        <span className={`text-lg transition-all ${selectedToken ? 'text-white/50' : 'text-white/30'}`}>?</span>
                      </div>
                      <div className="mt-2 h-4" />
                    </>
                  )}
                  
                  {/* Simplified Tooltip on hover - only shows champion token */}
                  {isLocked && player && (
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none z-50 scale-95 group-hover:scale-100">
                      {/* Tooltip arrow pointing up */}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-[6px] border-transparent border-b-zinc-900/95"></div>
                      <div className="bg-zinc-900/95 backdrop-blur-md rounded-xl px-3 py-2.5 border border-zinc-700/80 shadow-xl min-w-[120px]">
                        {/* Profile Header */}
                        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-zinc-700/50">
                          {profile?.twitterProfilePicture ? (
                            <Image
                              src={profile.twitterProfilePicture}
                              alt={profile.name || 'Player'}
                              width={28}
                              height={28}
                              className="rounded-full"
                            />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center">
                              <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            {profile?.twitterUsername ? (
                              <p className="text-white text-xs font-medium truncate">@{profile.twitterUsername}</p>
                            ) : (
                              <p className="text-white/60 font-mono text-[10px] truncate">
                                {player.playerWallet.slice(0, 6)}...{player.playerWallet.slice(-4)}
                              </p>
                            )}
                          </div>
                        </div>
                        
                        {/* Only Champion info */}
                        <div className="flex justify-between items-center">
                          <span className="text-zinc-500 text-[10px]">Champion</span>
                          <span className="text-amber-400 font-bold text-xs">{player.assetSymbol}</span>
                        </div>
                        
                        {isCurrentUser && (
                          <div className="mt-2 pt-2 border-t border-zinc-700/50 text-center">
                            <span className="text-amber-400 text-[10px] font-medium">⭐ Your Entry</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Arena Status - Only show important messages */}
          {(isLoadingArena && !arenaData) || arenaError || !arenaData?.exists || userAlreadyInArena ? (
            <div className="flex justify-center">
              <div className="bg-white/10 backdrop-blur-md rounded-xl px-6 py-3 border border-white/20 shadow-lg">
                <div className="text-center">
                  {/* Only show loading on initial load, not on refreshes */}
                  {isLoadingArena && !arenaData ? (
                    <p className="text-white/60 text-sm flex items-center justify-center gap-2">
                      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Loading arena status...
                    </p>
                  ) : arenaError ? (
                    <p className="text-red-400 text-sm">{arenaError}</p>
                  ) : !arenaData?.exists ? (
                    <p className="text-amber-400 text-sm font-bold">Be the first to start a new arena!</p>
                  ) : userAlreadyInArena ? (
                    <p className="text-amber-400 text-sm font-bold">✓ You are in this arena!</p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {/* Countdown Timer - Liquid Glass Effect */}
          {hasCountdown && (
            <div className="absolute right-8 top-1/2 -translate-y-1/2 z-20">
              <div className="bg-white/10 backdrop-blur-xl rounded-3xl border border-white/20 shadow-2xl p-8 min-w-[280px]">
                {/* Subtle glow effect */}
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
                
                <div className="relative text-center">
                  <p 
                    className="text-white/60 text-sm uppercase tracking-[0.2em] mb-2"
                    style={{ fontFamily: 'var(--font-ace-of-swords)' }}
                  >
                    Arena Starts In
                  </p>
                  
                  {/* Big countdown display */}
                  <div className="flex items-center justify-center gap-3">
                    <div className="bg-white/10 backdrop-blur-sm rounded-xl px-6 py-4 border border-white/10 min-w-[140px]">
                      <span 
                        className="text-5xl font-bold text-white block text-center tabular-nums"
                        style={{ fontFamily: 'var(--font-ace-of-swords)' }}
                      >
                        {countdownTime.minutes}
                      </span>
                      <p className="text-white/40 text-xs uppercase tracking-wider mt-2 text-center">Min</p>
                    </div>
                    <span className="text-3xl text-white/40 font-light">:</span>
                    <div className="bg-white/10 backdrop-blur-sm rounded-xl px-6 py-4 border border-white/10 min-w-[140px]">
                      <span 
                        className="text-5xl font-bold text-white block text-center tabular-nums"
                        style={{ fontFamily: 'var(--font-ace-of-swords)' }}
                      >
                        {countdownTime.seconds}
                      </span>
                      <p className="text-white/40 text-xs uppercase tracking-wider mt-2 text-center">Sec</p>
                    </div>
                  </div>
                  
                  {/* Progress bar */}
                  <div className="mt-4 h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full transition-all duration-1000"
                      style={{ 
                        width: `${Math.max(0, (1 - countdownMs / (arenaData?.arena?.countdownDurationMs || 600000)) * 100)}%` 
                      }}
                    />
                  </div>
                  
                  <p className="text-white/40 text-xs mt-3">
                    {playersLocked} player{playersLocked !== 1 ? 's' : ''} in waiting room
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Middle Section - Arena Rules (always visible) */}
        <div className="flex-1 flex items-center px-8">
          {/* Arena Rules - Show when no champion selected */}
          {!selectedToken && (
            <div className="flex items-center justify-center gap-20 animate-fade-in w-full">
              {/* Rule 1 - Entry Fee */}
              <div className="flex flex-col items-center text-center group">
                <div className="w-24 h-24 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 flex items-center justify-center mb-4 group-hover:bg-white/10 transition-all group-hover:scale-105 shadow-lg">
                  <svg className="w-12 h-12 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p 
                  className="text-white text-2xl mb-2 tracking-wide"
                  style={{ fontFamily: 'var(--font-ace-of-swords)' }}
                >
                  Entry Fee
                </p>
                <p className="text-white/70 text-base">{entryFee} SOL</p>
                <p className="text-white/70 text-base">Fixed entry</p>
              </div>

              {/* Rule 2 - Players */}
              <div className="flex flex-col items-center text-center group">
                <div className="w-24 h-24 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 flex items-center justify-center mb-4 group-hover:bg-white/10 transition-all group-hover:scale-105 shadow-lg">
                  <svg className="w-12 h-12 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <p className="text-white text-2xl mb-2 tracking-wide">
                  <span className="font-bold">10</span>{' '}
                  <span style={{ fontFamily: 'var(--font-ace-of-swords)' }}>Players</span>
                </p>
                <p className="text-white/70 text-base">Battle royale</p>
                <p className="text-white/70 text-base">One winner takes all</p>
              </div>

              {/* Rule 3 - Rewards */}
              <div className="flex flex-col items-center text-center group">
                <div className="w-24 h-24 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 flex items-center justify-center mb-4 group-hover:bg-white/10 transition-all group-hover:scale-105 shadow-lg">
                  <svg className="w-12 h-12 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-white text-2xl mb-2 tracking-wide">
                  <span className="font-bold">90%</span>{' '}
                  <span style={{ fontFamily: 'var(--font-ace-of-swords)' }}>Winner</span>
                </p>
                <p className="text-white/70 text-base">of total pool</p>
                <p className="text-white/70 text-base">in SOL</p>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Section - Champions Grid + Lock In Button */}
        <div className="px-16 pb-8">
          {/* Token Selection Grid - Honeycomb Hexagon Layout */}
          <div className="flex flex-col items-center relative">
            {/* First row - 7 tokens */}
            <div className="flex justify-center" style={{ gap: '4px' }}>
              {TOKENS.slice(0, 7).map((token, index) => {
                const isTaken = isTokenTaken(token.symbol);
                
                return (
                <button
                  key={token.symbol}
                  onClick={() => handleTokenSelect(token.symbol)}
                  disabled={isTaken}
                  className={`group relative transition-all ${isTaken ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:scale-110 hover:z-10'}`}
                  style={{ width: '72px', height: '84px' }}
                >
                  {/* Main hexagon with simple liquid glass effect */}
                  <svg 
                    className={`absolute inset-0 w-full h-full transition-all ${
                      selectedToken === token.symbol 
                        ? 'drop-shadow-[0_0_12px_rgba(251,191,36,0.6)]' 
                        : isTaken
                          ? ''
                          : 'group-hover:drop-shadow-[0_0_8px_rgba(56,189,248,0.3)]'
                    }`}
                    viewBox="0 0 72 84"
                  >
                    {/* Glass fill */}
                    <polygon 
                      points="36,2 70,22 70,62 36,82 2,62 2,22" 
                      className={`transition-all ${
                        selectedToken === token.symbol
                          ? 'fill-amber-400/30'
                          : isTaken
                            ? 'fill-red-500/20'
                            : selectedToken
                              ? 'fill-white/20 group-hover:fill-white/25'
                              : 'fill-white/5 group-hover:fill-white/10'
                      }`}
                    />
                    {/* Border stroke */}
                    <polygon 
                      points="36,2 70,22 70,62 36,82 2,62 2,22" 
                      fill="none"
                      className={`transition-all ${
                        selectedToken === token.symbol
                          ? 'stroke-amber-400'
                          : isTaken
                            ? 'stroke-red-500/50'
                            : selectedToken
                              ? 'stroke-white/30 group-hover:stroke-amber-400/60'
                              : 'stroke-white/10 group-hover:stroke-amber-400/60'
                      }`}
                      strokeWidth="1.5"
                    />
                  </svg>
                  
                  {/* Content */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    {isTaken ? (
                      <>
                        <svg className="w-4 h-4 mb-0.5 text-red-400/70" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                        <span className="font-bold text-xs text-center leading-tight text-red-400/70">
                          {token.symbol}
                        </span>
                      </>
                    ) : (
                      <>
                        {/* Chain indicator for EVM tokens */}
                        {token.chainType === 'evm' && (
                          <span className="text-[8px] text-cyan-400 font-bold mb-0.5">EVM</span>
                        )}
                        <span className={`font-bold text-xs text-center leading-tight ${
                          selectedToken === token.symbol 
                            ? 'text-amber-400' 
                            : 'text-white/80 group-hover:text-amber-400'
                        }`}>
                          {token.symbol}
                        </span>
                      </>
                    )}
                  </div>
                  
                  {/* Selected indicator */}
                  {selectedToken === token.symbol && (
                    <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-5 h-5 bg-amber-400 rounded-full flex items-center justify-center shadow-lg border-2 border-amber-500">
                      <svg className="w-3 h-3 text-gray-900" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </button>
              );
              })}
            </div>
            
            {/* Second row - 7 tokens (offset for honeycomb tessellation) */}
            <div className="flex justify-center" style={{ gap: '4px', marginTop: '-17px', marginLeft: '77px' }}>
              {TOKENS.slice(7, 14).map((token, index) => {
                const isTaken = isTokenTaken(token.symbol);
                
                return (
                <button
                  key={token.symbol}
                  onClick={() => handleTokenSelect(token.symbol)}
                  disabled={isTaken}
                  className={`group relative transition-all ${isTaken ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:scale-110 hover:z-10'}`}
                  style={{ width: '72px', height: '84px' }}
                >
                  {/* Main hexagon */}
                  <svg 
                    className={`absolute inset-0 w-full h-full transition-all ${
                      selectedToken === token.symbol 
                        ? 'drop-shadow-[0_0_12px_rgba(251,191,36,0.6)]' 
                        : isTaken
                          ? ''
                          : 'group-hover:drop-shadow-[0_0_8px_rgba(56,189,248,0.3)]'
                    }`}
                    viewBox="0 0 72 84"
                  >
                    <polygon 
                      points="36,2 70,22 70,62 36,82 2,62 2,22" 
                      className={`transition-all ${
                        selectedToken === token.symbol
                          ? 'fill-amber-400/30'
                          : isTaken
                            ? 'fill-red-500/20'
                            : selectedToken
                              ? 'fill-white/20 group-hover:fill-white/25'
                              : 'fill-white/5 group-hover:fill-white/10'
                      }`}
                    />
                    <polygon 
                      points="36,2 70,22 70,62 36,82 2,62 2,22" 
                      fill="none"
                      className={`transition-all ${
                        selectedToken === token.symbol
                          ? 'stroke-amber-400'
                          : isTaken
                            ? 'stroke-red-500/50'
                            : selectedToken
                              ? 'stroke-white/30 group-hover:stroke-amber-400/60'
                              : 'stroke-white/10 group-hover:stroke-amber-400/60'
                      }`}
                      strokeWidth="1.5"
                    />
                  </svg>
                  
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    {isTaken ? (
                      <>
                        <svg className="w-4 h-4 mb-0.5 text-red-400/70" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                        <span className="font-bold text-xs text-center leading-tight text-red-400/70">
                          {token.symbol}
                        </span>
                      </>
                    ) : (
                      <>
                        {token.chainType === 'evm' && (
                          <span className="text-[8px] text-cyan-400 font-bold mb-0.5">EVM</span>
                        )}
                        <span className={`font-bold text-xs text-center leading-tight ${
                          selectedToken === token.symbol 
                            ? 'text-amber-400' 
                            : 'text-white/80 group-hover:text-amber-400'
                        }`}>
                          {token.symbol}
                        </span>
                      </>
                    )}
                  </div>
                  
                  {selectedToken === token.symbol && (
                    <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-5 h-5 bg-amber-400 rounded-full flex items-center justify-center shadow-lg border-2 border-amber-500">
                      <svg className="w-3 h-3 text-gray-900" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </button>
              );
              })}
            </div>

            {/* Third row - 5 EVM tokens (centered) */}
            <div className="flex justify-center" style={{ gap: '4px', marginTop: '-17px' }}>
              {TOKENS.slice(14, 19).map((token, index) => {
                const isTaken = isTokenTaken(token.symbol);
                
                return (
                <button
                  key={token.symbol}
                  onClick={() => handleTokenSelect(token.symbol)}
                  disabled={isTaken}
                  className={`group relative transition-all ${isTaken ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:scale-110 hover:z-10'}`}
                  style={{ width: '72px', height: '84px' }}
                >
                  <svg 
                    className={`absolute inset-0 w-full h-full transition-all ${
                      selectedToken === token.symbol 
                        ? 'drop-shadow-[0_0_12px_rgba(251,191,36,0.6)]' 
                        : isTaken
                          ? ''
                          : 'group-hover:drop-shadow-[0_0_8px_rgba(56,189,248,0.3)]'
                    }`}
                    viewBox="0 0 72 84"
                  >
                    <polygon 
                      points="36,2 70,22 70,62 36,82 2,62 2,22" 
                      className={`transition-all ${
                        selectedToken === token.symbol
                          ? 'fill-amber-400/30'
                          : isTaken
                            ? 'fill-red-500/20'
                            : selectedToken
                              ? 'fill-white/20 group-hover:fill-white/25'
                              : 'fill-white/5 group-hover:fill-white/10'
                      }`}
                    />
                    <polygon 
                      points="36,2 70,22 70,62 36,82 2,62 2,22" 
                      fill="none"
                      className={`transition-all ${
                        selectedToken === token.symbol
                          ? 'stroke-amber-400'
                          : isTaken
                            ? 'stroke-red-500/50'
                            : selectedToken
                              ? 'stroke-white/30 group-hover:stroke-amber-400/60'
                              : 'stroke-white/10 group-hover:stroke-amber-400/60'
                      }`}
                      strokeWidth="1.5"
                    />
                  </svg>
                  
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    {isTaken ? (
                      <>
                        <svg className="w-4 h-4 mb-0.5 text-red-400/70" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                        <span className="font-bold text-xs text-center leading-tight text-red-400/70">
                          {token.symbol}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-[8px] text-cyan-400 font-bold mb-0.5">EVM</span>
                        <span className={`font-bold text-xs text-center leading-tight ${
                          selectedToken === token.symbol 
                            ? 'text-amber-400' 
                            : 'text-white/80 group-hover:text-amber-400'
                        }`}>
                          {token.symbol}
                        </span>
                      </>
                    )}
                  </div>
                  
                  {selectedToken === token.symbol && (
                    <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-5 h-5 bg-amber-400 rounded-full flex items-center justify-center shadow-lg border-2 border-amber-500">
                      <svg className="w-3 h-3 text-gray-900" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </button>
              );
              })}
            </div>

            {/* LOCK IN Button - appears when champion is selected */}
            {selectedToken && (
              <div className="absolute right-0 bottom-0 animate-slide-in-right">
                {userAlreadyInArena ? (
                  <div className="bg-amber-500/20 text-amber-400 font-black text-xl px-10 py-5 rounded-2xl border-2 border-amber-500/50 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      ALREADY ENTERED
                    </div>
                    <p className="text-amber-400/70 text-xs mt-1 font-normal">
                      You entered with {playerCheck?.playerEntry?.assetSymbol}
                    </p>
                  </div>
                ) : txStatus === 'success' ? (
                  <div className="bg-amber-500/20 text-amber-400 font-black text-xl px-10 py-5 rounded-2xl border-2 border-amber-500/50 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      LOCKED IN!
                    </div>
                    {txSignature && (
                      <a 
                        href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-amber-400/70 text-xs mt-1 font-normal underline hover:text-amber-300"
                      >
                        View transaction ↗
                      </a>
                    )}
                  </div>
                ) : txStatus === 'error' ? (
                  <div className="space-y-2">
                    <div className="bg-red-500/20 text-red-400 font-bold text-sm py-3 px-4 rounded-xl border border-red-500/50 text-center max-w-[280px]">
                      {txError || 'Transaction failed'}
                    </div>
                    <button 
                      className="w-full bg-amber-400 hover:bg-amber-300 text-gray-900 font-black text-xl py-4 rounded-2xl transition-all cursor-pointer border-2 border-amber-500/50"
                      onClick={handleLockIn}
                    >
                      TRY AGAIN
                    </button>
                  </div>
                ) : !connected ? (
                  <button 
                    className="bg-zinc-600 text-zinc-300 font-black text-xl px-10 py-5 rounded-2xl border-2 border-zinc-500/50 cursor-not-allowed"
                    disabled
                  >
                    CONNECT WALLET
                  </button>
                ) : hasInsufficientBalance() ? (
                  <div className="space-y-2 text-center">
                    <button 
                      className="bg-red-500/20 text-red-400 font-black text-xl px-10 py-5 rounded-2xl border-2 border-red-500/50 cursor-not-allowed"
                      disabled
                    >
                      INSUFFICIENT SOL
                    </button>
                    <p className="text-red-400 text-xs">
                      Need {(entryFee + 0.01).toFixed(3)} SOL • You have {solBalance.toFixed(4)} SOL
                    </p>
                  </div>
                ) : txStatus === 'signing' || txStatus === 'confirming' || isEntering ? (
                  <button 
                    className="bg-amber-400/50 text-gray-900 font-black text-xl px-10 py-5 rounded-2xl border-2 border-amber-500/50 cursor-wait flex items-center justify-center gap-3"
                    disabled
                  >
                    <svg className="w-6 h-6 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    {txStatus === 'signing' ? 'APPROVE IN WALLET...' : 'CONFIRMING...'}
                  </button>
                ) : (
                  <div className="flex flex-col items-end gap-2">
                    <button 
                      className="bg-amber-400 hover:bg-amber-300 text-gray-900 font-black text-2xl px-12 py-5 rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer border-2 border-amber-500/50 shadow-lg shadow-amber-500/30"
                      style={{ fontFamily: 'var(--font-ace-of-swords)' }}
                      onClick={handleLockIn}
                    >
                      LOCK IN
                    </button>
                    <p className="text-white/60 text-xs">
                      Entry: {entryFee} SOL • Champion: <span className="text-amber-400 font-bold">{selectedToken}</span>
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function QueueMatch() {
  return (
    <ProtectedRoute>
      <QueueMatchPage />
    </ProtectedRoute>
  );
}
