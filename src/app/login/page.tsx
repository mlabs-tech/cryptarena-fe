'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import localFont from 'next/font/local';
import { useAuth } from '@/context/AuthContext';
import { usePrivyAuth } from '@/context/PrivyContext';
import { api } from '@/lib/api';

const aceOfSwords = localFont({
  src: '../../fonts/AceOfSwords-R9x9W.otf',
  variable: '--font-ace-of-swords',
});

export default function LoginPage() {
  const { login, isAuthenticated, isLoading, setUserFromPrivy } = useAuth();
  const { 
    isPrivyReady, 
    isPrivyAuthenticated, 
    privyUser, 
    loginWithPrivy, 
    authenticateWithBackend,
    getSolanaWalletAddress,
    getEvmWalletAddress,
  } = usePrivyAuth();
  const router = useRouter();
  const [isPrivyLoading, setIsPrivyLoading] = useState(false);
  const [privyError, setPrivyError] = useState<string | null>(null);

  // Handle Privy authentication completion
  useEffect(() => {
    const handlePrivyAuth = async () => {
      if (isPrivyAuthenticated && privyUser && !isAuthenticated && !isPrivyLoading) {
        setIsPrivyLoading(true);
        setPrivyError(null);
        
        try {
          // Call backend to authenticate - backend will validate token and fetch all data from Privy API
          const success = await authenticateWithBackend();
          
          if (success) {
            // Get the user from backend
            const currentUser = await api.getCurrentUser();
            setUserFromPrivy(currentUser);
            router.push('/');
          } else {
            setPrivyError('Failed to authenticate. Please make sure your X account is linked in Privy.');
          }
        } catch (error) {
          console.error('Privy auth error:', error);
          const errorMessage = error instanceof Error ? error.message : 'Authentication failed';
          setPrivyError(errorMessage);
        } finally {
          setIsPrivyLoading(false);
        }
      }
    };

    handlePrivyAuth();
  }, [isPrivyAuthenticated, privyUser, isAuthenticated, isPrivyLoading, authenticateWithBackend, setUserFromPrivy, router]);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading || (!isPrivyReady && !isAuthenticated)) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  const handlePrivyLogin = async () => {
    setPrivyError(null);
    try {
      await loginWithPrivy();
    } catch (error) {
      console.error('Failed to open Privy login:', error);
      setPrivyError('Failed to open login. Please try again.');
    }
  };

  return (
    <div className="fixed inset-0 overflow-hidden">
      {/* Background Image */}
      <Image
        src="https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/7cad699c-265b-463d-1175-23d86aa9d200/public"
        alt="CryptArena Background"
        fill
        priority
        className="object-cover object-center"
        quality={100}
      />

      {/* Content Overlay */}
      <div className="relative z-10 flex h-full w-full items-center justify-between px-12 md:px-20 lg:px-32">
        {/* Left Side - Title */}
        <div className={`flex flex-col gap-0 ${aceOfSwords.variable}`}>
          <h1 className="text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-normal text-black tracking-tight leading-[0.95]"
              style={{ fontFamily: 'var(--font-ace-of-swords), system-ui, sans-serif' }}>
            THE
          </h1>
          <h1 className="text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-normal text-black tracking-tight leading-[0.95]"
              style={{ fontFamily: 'var(--font-ace-of-swords), system-ui, sans-serif' }}>
            ADVENTURE
          </h1>
          <h1 className="text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-normal text-black tracking-tight leading-[0.95]"
              style={{ fontFamily: 'var(--font-ace-of-swords), system-ui, sans-serif' }}>
            BEGINS NOW
          </h1>
        </div>

        {/* Right Side - Login Card with Liquid Glass Effect */}
        <div className="relative rounded-3xl p-10 md:p-12 lg:p-14 flex flex-col items-center gap-6 w-full max-w-md overflow-hidden">
          {/* Glass background layers */}
          <div className="absolute inset-0 bg-white/15 backdrop-blur-xl rounded-3xl" />
          <div className="absolute inset-0 bg-gradient-to-br from-white/30 via-white/15 to-white/10 rounded-3xl" />
          <div className="absolute inset-0 rounded-3xl border border-white/40 shadow-[0_8px_32px_rgba(0,0,0,0.1),inset_0_0_60px_rgba(255,255,255,0.1)]" />
          
          {/* Inner highlight - top edge glow */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent" />
          
          {/* Liquid shine effect */}
          <div className="absolute -top-20 -right-20 w-40 h-40 bg-white/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-white/15 rounded-full blur-2xl pointer-events-none" />

          {/* Logo */}
          <div className="relative w-56 h-20 z-10">
            <Image
              src="https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/96807945-a58d-48f2-bb50-efd65c3aa100/public"
              alt="CryptArena Logo"
              fill
              className="object-contain drop-shadow-lg"
              priority
            />
          </div>

          {/* Welcome Text */}
          <div className="text-center z-10">
            <h2 className="text-xl font-semibold text-zinc-800 mb-2 drop-shadow-sm">Welcome, Champion</h2>
            <p className="text-zinc-600 text-sm">
              Choose your path to enter the arena
            </p>
          </div>

          {/* Error Message */}
          {privyError && (
            <div className="z-10 w-full px-4 py-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-800 text-sm text-center">
              {privyError}
            </div>
          )}

          {/* Privy Login Button (Recommended) */}
          <button
            onClick={handlePrivyLogin}
            disabled={isPrivyLoading}
            className="relative cursor-pointer z-10 w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold py-4 px-8 rounded-full transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] text-lg shadow-lg hover:shadow-2xl flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isPrivyLoading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                <span>Connecting...</span>
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path d="M17.6874 3.0625L12.6907 8.77425L8.37045 3.0625H2.11328L9.58961 12.8387L2.50378 20.9375H5.53795L11.0068 14.6886L15.7863 20.9375H21.8885L14.095 10.6342L20.7198 3.0625H17.6874ZM16.6232 19.1225L5.65436 4.78217H7.45745L18.3034 19.1225H16.6232Z"></path>
                </svg>
                <span>Quick Login with X</span>
              </>
            )}
          </button>

          {/* Info text for Privy */}
          <p className="z-10 text-zinc-600 text-xs text-center">
            Recommended: Auto-generates a Solana wallet for you
          </p>

          {/* Divider */}
          <div className="z-10 w-full flex items-center gap-4">
            <div className="flex-1 h-px bg-zinc-400/50"></div>
            <span className="text-zinc-500 text-sm">or</span>
            <div className="flex-1 h-px bg-zinc-400/50"></div>
          </div>

          {/* Direct Twitter Login Button */}
          <button
            onClick={login}
            className="relative cursor-pointer z-10 w-full bg-black/80 hover:bg-black text-white font-semibold py-4 px-8 rounded-full transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] text-lg shadow-lg hover:shadow-2xl flex items-center justify-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M17.6874 3.0625L12.6907 8.77425L8.37045 3.0625H2.11328L9.58961 12.8387L2.50378 20.9375H5.53795L11.0068 14.6886L15.7863 20.9375H21.8885L14.095 10.6342L20.7198 3.0625H17.6874ZM16.6232 19.1225L5.65436 4.78217H7.45745L18.3034 19.1225H16.6232Z"></path>
            </svg>
            <span>Connect X + External Wallet</span>
          </button>

          {/* Info text for direct Twitter */}
          <p className="z-10 text-zinc-600 text-xs text-center">
            Connect your own Solana wallet (Phantom, Solflare, etc.)
          </p>

          {/* Terms Text */}
          <p className="text-zinc-500 text-xs text-center leading-relaxed z-10 mt-2">
            By continuing, you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>

      {/* Bottom Left - EntertainM Logo */}
      <div className="absolute bottom-6 left-12 md:left-20 lg:left-32 z-10">
        <div className="relative w-32 h-10">
          <Image
            src="https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/3e22062c-ee6e-4a65-098f-111145913900/public"
            alt="EntertainM Logo"
            fill
            className="object-contain object-left"
          />
        </div>
      </div>
    </div>
  );
}
