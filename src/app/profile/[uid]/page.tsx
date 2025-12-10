'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useWallet, useWalletContext } from '@/context/WalletContext';
import { usePrivyAuth } from '@/context/PrivyContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import Navbar from '@/components/Navbar';
import ClaimRewardsSidebar from '@/components/ClaimRewardsSidebar';
import WalletConnectModal from '@/components/WalletConnectModal';
import Image from 'next/image';
import localFont from 'next/font/local';
import { Connection, PublicKey, LAMPORTS_PER_SOL, Transaction, SystemProgram } from '@solana/web3.js';
import { SOLANA_RPC_URL } from '@/lib/config';

const aceOfSwords = localFont({
  src: '../../../fonts/AceOfSwords-R9x9W.otf',
  variable: '--font-ace-of-swords',
});

// Backend API URL
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080';
const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL || 'http://localhost:3001';

// Mastery ranks
type MasteryRank = 'wood' | 'silver' | 'gold' | 'diamond' | 'master';

// Mastery data interfaces
interface ChampionMastery {
  assetIndex: number;
  symbol: string;
  name: string;
  masteryPoints: number;
  gamesPlayed: number;
  wins: number;
  podiumFinishes: number;
  bestPlacement: number | null;
  masteryLevel: number;
  pointsToNextLevel: number;
}

interface UserMastery {
  userId: string;
  totalMasteryPoints: number;
  totalGamesPlayed: number;
  totalWins: number;
  winRate: number;
  rankName: string;
  rankTier: number;
  champions: ChampionMastery[];
}

interface PublicWallet {
  address: string;
  walletType: string;
  isPrimary: boolean;
  chainType?: string;
  walletSource?: string;
}

interface PublicProfile {
  id: string;
  name: string;
  twitterUsername: string;
  twitterProfilePicture: string;
  profileBanner: string | null;
  wallets: PublicWallet[];
}

// Match history interfaces
interface UserEntry {
  playerWallet: string;
  playerIndex: number;
  assetIndex: number;
  assetSymbol: string;
  isWinner: boolean;
  hasClaimed: boolean;
  entryTimestamp: string | null;
}

interface ArenaAsset {
  assetIndex: number;
  assetSymbol: string;
  playerCount: number;
  isWinner: boolean;
  startPrice: number | null;
  endPrice: number | null;
  priceMovementRaw: string | null;  // Raw value from Solana (10^12 precision)
  priceMovementBps: number | null;  // For backward compatibility
}

interface MatchArena {
  id: string;
  arenaId: string;
  pda: string;
  status: number;
  statusLabel: string;
  playerCount: number;
  assetCount: number;
  winningAsset: number | null;
  winningAssetSymbol: string | null;
  isSuspended: boolean;
  startTimestamp: string | null;
  endTimestamp: string | null;
  totalPoolSol: number;
  totalPoolUsd: number;
  createdAt: string;
  userEntry: UserEntry | null;
  arenaAssets: ArenaAsset[];
}

// Arena status constants (matching new cryptarena-sol program)
const ArenaStatus = {
  Uninitialized: 0,
  Waiting: 1,
  Active: 2,
  Ended: 3,
  Canceled: 4,
};

// Get mastery rank based on score (matches backend thresholds)
// 0: Wood, 500: Bronze, 1500: Silver, 3500: Gold, 7000: Diamond, 15000: Master, 30000: Grandmaster
const getMasteryRank = (score: number): MasteryRank => {
  if (score >= 9000) return 'master';
  if (score >= 3000) return 'diamond';
  if (score >= 1500) return 'gold';
  if (score >= 500) return 'silver';
  return 'wood';
};

// Get rank from backend rank name
const getRankFromName = (name: string): MasteryRank => {
  const normalizedName = name.toLowerCase() as MasteryRank;
  const validRanks: MasteryRank[] = ['wood', 'silver', 'gold', 'diamond', 'master'];
  return validRanks.includes(normalizedName) ? normalizedName : 'wood';
};

// Banner images for mastery ranks (CDN URLs)
const BANNER_IMAGES: Record<MasteryRank, string> = {
  wood: 'https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/a9fe4825-d829-42a0-7866-a202d28ae300/public',
  silver: 'https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/9ff8db49-69ef-43b8-47e2-fcfd7ffb9b00/public',
  gold: 'https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/6ee8e146-3ff7-4217-93e5-1a605d739000/public',
  diamond: 'https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/4408eafb-ea4c-43e3-97de-0693ca320100/public',
  master: 'https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/1a87a0cc-a7b3-48ee-92eb-e8fd77a6d800/public',
};

// Get banner image URL for mastery rank
const getBannerImage = (rank: MasteryRank): string => {
  return BANNER_IMAGES[rank];
};

// Tab type (for bottom section)
type ProfileTab = 'history' | 'champions' | 'wallet';

function ProfilePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const uid = params.uid as string;
  const { user, authMethod } = useAuth();
  const { publicKey, connected, sendTransaction } = useWallet();
  const { currentLinkedWallet } = useWalletContext();
  const { getSolanaWalletAddress, isPrivyAuthenticated, copySolanaAddress, exportPrivateKey } = usePrivyAuth();
  
  // Get initial tab from URL query param
  const initialTab = searchParams.get('tab') as ProfileTab | null;
  
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ProfileTab>(
    initialTab && ['history', 'champions', 'wallet'].includes(initialTab) ? initialTab : 'history'
  );
  
  // Match history state
  const [matchHistory, setMatchHistory] = useState<MatchArena[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  
  // Claim rewards sidebar state
  const [claimSidebarOpen, setClaimSidebarOpen] = useState(false);
  const [selectedArenaForClaim, setSelectedArenaForClaim] = useState<MatchArena | null>(null);
  
  // Mastery data state
  const [mastery, setMastery] = useState<UserMastery | null>(null);
  const [isLoadingMastery, setIsLoadingMastery] = useState(false);
  
  // Wallet tab state
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [showWalletConnectModal, setShowWalletConnectModal] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAddress, setWithdrawAddress] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawSuccess, setWithdrawSuccess] = useState(false);
  const [copiedDepositAddress, setCopiedDepositAddress] = useState(false);
  
  // Check if viewing own profile
  const isOwnProfile = user?.id === uid;
  
  // Determine if user is using Privy or external wallet
  const isUsingPrivy = authMethod === 'privy' && isPrivyAuthenticated;
  const privyWalletAddress = getSolanaWalletAddress();
  
  // Get the active wallet address (Privy or external)
  const activeWalletAddress = isUsingPrivy ? privyWalletAddress : publicKey?.toBase58();
  const isWalletConnected = isUsingPrivy ? !!privyWalletAddress : connected;
  
  // Check if the active wallet belongs to this profile
  const canClaimRewards = isWalletConnected && activeWalletAddress && 
    profile?.wallets.some(w => w.address.toLowerCase() === activeWalletAddress.toLowerCase());
  
  // Derived stats from mastery (with fallbacks)
  const masteryStats = {
    masteryScore: mastery?.totalMasteryPoints || 0,
    badges: mastery?.champions?.length || 0, // Number of champions played
    matches: mastery?.totalGamesPlayed || 0,
    challenges: mastery?.totalWins || 0,
    winRate: mastery?.winRate || 0,
    rankName: mastery?.rankName || 'Wood',
  };

  // Fetch user profile
  const fetchProfile = useCallback(async () => {
    if (!uid) return;
    
    try {
      setIsLoading(true);
      const response = await fetch(`${BACKEND_URL}/api/users/public/${uid}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          setError('User not found');
        } else {
          throw new Error('Failed to fetch profile');
        }
        return;
      }
      
      const data: PublicProfile = await response.json();
      setProfile(data);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch profile:', err);
      setError('Could not load profile');
    } finally {
      setIsLoading(false);
    }
  }, [uid]);

  // Fetch mastery data
  const fetchMastery = useCallback(async () => {
    if (!uid) return;
    
    try {
      setIsLoadingMastery(true);
      const response = await fetch(`${BACKEND_URL}/api/mastery/public/user/${uid}`);
      
      if (!response.ok) {
        console.warn('Failed to fetch mastery data, using defaults');
        return;
      }
      
      const data: UserMastery = await response.json();
      setMastery(data);
    } catch (err) {
      console.error('Failed to fetch mastery:', err);
      // Non-fatal - use defaults
    } finally {
      setIsLoadingMastery(false);
    }
  }, [uid]);

  // Fetch match history
  const fetchMatchHistory = useCallback(async () => {
    if (!profile || profile.wallets.length === 0) {
      setMatchHistory([]);
      return;
    }
    
    try {
      setIsLoadingHistory(true);
      setHistoryError(null);
      
      // Filter for SVM (Solana) wallets only - arena history is Solana-based
      // Include wallets with chainType 'SVM', 'SOLANA', or no chainType (legacy wallets are Solana)
      const svmWallets = profile.wallets.filter(w => 
        !w.chainType || 
        w.chainType.toUpperCase() === 'SVM' || 
        w.chainType.toUpperCase() === 'SOLANA'
      );
      
      if (svmWallets.length === 0) {
        setMatchHistory([]);
        return;
      }
      
      // Get SVM wallet addresses
      const walletAddresses = svmWallets.map(w => w.address).join(',');
      
      const response = await fetch(`${INDEXER_URL}/api/v1/arenas/player/${walletAddresses}?limit=50`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch match history');
      }
      
      const data = await response.json();
      setMatchHistory(data.data || []);
    } catch (err) {
      console.error('Failed to fetch match history:', err);
      setHistoryError('Could not load match history');
    } finally {
      setIsLoadingHistory(false);
    }
  }, [profile]);

  // Fetch wallet balance
  const fetchWalletBalance = useCallback(async (address: string) => {
    try {
      setIsLoadingBalance(true);
      const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
      const pubkey = new PublicKey(address);
      const balance = await connection.getBalance(pubkey);
      setWalletBalance(balance / LAMPORTS_PER_SOL);
    } catch (err) {
      console.error('Failed to fetch wallet balance:', err);
      setWalletBalance(null);
    } finally {
      setIsLoadingBalance(false);
    }
  }, []);

  // Get the current wallet address based on auth method
  const getCurrentWalletAddress = useCallback((): string | null => {
    if (authMethod === 'privy' && isPrivyAuthenticated) {
      return getSolanaWalletAddress();
    }
    if (connected && publicKey) {
      return publicKey.toBase58();
    }
    return null;
  }, [authMethod, isPrivyAuthenticated, getSolanaWalletAddress, connected, publicKey]);

  // Copy address to clipboard
  const handleCopyAddress = async () => {
    const address = getCurrentWalletAddress();
    if (address) {
      try {
        await navigator.clipboard.writeText(address);
        setCopiedAddress(true);
        setTimeout(() => setCopiedAddress(false), 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    }
  };

  // Handle withdraw for Privy wallets (this would need Privy's signTransaction)
  const handleWithdraw = async () => {
    // For now, show instructions - actual withdraw would need Privy's embedded wallet signing
    setWithdrawError('Withdraw functionality coming soon. Please use the Solana CLI or a wallet app to withdraw funds.');
  };

  useEffect(() => {
    fetchProfile();
    fetchMastery();
  }, [fetchProfile, fetchMastery]);

  // Fetch wallet balance when wallet tab is active and on own profile
  useEffect(() => {
    if (activeTab === 'wallet' && isOwnProfile) {
      const address = getCurrentWalletAddress();
      if (address) {
        fetchWalletBalance(address);
      }
    }
  }, [activeTab, isOwnProfile, getCurrentWalletAddress, fetchWalletBalance]);

  // Fetch match history when profile loads (for count) and when tab changes to history
  useEffect(() => {
    if (profile) {
      fetchMatchHistory();
    }
  }, [profile, fetchMatchHistory]);

  if (!user) return null;

  // Use real mastery data or fall back to score-based calculation 
  const masteryRank = getMasteryRank(masteryStats.masteryScore)
  const bannerImage = getBannerImage(masteryRank);

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
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${styles[status] || styles[ArenaStatus.Waiting]}`}>
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

  // Tab content (Arena History / Champions)
  const renderTabContent = () => {
    switch (activeTab) {
      case 'history':
        return (
          <div className="pb-8">
            {isLoadingHistory ? (
              <div className="flex items-center justify-center py-16">
                <div className="flex flex-col items-center gap-4">
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full border-4 border-sky-500/20 border-t-sky-400 animate-spin" />
                  </div>
                  <p className="text-white/50">Loading match history...</p>
                </div>
              </div>
            ) : historyError ? (
              <div className="flex items-center justify-center py-16">
                <div className="bg-red-500/10 backdrop-blur-xl rounded-xl px-6 py-4 border border-red-500/30">
                  <p className="text-red-400 text-sm">{historyError}</p>
                </div>
              </div>
            ) : matchHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10">
                <div className="w-16 h-16 mb-4 rounded-full bg-white/5 flex items-center justify-center">
                  <svg className="w-8 h-8 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <p className="text-white/60 text-lg mb-1">No matches yet</p>
                <p className="text-white/30 text-sm">This player hasn&apos;t participated in any arenas</p>
              </div>
            ) : (
              <div className="space-y-3">
                {matchHistory.map((arena) => {
                  // Determine if user won by comparing their asset with the winning asset
                  const userAssetIndex = arena.userEntry?.assetIndex;
                  const userWon = arena.winningAsset !== null && userAssetIndex === arena.winningAsset;
                  const userChampion = arena.userEntry?.assetSymbol || '?';
                  const winningChampion = arena.winningAssetSymbol;
                  const isEnded = arena.status === ArenaStatus.Ended;
                  const isCanceled = arena.status === ArenaStatus.Canceled;
                  
                  return (
                    <div
                      key={arena.id}
                      onClick={() => router.push(`/arenas/${arena.arenaId}`)}
                      className={`group relative bg-white/5 backdrop-blur-xl rounded-2xl border overflow-hidden transition-all duration-300 hover:scale-[1.01] cursor-pointer ${
                        userWon && isEnded
                          ? 'border-amber-500/40 hover:border-amber-400/60 hover:shadow-lg hover:shadow-amber-500/10'
                          : isEnded && !userWon
                            ? 'border-red-500/30 hover:border-red-400/50'
                            : isCanceled
                              ? 'border-zinc-500/30 hover:border-zinc-400/50'
                              : 'border-white/10 hover:border-sky-400/40 hover:shadow-lg hover:shadow-sky-500/10'
                      }`}
                    >
                      {/* Top accent line */}
                      <div className={`h-0.5 w-full ${
                        userWon && isEnded
                          ? 'bg-gradient-to-r from-amber-400 to-yellow-400'
                          : isEnded && !userWon
                            ? 'bg-gradient-to-r from-red-500 to-red-400'
                            : isCanceled
                              ? 'bg-zinc-500'
                              : 'bg-sky-400'
                      }`} />
                      
                      <div className="p-5">
                        <div className="flex items-center justify-between">
                          {/* Left side - Arena info */}
                          <div className="flex items-center gap-4">
                            {/* Result indicator */}
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                              userWon && isEnded
                                ? 'bg-amber-500/20'
                                : isEnded && !userWon
                                  ? 'bg-red-500/20'
                                  : isCanceled
                                    ? 'bg-zinc-500/20'
                                    : 'bg-sky-500/20'
                            }`}>
                              {userWon && isEnded ? (
                                <svg className="w-6 h-6 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                                </svg>
                              ) : isEnded && !userWon ? (
                                <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              ) : isCanceled ? (
                                <svg className="w-6 h-6 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                </svg>
                              ) : (
                                <svg className="w-6 h-6 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                              )}
                            </div>
                            
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="text-lg font-bold text-white">Arena #{arena.arenaId}</h3>
                                {getStatusBadge(arena.status, arena.statusLabel)}
                                {userWon && isEnded && (
                                  <span className="px-2 py-0.5 rounded-full bg-amber-400 text-gray-900 text-[10px] font-bold">
                                    VICTORY
                                  </span>
                                )}
                                {isEnded && !userWon && (
                                  <span className="px-2 py-0.5 rounded-full bg-red-500/30 text-red-400 text-[10px] font-bold border border-red-500/40">
                                    DEFEAT
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-sm text-white/40">
                                <span>{arena.playerCount}/10 players</span>
                                <span>•</span>
                                <span>{formatTime(arena.endTimestamp || arena.startTimestamp || arena.createdAt)}</span>
                              </div>
                            </div>
                          </div>
                          
                          {/* Right side - User's entry & Pool */}
                          <div className="flex items-center gap-8">
                            {/* User's champion */}
                            <div className="text-center">
                              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Your Champion</p>
                              <span className={`text-lg font-bold ${
                                userWon && isEnded ? 'text-amber-400' : 'text-white'
                              }`}>
                                {userChampion}
                              </span>
                            </div>
                            
                            {/* Winning champion (if ended) */}
                            {isEnded && winningChampion && (
                              <div className="text-center">
                                <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Winner</p>
                                <span className={`text-lg font-bold ${
                                  userWon ? 'text-amber-400' : 'text-white/60'
                                }`}>
                                  {winningChampion}
                                </span>
                              </div>
                            )}
                            
                            {/* Pool */}
                            <div className="text-right">
                              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Pool</p>
                              <p className="text-xl font-bold bg-gradient-to-r from-amber-400 to-yellow-300 bg-clip-text text-transparent">
                                {(arena.totalPoolSol || 0).toFixed(2)} SOL
                              </p>
                            </div>
                            
                            {/* Claim Button or Claimed Badge - Only for winners on own profile */}
                            {userWon && isEnded && canClaimRewards && (
                              arena.userEntry?.hasClaimed ? (
                                <div className="flex items-center gap-2 px-4 py-2 bg-green-500/20 rounded-xl border border-green-500/40">
                                  <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                  <span className="text-green-400 font-bold text-xs">Rewards Claimed</span>
                                </div>
                              ) : (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedArenaForClaim(arena);
                                    setClaimSidebarOpen(true);
                                  }}
                                  className="group relative px-6 py-3 bg-amber-400 hover:bg-amber-300 text-gray-900 text-base font-black rounded-xl transition-all cursor-pointer shadow-lg shadow-amber-500/30 hover:scale-105 overflow-hidden"
                                >
                                  {/* Animated border gradient - white lines effect */}
                                  <span className="absolute inset-0 rounded-xl">
                                    <span className="absolute inset-[-3px] rounded-xl bg-[conic-gradient(from_0deg,#ffffff,#e5e5e5,#ffffff,#f5f5f5,#ffffff,#e5e5e5,#ffffff)] animate-[spin_4s_linear_infinite]" />
                                    <span className="absolute inset-[2px] rounded-lg bg-amber-400 group-hover:bg-amber-300 transition-colors" />
                                  </span>
                                  <span className="relative z-10">Claim Rewards</span>
                                </button>
                              )
                            )}
                            
                            {/* Claim Refund Button for Canceled Arenas - Only for participants on own profile */}
                            {isCanceled && canClaimRewards && (
                              arena.userEntry?.hasClaimed ? (
                                <div className="flex items-center gap-2 px-4 py-2 bg-zinc-500/20 rounded-xl border border-zinc-500/40">
                                  <svg className="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                  <span className="text-zinc-400 font-bold text-xs">Refund Claimed</span>
                                </div>
                              ) : (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedArenaForClaim(arena);
                                    setClaimSidebarOpen(true);
                                  }}
                                  className="group relative px-6 py-3 bg-zinc-500 hover:bg-zinc-400 text-white text-base font-black rounded-xl transition-all cursor-pointer shadow-lg shadow-zinc-500/30 hover:scale-105 overflow-hidden"
                                >
                                  {/* Animated border gradient */}
                                  <span className="absolute inset-0 rounded-xl">
                                    <span className="absolute inset-[-3px] rounded-xl bg-[conic-gradient(from_0deg,#ffffff,#a1a1aa,#ffffff,#d4d4d8,#ffffff,#a1a1aa,#ffffff)] animate-[spin_4s_linear_infinite]" />
                                    <span className="absolute inset-[2px] rounded-lg bg-zinc-500 group-hover:bg-zinc-400 transition-colors" />
                                  </span>
                                  <span className="relative z-10">Claim Refund</span>
                                </button>
                              )
                            )}
                            
                            {/* Arrow */}
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                              <svg className="w-5 h-5 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      case 'champions':
        return (
          <div className="text-center py-20">
            <p className="text-white/40">Champions content coming soon...</p>
          </div>
        );
      case 'wallet':
        const walletAddress = getCurrentWalletAddress();
        const isPrivyWallet = authMethod === 'privy' && isPrivyAuthenticated;
        const hasExternalWallet = connected && publicKey;
        
        // No wallet connected
        if (!walletAddress) {
          return (
            <div className="flex flex-col items-center justify-center py-16 bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10">
              <div className="w-20 h-20 mb-6 rounded-full bg-white/5 flex items-center justify-center">
                <svg className="w-10 h-10 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">No Wallet Connected</h3>
              <p className="text-white/50 mb-6 text-center max-w-md">
                Connect a Solana wallet to view your balance and manage your funds.
              </p>
              <button
                onClick={() => setShowWalletConnectModal(true)}
                className="px-8 py-3 bg-sky-500 hover:bg-sky-400 text-white font-bold rounded-xl transition-all cursor-pointer"
              >
                Connect Wallet
              </button>
            </div>
          );
        }
        
        return (
          <div className="space-y-6">
            {/* Balance & Address Card with Deposit/Withdraw */}
            <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
              <div className="flex items-start justify-between gap-6">
                {/* Left side - Address & Balance */}
                <div className="flex-1">
                  {/* Address */}
                  <div className="mb-4">
                    <p className="text-white/50 text-xs mb-1.5">Wallet Address</p>
                    <div className="flex items-center gap-2">
                      <code className="text-white/80 text-sm font-mono bg-white/5 px-3 py-1.5 rounded-lg truncate max-w-[280px]">
                        {walletAddress}
                      </code>
                      <button
                        onClick={handleCopyAddress}
                        className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                          copiedAddress 
                            ? 'bg-green-500/20 text-green-400' 
                            : 'bg-white/10 hover:bg-white/20 text-white/60 hover:text-white'
                        }`}
                        title={copiedAddress ? 'Copied!' : 'Copy address'}
                      >
                        {copiedAddress ? (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                  
                  {/* Balance */}
                  <div>
                    <p className="text-white/50 text-xs mb-1">Balance</p>
                    {isLoadingBalance ? (
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full border-2 border-sky-500/20 border-t-sky-400 animate-spin" />
                        <span className="text-white/50 text-sm">Loading...</span>
                      </div>
                    ) : (
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-bold bg-gradient-to-r from-amber-400 to-yellow-300 bg-clip-text text-transparent">
                          {walletBalance !== null ? walletBalance.toFixed(4) : '—'}
                        </span>
                        <span className="text-white/60">SOL</span>
                        <button
                          onClick={() => walletAddress && fetchWalletBalance(walletAddress)}
                          className="ml-2 text-xs text-sky-400 hover:text-sky-300 cursor-pointer flex items-center gap-1"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Refresh
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Right side - Deposit & Withdraw Buttons (only for Privy wallets) */}
                {isPrivyWallet && (
                  <div className="flex items-center gap-2">
                    {/* Deposit Button */}
                    <button
                      onClick={() => setShowDepositModal(true)}
                      className="group flex items-center gap-2 px-4 py-2.5 bg-green-500/15 hover:bg-green-500/25 border border-green-500/30 hover:border-green-400/50 rounded-xl transition-all cursor-pointer"
                    >
                      <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8l-8-8-8 8" />
                      </svg>
                      <span className="text-green-400 font-semibold text-sm">Deposit</span>
                    </button>
                    
                    {/* Withdraw Button */}
                    <button
                      onClick={() => setShowWithdrawModal(true)}
                      className="group flex items-center gap-2 px-4 py-2.5 bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 hover:border-red-400/50 rounded-xl transition-all cursor-pointer"
                    >
                      <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 20V4m-8 8l8 8 8-8" />
                      </svg>
                      <span className="text-red-400 font-semibold text-sm">Withdraw</span>
                    </button>
                  </div>
                )}
              </div>
              
              {/* Export Private Key - Bottom right for Privy wallets */}
              {isPrivyWallet && (
                <div className="flex justify-end mt-3 pt-3 border-t border-white/5">
                  <button
                    onClick={exportPrivateKey}
                    className="flex items-center gap-1.5 text-white/40 hover:text-white/60 text-xs transition-all cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    Export Private Key
                  </button>
                </div>
              )}
            </div>
            
            {/* External Wallet Notice */}
            {!isPrivyWallet && hasExternalWallet && (
              <div className="bg-sky-500/10 border border-sky-500/30 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-sky-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="text-sky-400 font-bold text-sm">External Wallet Connected</p>
                    <p className="text-sky-300/80 text-sm">
                      You&apos;re using an external wallet (Phantom, Solflare, etc.). Deposits and withdrawals should be done directly through your wallet app.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      default:
        return null;
    }
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

        {isLoading ? (
          <div className="flex items-center justify-center h-[calc(100vh-200px)]">
            <div className="flex flex-col items-center gap-4 bg-white/5 backdrop-blur-xl px-10 py-8 rounded-2xl border border-white/10">
              <div className="relative">
                <div className="w-12 h-12 rounded-full border-4 border-sky-500/20 border-t-sky-400 animate-spin" />
                <div className="absolute inset-0 w-12 h-12 rounded-full border-4 border-cyan-500/20 border-b-cyan-400 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
              </div>
              <p className="text-white/50 font-medium">Loading profile...</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-[calc(100vh-200px)]">
            <div className="bg-red-500/10 backdrop-blur-xl rounded-2xl px-8 py-5 border border-red-500/30">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-red-400">{error}</p>
              </div>
            </div>
          </div>
        ) : profile && (
          <div className="max-w-6xl mx-auto mt-4">
            {/* Profile Header */}
            <div className="flex gap-8 mb-8">
              {/* Left - Banner with Profile Picture */}
              <div className="flex-shrink-0">
                <div className="relative" style={{ width: '360px', height: '420px' }}>
                  {/* Banner Frame */}
                  <Image
                    src={bannerImage}
                    alt={`${masteryRank} rank banner`}
                    fill
                    className="object-contain z-10"
                    priority
                  />
                  
                  {/* Profile Picture - positioned behind the banner in the cutout */}
                  <div 
                    className="absolute rounded-full overflow-hidden"
                    style={{
                      top: '27%',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: '185px',
                      height: '185px',
                      zIndex: 5,
                    }}
                  >
                    {profile.twitterProfilePicture ? (
                      <Image
                        src={profile.twitterProfilePicture}
                        alt={profile.name}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-zinc-700 to-zinc-800 flex items-center justify-center">
                        <svg className="w-12 h-12 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                    )}
                  </div>
                  
                </div>
              </div>

              {/* Right - Info and Stats */}
              <div className="flex-1 pt-4 flex flex-col relative overflow-hidden">
                {/* Giant Background Mastery Score */}
                <div className="absolute top-0 right-0 pointer-events-none select-none">
                  <p 
                    className="text-[120px] text-sky-400/20 tracking-wider leading-none"
                    style={{ fontFamily: 'var(--font-ace-of-swords)' }}
                  >
                    {masteryStats.masteryScore.toLocaleString()}
                  </p>
                  <p 
                    className="text-4xl text-sky-400/20 uppercase tracking-[0.3em] text-right -mt-2"
                    style={{ fontFamily: 'var(--font-ace-of-swords)' }}
                  >
                    Mastery
                  </p>
                </div>

                {/* User Info */}
                <div className="mb-8 relative z-10">
                  <div>
                    {profile.name && (
                      <h1 className="text-2xl font-bold text-white mb-2">{profile.name}</h1>
                    )}
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-white/60" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                      </svg>
                      <span className="text-white/80">{profile.twitterUsername}</span>
                    </div>
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="flex items-end gap-40 mt-25 relative z-10">
                  {/* Badges */}
                  <div className="text-center">
                    <div className="mb-4 h-24 flex items-center justify-center">
                      {/* Badge icons */}
                      <div className="flex items-center -space-x-4">
                        <Image
                          src="https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/c5193c61-1993-45cf-c26e-7391bad80100/public"
                          alt="Badge 1"
                          width={64}
                          height={64}
                          className="object-contain rounded-full z-0"
                        />
                        <Image
                          src="https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/79e23834-d040-4616-ac79-8d2a57cc7800/public"
                          alt="Badge 2"
                          width={80}
                          height={80}
                          className="object-contain rounded-full z-10"
                        />
                        <Image
                          src="https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/f3795a37-6611-4726-9775-0db9754e8400/public"
                          alt="Badge 3"
                          width={64}
                          height={64}
                          className="object-contain rounded-full z-0"
                        />
                      </div>
                    </div>
                    <p className="text-3xl font-bold text-white">{masteryStats.badges}</p>
                    <p className="text-white/50 text-base">Badges</p>
                  </div>

                  {/* Matches */}
                  <div className="text-center">
                    <div className="mb-4 h-24 flex items-center justify-center">
                      <Image
                        src="https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/f9d5fed1-4c32-4ca2-a5b1-463e2d70fe00/public"
                        alt="Matches"
                        width={88}
                        height={88}
                        className="object-contain"
                      />
                    </div>
                    <p className="text-3xl font-bold text-white">
                      {matchHistory.length > 0 ? matchHistory.length : masteryStats.matches}
                    </p>
                    <p className="text-white/50 text-base">Matches</p>
                  </div>

                  {/* Challenges */}
                  <div className="text-center">
                    <div className="mb-4 h-24 flex items-center justify-center">
                      <Image
                        src="https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/37c52a78-2085-44cf-9155-efb9be37f300/public"
                        alt="Challenges"
                        width={88}
                        height={88}
                        className="object-contain"
                      />
                    </div>
                    <p className="text-3xl font-bold text-white">{masteryStats.challenges}</p>
                    <p className="text-white/50 text-base">Challenges</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs Section */}
            <div className="mt-8 max-w-[1000px] mx-auto">
              {/* Tab Buttons */}
              <div className="flex items-center gap-2 mb-6">
                <button
                  onClick={() => setActiveTab('history')}
                  className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all cursor-pointer ${
                    activeTab === 'history' 
                      ? 'bg-white/15 backdrop-blur-xl text-white border border-white/20' 
                      : 'text-white/40 hover:text-white/60 hover:bg-white/5'
                  }`}
                >
                  Arena History
                </button>
                <button
                  onClick={() => setActiveTab('champions')}
                  className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all cursor-pointer ${
                    activeTab === 'champions' 
                      ? 'bg-white/15 backdrop-blur-xl text-white border border-white/20' 
                      : 'text-white/40 hover:text-white/60 hover:bg-white/5'
                  }`}
                >
                  Champions
                </button>
                {/* Wallet tab - only visible on own profile */}
                {isOwnProfile && (
                  <button
                    onClick={() => setActiveTab('wallet')}
                    className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all cursor-pointer flex items-center gap-2 ${
                      activeTab === 'wallet' 
                        ? 'bg-amber-500/20 backdrop-blur-xl text-amber-400 border border-amber-500/40' 
                        : 'text-white/40 hover:text-white/60 hover:bg-white/5'
                    }`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                      <path d="M2.00488 8.99979H21.0049C21.5572 8.99979 22.0049 9.4475 22.0049 9.99979V19.9998C22.0049 20.5521 21.5572 20.9998 21.0049 20.9998H3.00488C2.4526 20.9998 2.00488 20.5521 2.00488 19.9998V8.99979ZM3.00488 2.99979H18.0049V6.99979H2.00488V3.99979C2.00488 3.4475 2.4526 2.99979 3.00488 2.99979ZM15.0049 13.9998V15.9998H18.0049V13.9998H15.0049Z"></path>
                    </svg>
                    Wallet
                  </button>
                )}
              </div>

              {/* Tab Content */}
              {renderTabContent()}
            </div>
          </div>
        )}
      </div>

      {/* Claim Rewards/Refund Sidebar */}
      {selectedArenaForClaim && (
        <ClaimRewardsSidebar
          isOpen={claimSidebarOpen}
          onClose={() => {
            setClaimSidebarOpen(false);
            setSelectedArenaForClaim(null);
          }}
          arena={{
            arenaId: selectedArenaForClaim.arenaId,
            winningAsset: selectedArenaForClaim.winningAsset,
            winningAssetSymbol: selectedArenaForClaim.winningAssetSymbol,
            totalPoolSol: selectedArenaForClaim.totalPoolSol,
            totalPoolUsd: selectedArenaForClaim.totalPoolUsd,
            status: selectedArenaForClaim.status,
            playerCount: selectedArenaForClaim.playerCount,
          }}
          isRefund={selectedArenaForClaim.status === ArenaStatus.Canceled}
          onClaimSuccess={() => {
            // Optimistic UI update - immediately mark as claimed in local state
            // This avoids waiting for indexer to catch up with the blockchain
            setMatchHistory(prev => prev.map(arena => {
              if (arena.arenaId === selectedArenaForClaim.arenaId && arena.userEntry) {
                return {
                  ...arena,
                  userEntry: {
                    ...arena.userEntry,
                    hasClaimed: true,
                  },
                };
              }
              return arena;
            }));
          }}
        />
      )}

      {/* Wallet Connect Modal */}
      <WalletConnectModal
        isOpen={showWalletConnectModal}
        onClose={() => setShowWalletConnectModal(false)}
        onSuccess={() => setShowWalletConnectModal(false)}
      />

      {/* Deposit Modal - Liquid Glass Effect */}
      {showDepositModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop with blur */}
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowDepositModal(false)}
          />
          
          {/* Modal Content - Liquid Glass Effect */}
          <div className="relative w-full max-w-lg animate-in fade-in zoom-in-95 duration-200">
            {/* Liquid glass background layers */}
            <div className="absolute -inset-1 bg-gradient-to-r from-green-500/30 via-emerald-400/20 to-green-500/30 rounded-3xl blur-xl opacity-70 animate-pulse" />
            <div className="absolute -inset-0.5 bg-gradient-to-br from-white/20 to-white/5 rounded-3xl" />
            
            {/* Main content */}
            <div className="relative bg-[#1a1f2e]/90 backdrop-blur-2xl rounded-3xl border border-white/20 overflow-hidden shadow-2xl shadow-green-500/10">
              {/* Top gradient accent */}
              <div className="h-1 bg-gradient-to-r from-green-400 via-emerald-400 to-green-400" />
              
              {/* Header */}
              <div className="p-6 border-b border-white/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
                      <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8l-8-8-8 8" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-white">Deposit SOL</h2>
                      <p className="text-white/50 text-sm">Send SOL to your Cryptarena wallet</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowDepositModal(false)}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-all cursor-pointer"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              
              {/* Body */}
              <div className="p-6 space-y-5">
                {/* Warning Banner */}
                <div className="bg-amber-500/15 border border-amber-500/40 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <svg className="w-6 h-6 text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div>
                      <p className="text-amber-400 font-bold">Solana Devnet Only</p>
                      <p className="text-amber-300/80 text-sm mt-1">
                        Only send <strong>Devnet SOL</strong> - NOT real SOL from mainnet!
                      </p>
                    </div>
                  </div>
                </div>
                
                {/* Wallet Address */}
                <div>
                  <label className="text-white/60 text-sm mb-2 block">Your Deposit Address</label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-white/90 text-sm font-mono bg-white/5 px-4 py-3 rounded-xl border border-white/10 truncate">
                      {getCurrentWalletAddress()}
                    </code>
                    <button
                      onClick={async () => {
                        const addr = getCurrentWalletAddress();
                        if (addr) {
                          await navigator.clipboard.writeText(addr);
                          setCopiedDepositAddress(true);
                          setTimeout(() => setCopiedDepositAddress(false), 2000);
                        }
                      }}
                      className={`px-4 py-3 rounded-xl font-bold transition-all cursor-pointer ${
                        copiedDepositAddress 
                          ? 'bg-green-500 text-white' 
                          : 'bg-white/10 hover:bg-white/20 text-white'
                      }`}
                    >
                      {copiedDepositAddress ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
                
                {/* Instructions */}
                <div className="bg-white/5 rounded-xl p-4">
                  <p className="text-white/70 text-sm font-medium mb-3">How to deposit:</p>
                  <ol className="text-white/50 text-sm space-y-2">
                    <li className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-green-500/20 text-green-400 text-xs flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
                      <span>Copy your wallet address above</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-green-500/20 text-green-400 text-xs flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
                      <span>Open your external wallet (Phantom, Solflare)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-green-500/20 text-green-400 text-xs flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
                      <span>Set your wallet to <strong className="text-amber-400">Devnet</strong></span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-green-500/20 text-green-400 text-xs flex items-center justify-center flex-shrink-0 mt-0.5">4</span>
                      <span>Send Devnet SOL to the address</span>
                    </li>
                  </ol>
                </div>
                
                {/* Faucet Link */}
                <div className="text-center">
                  <p className="text-white/40 text-sm">
                    Need Devnet SOL?{' '}
                    <a 
                      href="https://faucet.solana.com/" 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-sky-400 hover:text-sky-300 underline"
                    >
                      Get free tokens from the Solana Faucet
                    </a>
                  </p>
                </div>
              </div>
              
              {/* Footer */}
              <div className="p-6 border-t border-white/10 bg-white/5">
                <button
                  onClick={() => setShowDepositModal(false)}
                  className="w-full py-3 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl transition-all cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Withdraw Modal - Liquid Glass Effect */}
      {showWithdrawModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop with blur */}
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              setShowWithdrawModal(false);
              setWithdrawError(null);
              setWithdrawSuccess(false);
            }}
          />
          
          {/* Modal Content - Liquid Glass Effect */}
          <div className="relative w-full max-w-lg animate-in fade-in zoom-in-95 duration-200">
            {/* Liquid glass background layers */}
            <div className="absolute -inset-1 bg-gradient-to-r from-red-500/30 via-orange-400/20 to-red-500/30 rounded-3xl blur-xl opacity-70 animate-pulse" />
            <div className="absolute -inset-0.5 bg-gradient-to-br from-white/20 to-white/5 rounded-3xl" />
            
            {/* Main content */}
            <div className="relative bg-[#1a1f2e]/90 backdrop-blur-2xl rounded-3xl border border-white/20 overflow-hidden shadow-2xl shadow-red-500/10">
              {/* Top gradient accent */}
              <div className="h-1 bg-gradient-to-r from-red-400 via-orange-400 to-red-400" />
              
              {/* Header */}
              <div className="p-6 border-b border-white/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center">
                      <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 20V4m-8 8l8 8 8-8" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-white">Withdraw SOL</h2>
                      <p className="text-white/50 text-sm">Send SOL to an external wallet</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setShowWithdrawModal(false);
                      setWithdrawError(null);
                      setWithdrawSuccess(false);
                    }}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-all cursor-pointer"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              
              {/* Body */}
              <div className="p-6 space-y-5">
                {/* Current Balance */}
                <div className="bg-white/5 rounded-xl p-4 text-center">
                  <p className="text-white/50 text-sm mb-1">Available Balance</p>
                  <p className="text-3xl font-bold bg-gradient-to-r from-amber-400 to-yellow-300 bg-clip-text text-transparent">
                    {walletBalance !== null ? walletBalance.toFixed(4) : '0.0000'} SOL
                  </p>
                </div>
                
                {/* Recipient Address */}
                <div>
                  <label className="text-white/60 text-sm mb-2 block">Recipient Address</label>
                  <input
                    type="text"
                    value={withdrawAddress}
                    onChange={(e) => setWithdrawAddress(e.target.value)}
                    placeholder="Enter Solana address..."
                    className="w-full bg-white/5 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-red-400/50 font-mono text-sm"
                  />
                </div>
                
                {/* Amount */}
                <div>
                  <label className="text-white/60 text-sm mb-2 block">Amount (SOL)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      placeholder="0.00"
                      step="0.001"
                      min="0"
                      className="flex-1 bg-white/5 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-red-400/50 font-mono"
                    />
                    <button
                      onClick={() => walletBalance && setWithdrawAmount(Math.max(0, walletBalance - 0.001).toFixed(4))}
                      className="px-4 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-white/60 hover:text-white text-sm font-bold transition-all cursor-pointer"
                    >
                      Max
                    </button>
                  </div>
                  <p className="text-white/40 text-xs mt-2">Leave ~0.001 SOL for transaction fees</p>
                </div>
                
                {/* Error/Success Messages */}
                {withdrawError && (
                  <div className="bg-red-500/15 border border-red-500/40 rounded-xl p-4">
                    <div className="flex items-start gap-2">
                      <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-red-400 text-sm">{withdrawError}</p>
                    </div>
                  </div>
                )}
                
                {withdrawSuccess && (
                  <div className="bg-green-500/15 border border-green-500/40 rounded-xl p-4">
                    <div className="flex items-start gap-2">
                      <svg className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <p className="text-green-400 text-sm">Withdrawal successful! Check your external wallet.</p>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Footer */}
              <div className="p-6 border-t border-white/10 bg-white/5 space-y-3">
                <button
                  onClick={handleWithdraw}
                  disabled={isWithdrawing || !withdrawAddress || !withdrawAmount || parseFloat(withdrawAmount) <= 0}
                  className={`w-full py-3.5 rounded-xl font-bold transition-all cursor-pointer ${
                    isWithdrawing || !withdrawAddress || !withdrawAmount || parseFloat(withdrawAmount) <= 0
                      ? 'bg-white/10 text-white/30 cursor-not-allowed'
                      : 'bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-400 hover:to-orange-400 text-white shadow-lg shadow-red-500/20'
                  }`}
                >
                  {isWithdrawing ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                      Processing...
                    </span>
                  ) : (
                    'Withdraw'
                  )}
                </button>
                <button
                  onClick={() => {
                    setShowWithdrawModal(false);
                    setWithdrawError(null);
                    setWithdrawSuccess(false);
                  }}
                  className="w-full py-3 bg-transparent hover:bg-white/5 text-white/50 hover:text-white font-medium rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Profile() {
  return (
    <ProtectedRoute>
      <ProfilePage />
    </ProtectedRoute>
  );
}

