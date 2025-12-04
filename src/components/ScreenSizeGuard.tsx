'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

const MIN_WIDTH = 1024; // Minimum supported width in pixels

export default function ScreenSizeGuard({ children }: { children: React.ReactNode }) {
  const [isTooSmall, setIsTooSmall] = useState(false);
  const [isChecked, setIsChecked] = useState(false);
  const [currentWidth, setCurrentWidth] = useState(0);

  useEffect(() => {
    const checkSize = () => {
      const width = window.innerWidth;
      setCurrentWidth(width);
      setIsTooSmall(width < MIN_WIDTH);
      setIsChecked(true);
    };

    // Check on mount
    checkSize();

    // Check on resize
    window.addEventListener('resize', checkSize);
    return () => window.removeEventListener('resize', checkSize);
  }, []);

  // Don't render anything until we've checked (prevents flash)
  if (!isChecked) {
    return null;
  }

  if (isTooSmall) {
    return (
      <div className="fixed inset-0 bg-[#0a0a0a] flex flex-col items-center justify-center p-8 z-[9999]">
        {/* Background gradient */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-gradient-to-b from-amber-500/10 via-orange-500/5 to-transparent rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 flex flex-col items-center gap-8 max-w-md text-center">
          {/* Icon */}
          <div className="relative w-24 h-24">
            <div className="absolute inset-0 bg-amber-500/20 rounded-full blur-xl animate-pulse" />
            <div className="relative w-full h-full flex items-center justify-center">
              <svg
                className="w-16 h-16 text-amber-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>
          </div>

          {/* Logo */}
          <div className="relative w-48 h-16">
            <Image
              src="https://imagedelivery.net/6WLqUjtBbGnMsdHq6NNK_w/96807945-a58d-48f2-bb50-efd65c3aa100/public"
              alt="CryptArena Logo"
              fill
              className="object-contain"
              priority
            />
          </div>

          {/* Message */}
          <div className="space-y-4">
            <h1 className="text-2xl font-bold text-white">
              Larger Screen Required
            </h1>
            <p className="text-zinc-400 leading-relaxed">
              CryptArena is optimized for desktop experiences. Please use a device with a screen width of at least <span className="text-amber-500 font-semibold">{MIN_WIDTH}px</span> for the best gaming experience.
            </p>
          </div>

          {/* Current size indicator */}
          <div className="flex items-center gap-2 px-4 py-2 bg-zinc-800/50 rounded-full border border-zinc-700/50">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-zinc-500 text-sm">
              Current width: <span className="text-zinc-300 font-mono">{currentWidth}px</span>
            </span>
          </div>

          {/* Suggestion */}
          <p className="text-zinc-600 text-xs">
            Try rotating your device to landscape mode or switch to a desktop computer.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

