'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useWallet, useWalletContext, useConnection } from '@/context/WalletContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import Navbar from '@/components/Navbar';
import { api, CryptoCoin } from '@/lib/api';
import { indexerApi, CurrentArenaResponse, PlayerCheckResponse, PlayerEntry } from '@/lib/indexer-api';
import { useCryptarena } from '@/hooks/useCryptarena';
import Image from 'next/image';
import localFont from 'next/font/local';
import { PublicKey, Connection, clusterApiUrl } from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token';

// Fallback RPC if Helius gets rate limited
const FALLBACK_RPC = clusterApiUrl('devnet');

const aceOfSwords = localFont({
  src: '../../fonts/AceOfSwords-R9x9W.otf',
  variable: '--font-ace-of-swords',
});

// Token list with devnet mint addresses
const TOKENS = [
  { name: 'Solana', symbol: 'SOL', mint: '7a1eh57mbAvEHevFhsofrGYgGPiNBpwwPzQu4KU85EXe' },
  { name: 'Official Trump', symbol: 'TRUMP', mint: '5aTAebL8dn3s4SFDLaMTC866XomLCJ4vY1Z1VTEALSdh' },
  { name: 'Pump.fun', symbol: 'PUMP', mint: 'K3vfcZbYhEuEHG6woBVpShURxnVxavhgyP16VM9zChS' },
  { name: 'Bonk', symbol: 'BONK', mint: 'DkHvWT5Ayk9ciWhz7FU48A2MdEwZekuRdaYVUGtjZdYB' },
  { name: 'Jupiter', symbol: 'JUP', mint: 'E1JEPG4CcK2AHh3s6FFSHBjdzBqBcYjttL4GBHQGKNGS' },
  { name: 'Pudgy Penguin', symbol: 'PENGU', mint: 'BhhivFuau4RFEPTwrdvhzvSQuyezc8nJW8vPsBDoLruz' },
  { name: 'Pyth Network', symbol: 'PYTH', mint: 'Cm8Z4DsQ4SP7zc3FTcTHpzyZ8hMR1adiDSG7Hf45dFMt' },
  { name: 'Helium', symbol: 'HNT', mint: '8dbowGCfdiL7x3tzuKJfbc4WPpHdqRqsHEeqfd5Wh7xn' },
  { name: 'Fartcoin', symbol: 'FARTCOIN', mint: '2yaeL5SPximYfKHJMvhsaFfmcoA3XUMcKd7buuq7sFnz' },
  { name: 'Raydium', symbol: 'RAY', mint: 'Dx67K9UyaHsPy7shTmuC4xuHvKGFcSpfzBQQNEgP3Fcf' },
  { name: 'Jito', symbol: 'JTO', mint: 'ChMDp2sBn23Zyu2YtGU7M6hQUJzMmMdZ6XmWpsrxRKEr' },
  { name: 'Kamino', symbol: 'KMNO', mint: '2byoKnAGKFFRKcmrxJ7FeizXH1pw2tqN38E7dLs7ogvg' },
  { name: 'Meteora', symbol: 'MET', mint: '4YHdgCq49res2mKd4EUBFtk2krmzt3RLaSUVVkgwMH36' },
  { name: 'Wormhole', symbol: 'W', mint: 'H9wd9H5wAVXBpsf9VtRKMXtSeUGNWHk33UkywWNvWjDi' },
];

// Champion background images
const CHAMP_BACKGROUNDS = [
  '/champs/Gemini_Generated_Image_3ed8h33ed8h33ed8 2.png',
  '/champs/Gemini_Generated_Image_4u4cbi4u4cbi4u4c 2.png',
  '/champs/Gemini_Generated_Image_k8useqk8useqk8us 2.png',
  '/champs/Gemini_Generated_Image_ntqtgontqtgontqt 2.png',
  '/champs/Gemini_Generated_Image_ve6l94ve6l94ve6l 2.png',
  '/champs/Gemini_Generated_Image_zb7ejpzb7ejpzb7e 1.png',
];

// Format large numbers (e.g., market cap)
function formatMarketCap(value: number): string {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

function QueueMatchPage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { publicKey, connected, disconnect } = useWallet();
  const { connection } = useConnection();
  const { currentLinkedWallet } = useWalletContext();
  const { enterArena, isLoading: isEntering } = useCryptarena();
  
  const [selectedToken, setSelectedToken] = useState<string | null>(null);
  const [coinData, setCoinData] = useState<CryptoCoin | null>(null);
  const [isLoadingCoin, setIsLoadingCoin] = useState(false);
  const [showLoadingIndicator, setShowLoadingIndicator] = useState(false);
  const [coinError, setCoinError] = useState<string | null>(null);
  const [backgroundImage, setBackgroundImage] = useState<string>(
    'https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/ba74054b-26b7-4f47-949a-9f9a2edefc00/public'
  );
  const [bgImageLoaded, setBgImageLoaded] = useState(true);
  
  // Token balances - maps symbol to balance (0 means locked)
  const [tokenBalances, setTokenBalances] = useState<Record<string, number>>({});
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);
  
  // Amount input state
  const [usdAmount, setUsdAmount] = useState<string>('');
  
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

  // Fetch coin data when token is selected
  useEffect(() => {
    if (!selectedToken) {
      setCoinData(null);
      setCoinError(null);
      setIsLoadingCoin(false);
      setShowLoadingIndicator(false);
      return;
    }

    let loadingTimeout: NodeJS.Timeout;
    let isCancelled = false;

    const fetchCoinData = async () => {
      setIsLoadingCoin(true);
      setCoinError(null);
      
      loadingTimeout = setTimeout(() => {
        if (!isCancelled) {
          setShowLoadingIndicator(true);
        }
      }, 500);
      
      try {
        const data = await api.getCoinBySymbol(selectedToken);
        if (!isCancelled) {
          setCoinData(data);
        }
      } catch (error) {
        console.error('Failed to fetch coin data:', error);
        if (!isCancelled) {
          setCoinError('Failed to load coin data');
          const token = TOKENS.find(t => t.symbol === selectedToken);
          if (token) {
            setCoinData({
              symbol: token.symbol,
              name: token.name,
              currentPrice: 0,
              marketCap: 0,
              percentChange24h: 0,
              lastUpdated: Date.now(),
            });
          }
        }
      } finally {
        if (!isCancelled) {
          clearTimeout(loadingTimeout);
          setIsLoadingCoin(false);
          setShowLoadingIndicator(false);
        }
      }
    };

    fetchCoinData();

    return () => {
      isCancelled = true;
      clearTimeout(loadingTimeout);
    };
  }, [selectedToken]);

  // Fetch token balances when wallet is connected (batched for Helius rate limit)
  const fetchTokenBalances = useCallback(async () => {
    if (!publicKey || !connected || !connection) {
      setTokenBalances({});
      return;
    }

    setIsLoadingBalances(true);

    // Helper to fetch a single token balance
    const fetchSingleBalance = async (token: typeof TOKENS[0], conn: Connection) => {
      try {
        const mintPubkey = new PublicKey(token.mint);
        const ata = await getAssociatedTokenAddress(mintPubkey, publicKey);
        
        try {
          const accountInfo = await getAccount(conn, ata);
          return { symbol: token.symbol, balance: Number(accountInfo.amount) };
        } catch {
          // Account doesn't exist, balance is 0
          return { symbol: token.symbol, balance: 0 };
        }
      } catch (err) {
        console.error(`Error fetching balance for ${token.symbol}:`, err);
        return { symbol: token.symbol, balance: 0 };
      }
    };

    try {
      // Batch tokens into groups of 7 to stay under Helius 10 req/s limit
      const BATCH_SIZE = 7;
      const batches: typeof TOKENS[] = [];
      for (let i = 0; i < TOKENS.length; i += BATCH_SIZE) {
        batches.push(TOKENS.slice(i, i + BATCH_SIZE));
      }

      const allResults: { symbol: string; balance: number }[] = [];
      let useFallback = false;

      for (const batch of batches) {
        try {
          const conn = useFallback ? new Connection(FALLBACK_RPC) : connection;
          const batchResults = await Promise.all(
            batch.map(token => fetchSingleBalance(token, conn))
          );
          allResults.push(...batchResults);
        } catch (err) {
          // If rate limited, switch to fallback and retry this batch
          if (!useFallback) {
            console.warn('Helius rate limited, switching to public devnet RPC');
            useFallback = true;
            const fallbackConn = new Connection(FALLBACK_RPC);
            const batchResults = await Promise.all(
              batch.map(token => fetchSingleBalance(token, fallbackConn))
            );
            allResults.push(...batchResults);
          }
        }
      }

      const balances: Record<string, number> = {};
      allResults.forEach(({ symbol, balance }) => {
        balances[symbol] = balance;
      });
      
      setTokenBalances(balances);
    } finally {
      setIsLoadingBalances(false);
    }
  }, [publicKey, connected, connection]);

  useEffect(() => {
    fetchTokenBalances();
  }, [fetchTokenBalances]);

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
    setSelectedToken(symbol);
    // Pick a random background image with fade effect
    setBgImageLoaded(false);
    const randomIndex = Math.floor(Math.random() * CHAMP_BACKGROUNDS.length);
    setBackgroundImage(CHAMP_BACKGROUNDS[randomIndex]);
  };

  // Handle LOCK IN button click
  const handleLockIn = async () => {
    if (!selectedToken || !usdAmount || !coinData) return;
    
    const usd = parseFloat(usdAmount);
    if (usd < 10 || usd > 20) return;
    
    const tokenAmt = usd / coinData.currentPrice;
    
    setTxStatus('signing');
    setTxError(null);
    setTxSignature(null);
    
    try {
      const result = await enterArena({
        tokenSymbol: selectedToken,
        tokenAmount: tokenAmt,
        usdValue: usd,
      });
      
      if (result.success && result.signature) {
        setTxStatus('success');
        setTxSignature(result.signature);
        // Refresh arena data after successful entry
        setTimeout(() => {
          fetchArenaData();
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

  // Calculate token amount from USD
  const tokenAmount = coinData && coinData.currentPrice > 0 && usdAmount
    ? (parseFloat(usdAmount) / coinData.currentPrice).toFixed(6)
    : '0.00';

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
            className={`object-cover object-center transition-opacity duration-700 ease-in-out ${
              bgImageLoaded ? 'opacity-100' : 'opacity-0'
            }`}
            quality={100}
            key={backgroundImage}
            onLoad={() => setBgImageLoaded(true)}
          />
          {/* Dark overlay on background - 50% darker */}
          <div className="absolute inset-0 bg-black/60 z-[1]" />
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
                  
                  {/* Tooltip on hover - appears below */}
                  {isLocked && player && (
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none z-50 scale-95 group-hover:scale-100">
                      {/* Tooltip arrow pointing up */}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-[6px] border-transparent border-b-zinc-900/95"></div>
                      <div className="bg-zinc-900/95 backdrop-blur-md rounded-xl px-3 py-2.5 border border-zinc-700/80 shadow-xl min-w-[160px]">
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
                        
                        {/* Stats */}
                        <div className="space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="text-zinc-500 text-[10px]">Champion</span>
                            <span className="text-amber-400 font-bold text-xs">{player.assetSymbol}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-zinc-500 text-[10px]">Locked</span>
                            <span className="text-green-400 font-medium text-xs">${player.usdValue.toFixed(2)}</span>
                          </div>
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

          {/* Arena Status & Waiting text - Glass card */}
          <div className="flex justify-center">
            <div className="bg-white/10 backdrop-blur-md rounded-xl px-6 py-3 border border-white/20 shadow-lg">
              <div className="text-center space-y-1">
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
                  <div>
                    <p className="text-amber-400 text-sm font-bold">Be the first to start a new arena!</p>
                    <p className="text-white/70 text-xs">Arena #{arenaData?.nextArenaId || '1'} waiting for players</p>
                  </div>
                ) : userAlreadyInArena ? (
                  <div>
                    <p className="text-amber-400 text-sm font-bold">✓ You are in this arena!</p>
                    <p className="text-white/70 text-xs">
                      Waiting for <span className="text-amber-300 font-bold">{playersNeeded}</span> more player{playersNeeded !== 1 ? 's' : ''}...
                    </p>
                  </div>
                ) : (
                  <p className="text-white/70 text-sm">
                    Waiting for <span className="text-amber-300 font-bold">{playersNeeded}</span> more player{playersNeeded !== 1 ? 's' : ''}...
                  </p>
                )}
                
                {/* Arena ID indicator */}
                {arenaData?.exists && arenaData.arena && (
                  <p className="text-white/50 text-[10px] font-mono">
                    Arena #{arenaData.arena.arenaId} • {arenaData.arena.statusLabel}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Middle Section - Entry Form or Arena Rules */}
        <div className="flex-1 flex items-center px-8">
          {/* Arena Rules - Show when no champion selected */}
          {!selectedToken && (
            <div className="flex items-center justify-center gap-20 animate-fade-in w-full">
              {/* Rule 1 - Lock in value */}
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
                  Lock-in Value
                </p>
                <p className="text-white/70 text-base">$10 - $20 worth</p>
                <p className="text-white/70 text-base">of tokens</p>
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

              {/* Rule 3 - Timeframe */}
              <div className="flex flex-col items-center text-center group">
                <div className="w-24 h-24 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 flex items-center justify-center mb-4 group-hover:bg-white/10 transition-all group-hover:scale-105 shadow-lg">
                  <svg className="w-12 h-12 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-white text-2xl mb-2 tracking-wide">
                  <span className="font-bold">~48</span>{' '}
                  <span style={{ fontFamily: 'var(--font-ace-of-swords)' }}>Hours</span>
                </p>
                <p className="text-white/70 text-base">Starts after 10th</p>
                <p className="text-white/70 text-base">player joins</p>
              </div>
            </div>
          )}

          {/* Entry Form (shows when token selected) */}
          {selectedToken && coinData && (
            <div className="w-[420px] min-w-[420px] ml-auto">
              <div className="animate-slide-in-right">
                <div className="bg-white/20 backdrop-blur-md rounded-3xl p-8 border border-white/30 shadow-2xl">
                  <h3 
                    className="text-white text-3xl mb-4 tracking-wide truncate"
                    style={{ fontFamily: 'var(--font-ace-of-swords)' }}
                  >
                    {coinData.name}
                  </h3>
                  
                  <p className="text-white font-bold text-sm mb-3">Select the amount</p>
                  
                  {/* Amount Input Row */}
                  <div className="flex items-start gap-4 mb-4">
                    {/* Input */}
                    <div className="flex-1 bg-white/90 rounded-xl px-5 py-4 flex items-center border border-white/50">
                      <input
                        type="number"
                        value={usdAmount}
                        onChange={(e) => setUsdAmount(e.target.value)}
                        placeholder="0.00"
                        min="10"
                        max="20"
                        className="bg-transparent text-gray-800 text-2xl font-bold w-full outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="text-gray-500 font-bold ml-2 text-lg">USD</span>
                    </div>
                    
                    {/* Token Equivalent & Balance */}
                    <div className="text-right whitespace-nowrap min-w-[120px]">
                      <p className="text-white font-bold text-lg">~ {tokenAmount} {coinData.symbol}</p>
                      <p className="text-white/70 text-xs mt-1">Available balance</p>
                      <p className="text-white/70 text-xs">
                        {(() => {
                          const rawBalance = tokenBalances[selectedToken] ?? 0;
                          // Convert from smallest unit (9 decimals for SPL tokens)
                          const balance = rawBalance / 1e9;
                          return balance > 0 
                            ? `${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ${coinData.symbol}`
                            : `0 ${coinData.symbol}`;
                        })()}
                      </p>
                    </div>
                  </div>

                  {/* Arena Rules Link */}
                  <div className="flex justify-end mb-6">
                    <button className="text-white/70 text-xs flex items-center gap-1 hover:text-white transition-colors cursor-pointer">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                      Arena rules
                    </button>
                  </div>

                  {/* LOCK IN Button */}
                  {userAlreadyInArena ? (
                    <div className="w-full bg-amber-500/20 text-amber-400 font-black text-xl py-5 rounded-2xl border-2 border-amber-500/50 text-center">
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
                    <div className="w-full bg-amber-500/20 text-amber-400 font-black text-xl py-5 rounded-2xl border-2 border-amber-500/50 text-center">
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
                      <div className="w-full bg-red-500/20 text-red-400 font-bold text-sm py-3 px-4 rounded-xl border border-red-500/50 text-center">
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
                      className="w-full bg-zinc-600 text-zinc-300 font-black text-xl py-5 rounded-2xl border-2 border-zinc-500/50 cursor-not-allowed"
                      disabled
                    >
                      CONNECT WALLET
                    </button>
                  ) : !usdAmount || parseFloat(usdAmount) < 10 || parseFloat(usdAmount) > 20 ? (
                    <button 
                      className="w-full bg-zinc-600 text-zinc-300 font-black text-xl py-5 rounded-2xl border-2 border-zinc-500/50 cursor-not-allowed"
                      disabled
                    >
                      {!usdAmount ? 'ENTER AMOUNT' : parseFloat(usdAmount) < 10 ? 'MIN $10' : 'MAX $20'}
                    </button>
                  ) : txStatus === 'signing' || txStatus === 'confirming' || isEntering ? (
                    <button 
                      className="w-full bg-amber-400/50 text-gray-900 font-black text-xl py-5 rounded-2xl border-2 border-amber-500/50 cursor-wait flex items-center justify-center gap-3"
                      disabled
                    >
                      <svg className="w-6 h-6 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      {txStatus === 'signing' ? 'APPROVE IN WALLET...' : 'CONFIRMING...'}
                    </button>
                  ) : (
                    <button 
                      className="w-full bg-amber-400 hover:bg-amber-300 text-gray-900 font-black text-2xl py-5 rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer border-2 border-amber-500/50 shadow-lg shadow-amber-500/30"
                      style={{ fontFamily: 'var(--font-ace-of-swords)' }}
                      onClick={handleLockIn}
                    >
                      LOCK IN
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Section - Champions */}
        <div className="px-16 pb-8">
          {/* Token Selection Grid - Honeycomb Hexagon Layout */}
          <div className="flex flex-col items-center">
            {/* First row - 7 tokens */}
            <div className="flex justify-center" style={{ gap: '4px' }}>
              {TOKENS.slice(0, 7).map((token, index) => {
                const balance = tokenBalances[token.symbol];
                const hasLoadedBalances = Object.keys(tokenBalances).length > 0;
                const isLocked = hasLoadedBalances && (balance === 0 || balance === undefined);
                const isLoading = !hasLoadedBalances;
                
                return (
                <button
                  key={token.symbol}
                  onClick={() => handleTokenSelect(token.symbol)}
                  className={`group relative transition-all cursor-pointer hover:scale-110 hover:z-10 ${isLocked ? 'opacity-70' : ''}`}
                  style={{ width: '72px', height: '84px' }}
                >
                  {/* Main hexagon with simple liquid glass effect */}
                  <svg 
                    className={`absolute inset-0 w-full h-full transition-all ${
                      selectedToken === token.symbol 
                        ? 'drop-shadow-[0_0_12px_rgba(251,191,36,0.6)]' 
                        : 'group-hover:drop-shadow-[0_0_8px_rgba(56,189,248,0.3)]'
                    }`}
                    viewBox="0 0 72 84"
                  >
                    {/* Glass fill - more visible when champion selected */}
                    <polygon 
                      points="36,2 70,22 70,62 36,82 2,62 2,22" 
                      className={`transition-all ${
                        selectedToken === token.symbol
                          ? 'fill-amber-400/30'
                          : selectedToken
                            ? 'fill-white/20 group-hover:fill-white/25'
                            : isLocked
                              ? 'fill-white/5'
                              : 'fill-white/5 group-hover:fill-white/10'
                      }`}
                    />
                    {/* Border stroke - more visible when champion selected */}
                    <polygon 
                      points="36,2 70,22 70,62 36,82 2,62 2,22" 
                      fill="none"
                      className={`transition-all ${
                        selectedToken === token.symbol
                          ? 'stroke-amber-400'
                          : selectedToken
                            ? 'stroke-white/30 group-hover:stroke-amber-400/60'
                            : isLocked
                              ? 'stroke-white/10'
                              : 'stroke-white/10 group-hover:stroke-amber-400/60'
                      }`}
                      strokeWidth="1.5"
                    />
                  </svg>
                  
                  {/* Loading skeleton scan effect */}
                  {isLoading && (
                    <div 
                      className="absolute inset-0 overflow-hidden"
                      style={{ clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' }}
                    >
                      <div 
                        className="absolute inset-0 bg-gradient-to-b from-transparent via-sky-400/40 to-transparent animate-scan"
                        style={{ animationDelay: `${index * 0.1}s` }}
                      />
                    </div>
                  )}
                  
                  {/* Content */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    {isLocked ? (
                      <>
                        <svg className={`w-4 h-4 mb-0.5 transition-all ${selectedToken ? 'text-white/50' : 'text-white/30'}`} fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                        </svg>
                        <span className={`font-bold text-xs text-center leading-tight transition-all ${selectedToken ? 'text-white/50' : 'text-white/30'}`}>
                          {token.symbol}
                        </span>
                      </>
                    ) : (
                      <span className={`font-bold text-xs text-center leading-tight ${
                        selectedToken === token.symbol 
                          ? 'text-amber-400' 
                          : 'text-white/80 group-hover:text-amber-400'
                      }`}>
                        {token.symbol}
                      </span>
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
                const balance = tokenBalances[token.symbol];
                const hasLoadedBalances = Object.keys(tokenBalances).length > 0;
                const isLocked = hasLoadedBalances && (balance === 0 || balance === undefined);
                const isLoading = !hasLoadedBalances;
                
                return (
                <button
                  key={token.symbol}
                  onClick={() => handleTokenSelect(token.symbol)}
                  className={`group relative transition-all cursor-pointer hover:scale-110 hover:z-10 ${isLocked ? 'opacity-70' : ''}`}
                  style={{ width: '72px', height: '84px' }}
                >
                  {/* Main hexagon with simple liquid glass effect */}
                  <svg 
                    className={`absolute inset-0 w-full h-full transition-all ${
                      selectedToken === token.symbol 
                        ? 'drop-shadow-[0_0_12px_rgba(251,191,36,0.6)]' 
                        : 'group-hover:drop-shadow-[0_0_8px_rgba(56,189,248,0.3)]'
                    }`}
                    viewBox="0 0 72 84"
                  >
                    {/* Glass fill - more visible when champion selected */}
                    <polygon 
                      points="36,2 70,22 70,62 36,82 2,62 2,22" 
                      className={`transition-all ${
                        selectedToken === token.symbol
                          ? 'fill-amber-400/30'
                          : selectedToken
                            ? 'fill-white/20 group-hover:fill-white/25'
                            : isLocked
                              ? 'fill-white/5'
                              : 'fill-white/5 group-hover:fill-white/10'
                      }`}
                    />
                    {/* Border stroke - more visible when champion selected */}
                    <polygon 
                      points="36,2 70,22 70,62 36,82 2,62 2,22" 
                      fill="none"
                      className={`transition-all ${
                        selectedToken === token.symbol
                          ? 'stroke-amber-400'
                          : selectedToken
                            ? 'stroke-white/30 group-hover:stroke-amber-400/60'
                            : isLocked
                              ? 'stroke-white/10'
                              : 'stroke-white/10 group-hover:stroke-amber-400/60'
                      }`}
                      strokeWidth="1.5"
                    />
                  </svg>
                  
                  {/* Loading skeleton scan effect */}
                  {isLoading && (
                    <div 
                      className="absolute inset-0 overflow-hidden"
                      style={{ clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' }}
                    >
                      <div 
                        className="absolute inset-0 bg-gradient-to-b from-transparent via-sky-400/40 to-transparent animate-scan"
                        style={{ animationDelay: `${(index + 7) * 0.1}s` }}
                      />
                    </div>
                  )}
                  
                  {/* Content */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    {isLocked ? (
                      <>
                        <svg className={`w-4 h-4 mb-0.5 transition-all ${selectedToken ? 'text-white/50' : 'text-white/30'}`} fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                        </svg>
                        <span className={`font-bold text-xs text-center leading-tight transition-all ${selectedToken ? 'text-white/50' : 'text-white/30'}`}>
                          {token.symbol}
                        </span>
                      </>
                    ) : (
                      <span className={`font-bold text-xs text-center leading-tight ${
                        selectedToken === token.symbol 
                          ? 'text-amber-400' 
                          : 'text-white/80 group-hover:text-amber-400'
                      }`}>
                        {token.symbol}
                      </span>
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
          </div>
        </div>
      </div>

      {/* Loading overlay */}
      {showLoadingIndicator && (
        <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center animate-fade-in">
          <div className="bg-zinc-900/90 rounded-2xl p-6 flex items-center gap-4 border border-zinc-700">
            <svg className="w-6 h-6 text-amber-400 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-white font-bold">Loading {selectedToken} data...</span>
          </div>
        </div>
      )}
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
