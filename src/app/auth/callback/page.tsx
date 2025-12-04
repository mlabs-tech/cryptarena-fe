'use client';

import { Suspense, useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { getPKCEData, validateState, clearPKCEData } from '@/lib/twitter-auth';

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  
  // Ref to prevent double execution in StrictMode
  const hasCalledRef = useRef(false);

  useEffect(() => {
    // Prevent double execution
    if (hasCalledRef.current) return;
    hasCalledRef.current = true;

    const handleCallback = async () => {
      try {
        // Get OAuth response from URL
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        const errorParam = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');

        // Handle OAuth errors
        if (errorParam) {
          throw new Error(errorDescription || errorParam);
        }

        // Validate required params
        if (!code || !state) {
          throw new Error('Invalid callback: missing authorization code or state');
        }

        // Validate state to prevent CSRF attacks
        if (!validateState(state)) {
          throw new Error('Invalid state parameter. Please try logging in again.');
        }

        // Get PKCE data
        const pkceData = getPKCEData();
        if (!pkceData) {
          throw new Error('PKCE data not found. Please try logging in again.');
        }

        // Exchange code for tokens
        await api.twitterCallback(code, pkceData.codeVerifier);

        // Clear PKCE data
        clearPKCEData();

        // Success
        setStatus('success');
        
        // Redirect to home with full page reload so AuthContext picks up the new tokens
        setTimeout(() => {
          window.location.href = '/';
        }, 1000);

      } catch (err) {
        console.error('Auth callback error:', err);
        setError(err instanceof Error ? err.message : 'Authentication failed');
        setStatus('error');
        clearPKCEData();
      }
    };

    handleCallback();
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] px-4">
      {/* Background effect */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-b from-amber-500/10 via-transparent to-transparent rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-8 max-w-md w-full">
        {status === 'processing' && (
          <>
            <div className="relative">
              <div className="absolute inset-0 bg-amber-500/20 blur-2xl rounded-full animate-pulse" />
              <div className="relative animate-spin rounded-full h-16 w-16 border-4 border-zinc-800 border-t-amber-500" />
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-semibold text-white mb-2">
                Authenticating...
              </h1>
              <p className="text-zinc-500">
                Connecting to your X account
              </p>
            </div>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="relative">
              <div className="absolute inset-0 bg-emerald-500/20 blur-2xl rounded-full" />
              <div className="relative flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500">
                <svg
                  className="w-8 h-8 text-emerald-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-semibold text-white mb-2">
                Welcome to CryptArena!
              </h1>
              <p className="text-zinc-500">
                Redirecting you to the arena...
              </p>
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="relative">
              <div className="absolute inset-0 bg-red-500/20 blur-2xl rounded-full" />
              <div className="relative flex items-center justify-center w-16 h-16 rounded-full bg-red-500/20 border-2 border-red-500">
                <svg
                  className="w-8 h-8 text-red-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </div>
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-semibold text-white mb-2">
                Authentication Failed
              </h1>
              <p className="text-zinc-500 mb-4">
                {error || 'Something went wrong. Please try again.'}
              </p>
              <button
                onClick={() => router.push('/login')}
                className="inline-flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white font-medium py-3 px-6 rounded-xl transition-all duration-200"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 19l-7-7m0 0l7-7m-7 7h18"
                  />
                </svg>
                Back to Login
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] px-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-b from-amber-500/10 via-transparent to-transparent rounded-full blur-3xl" />
      </div>
      <div className="relative z-10 flex flex-col items-center gap-8">
        <div className="relative">
          <div className="absolute inset-0 bg-amber-500/20 blur-2xl rounded-full animate-pulse" />
          <div className="relative animate-spin rounded-full h-16 w-16 border-4 border-zinc-800 border-t-amber-500" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-white mb-2">Loading...</h1>
        </div>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <AuthCallbackContent />
    </Suspense>
  );
}
