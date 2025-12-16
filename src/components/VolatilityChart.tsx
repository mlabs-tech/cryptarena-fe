'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { indexerApi, VolatilityPoint } from '@/lib/indexer-api';
import { usePythStream, useArenaVolatility } from '@/context/PythStreamContext';

// Token colors - distinct colors for each token (including EVM tokens)
const TOKEN_COLORS: Record<string, string> = {
  SOL: '#14F195',
  TRUMP: '#FF6B6B',
  PUMP: '#4ECDC4',
  BONK: '#FFE66D',
  JUP: '#95E1D3',
  PENGU: '#A8E6CF',
  PYTH: '#DDA0DD',
  HNT: '#87CEEB',
  FARTCOIN: '#F4A460',
  RAY: '#9B59B6',
  JTO: '#3498DB',
  KMNO: '#E74C3C',
  MET: '#1ABC9C',
  W: '#F39C12',
  // EVM tokens
  ETH: '#627EEA',
  UNI: '#FF007A',
  LINK: '#2A5ADA',
  PEPE: '#00B386',
  SHIB: '#FFA500',
};

interface VolatilityChartProps {
  arenaId: string;
  height?: number;
  refreshInterval?: number;
  enableStreaming?: boolean; // Set to false for ended/canceled arenas
  useIndexerPrices?: boolean; // When true (last 10 seconds), use indexer instead of Pyth stream
  externalVolatilityData?: Map<number, number>; // Optional: pass volatility data from parent (for consistency with participant list)
}

interface ChampionData {
  symbol: string;
  assetIndex: number;
  color: string;
  currentVolatility: number;
  previousVolatility: number;
  rank: number;
  previousRank: number;
  history: VolatilityPoint[];
  startPrice: number;
  currentPrice: number;
  lastUpdateTime: number;
  justTookLead: boolean;
}

export default function VolatilityChart({ 
  arenaId, 
  height = 500,
  refreshInterval = 5000,
  enableStreaming = true,
  useIndexerPrices = false,
  externalVolatilityData
}: VolatilityChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number>(0);
  const animatedPositionsRef = useRef<Record<string, number>>({});
  
  // Use shared Pyth stream context (only if streaming is enabled AND not using indexer prices)
  const shouldStream = enableStreaming && !useIndexerPrices;
  const { subscribeToArena, unsubscribeFromArena } = usePythStream();
  const { data: streamData, isStreaming, lastUpdate } = useArenaVolatility(shouldStream ? arenaId : '');
  
  const [champions, setChampions] = useState<ChampionData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'live' | 'history'>('live');
  const [historyIndex, setHistoryIndex] = useState(0);
  const [maxHistoryLength, setMaxHistoryLength] = useState(0);
  const [animationTrigger, setAnimationTrigger] = useState(0); // Used to trigger re-render after animation completes
  const [historyData, setHistoryData] = useState<Record<string, VolatilityPoint[]>>({});

  // Initial data fetch from indexer (to get start prices and participant info)
  const fetchInitialData = useCallback(async () => {
    try {
      const response = await indexerApi.getArenaVolatility(arenaId, '1m');
      
      // Subscribe to Pyth stream with ALL tokens (not just those with history)
      // This ensures we subscribe even when arena just started and has no price history yet
      // Don't subscribe if using indexer prices (last 10 seconds)
      if (shouldStream && response.assets.length > 0) {
        const tokens = response.assets.map(asset => ({
          symbol: asset.symbol,
          assetIndex: asset.assetIndex,
          startPrice: asset.startPrice,
        }));
        
        subscribeToArena(arenaId, tokens);
        
        // Initialize champions immediately with zero volatility
        // This prevents "Waiting for champions..." while stream connects
        if (champions.length === 0) {
          setChampions(tokens.map((token, idx) => ({
            symbol: token.symbol,
            assetIndex: token.assetIndex,
            color: TOKEN_COLORS[token.symbol] || '#ffffff',
            currentVolatility: 0,
            previousVolatility: 0,
            rank: idx + 1,
            previousRank: idx + 1,
            history: [],
            startPrice: token.startPrice,
            currentPrice: token.startPrice,
            lastUpdateTime: Date.now(),
            justTookLead: false,
          })));
        }
      }
      
      // Store history data
      const historyMap: Record<string, VolatilityPoint[]> = {};
      response.assets.forEach(asset => {
        historyMap[asset.symbol] = asset.data;
      });
      setHistoryData(historyMap);

      // Find max history length
      const maxLen = Math.max(...response.assets.map(a => a.data.length), 0);
      setMaxHistoryLength(maxLen);
      setHistoryIndex(maxLen - 1);

      setError(null);
    } catch (err) {
      console.error('Failed to fetch volatility data:', err);
      setError('Failed to load arena data');
    } finally {
      setIsLoading(false);
    }
  }, [arenaId, subscribeToArena, shouldStream, champions.length]);

  // Unsubscribe from Pyth stream and use external volatility data when switching to indexer prices
  useEffect(() => {
    if (useIndexerPrices) {
      console.log('[VolatilityChart] Switching to indexer prices, unsubscribing from Pyth stream');
      unsubscribeFromArena(arenaId);
    }
  }, [useIndexerPrices, arenaId, unsubscribeFromArena]);

  // Track the last external volatility values to avoid unnecessary updates
  const lastExternalVolatilityRef = useRef<string>('');

  // Update champions from external volatility data (when using indexer prices)
  useEffect(() => {
    if (useIndexerPrices && externalVolatilityData && externalVolatilityData.size > 0) {
      // Create a string representation to compare values (Maps are reference types)
      const volatilityString = Array.from(externalVolatilityData.entries())
        .sort(([a], [b]) => a - b)
        .map(([k, v]) => `${k}:${v}`)
        .join(',');
      
      // Skip if values haven't changed
      if (volatilityString === lastExternalVolatilityRef.current) {
        return;
      }
      lastExternalVolatilityRef.current = volatilityString;
      
      console.log('[VolatilityChart] Updating from external volatility data');
      setChampions(prevChampions => {
        if (prevChampions.length === 0) return prevChampions;
        
        const updatedChampions = prevChampions.map(champ => ({
          ...champ,
          currentVolatility: externalVolatilityData.get(champ.assetIndex) ?? champ.currentVolatility,
          previousVolatility: champ.currentVolatility,
        }));
        
        // Sort by volatility descending and assign ranks
        updatedChampions.sort((a, b) => b.currentVolatility - a.currentVolatility);
        updatedChampions.forEach((champ, idx) => {
          champ.rank = idx + 1;
          champ.previousRank = idx + 1;
        });
        
        return updatedChampions;
      });
    }
  }, [useIndexerPrices, externalVolatilityData]);

  // Update champions from stream data (only when NOT using indexer prices)
  useEffect(() => {
    if (streamData.length > 0 && !useIndexerPrices) {
      setChampions(streamData.map(d => ({
        symbol: d.symbol,
        assetIndex: d.assetIndex,
        color: TOKEN_COLORS[d.symbol] || '#ffffff',
        currentVolatility: d.volatility,
        previousVolatility: d.previousVolatility,
        rank: d.rank,
        previousRank: d.previousRank,
        history: historyData[d.symbol] || [],
        startPrice: d.startPrice,
        currentPrice: d.currentPrice,
        lastUpdateTime: d.lastUpdateTime,
        justTookLead: d.justTookLead,
      })));
    }
  }, [streamData, historyData, useIndexerPrices]);

  // Initial load and cleanup
  useEffect(() => {
    fetchInitialData();

    // Refresh history from indexer periodically
    const timer = window.setInterval(async () => {
      try {
        const response = await indexerApi.getArenaVolatility(arenaId, '1m');
        const historyMap: Record<string, VolatilityPoint[]> = {};
        response.assets.forEach(asset => {
          historyMap[asset.symbol] = asset.data;
        });
        setHistoryData(historyMap);
        setMaxHistoryLength(Math.max(...response.assets.map(a => a.data.length), 0));
      } catch (err) {
        console.error('Failed to refresh history:', err);
      }
    }, refreshInterval);

    return () => {
      window.clearInterval(timer);
      if (shouldStream) {
        unsubscribeFromArena(arenaId);
      }
    };
  }, [arenaId, refreshInterval, fetchInitialData, unsubscribeFromArena, shouldStream]);

  // Animate positions smoothly using refs to avoid re-render loops
  useEffect(() => {
    if (champions.length === 0) return;

    const targetPositions: Record<string, number> = {};
    champions.forEach(champ => {
      targetPositions[champ.symbol] = champ.currentVolatility;
    });

    // Capture starting positions from ref
    const startPositions: Record<string, number> = {};
    champions.forEach(champ => {
      startPositions[champ.symbol] = animatedPositionsRef.current[champ.symbol] ?? champ.currentVolatility;
    });

    let startTime: number | null = null;
    const duration = 500;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);

      const newPositions: Record<string, number> = {};
      champions.forEach(champ => {
        const start = startPositions[champ.symbol];
        const target = targetPositions[champ.symbol];
        newPositions[champ.symbol] = start + (target - start) * easeOut;
      });

      // Update ref (doesn't cause re-render)
      animatedPositionsRef.current = newPositions;

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        // Animation complete - trigger a single re-render to update canvas
        setAnimationTrigger(prev => prev + 1);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [champions]);

  // Draw arena battlefield
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || champions.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const PADDING = { top: 50, right: 100, bottom: 40, left: 90 };
    const trackHeight = (height - PADDING.top - PADDING.bottom) / champions.length;

    // Clear with transparent background (glass will be from CSS)
    ctx.clearRect(0, 0, width, height);

    // Calculate range from display positions (use ref for animated positions)
    const displayPositionsForRange: Record<string, number> = {};
    if (viewMode === 'live') {
      champions.forEach(c => {
        displayPositionsForRange[c.symbol] = animatedPositionsRef.current[c.symbol] ?? c.currentVolatility;
      });
    } else {
      champions.forEach(c => {
        const histPoint = c.history[historyIndex];
        displayPositionsForRange[c.symbol] = histPoint?.volatility ?? 0;
      });
    }
    
    const volatilityValues = Object.values(displayPositionsForRange);
    const actualMin = Math.min(...volatilityValues, 0);
    const actualMax = Math.max(...volatilityValues, 0);
    const spread = actualMax - actualMin;
    const minSpread = 0.1;
    const effectiveSpread = Math.max(spread, minSpread);
    const center = (actualMax + actualMin) / 2;
    const halfRange = effectiveSpread * 0.8;
    
    let minVol = center - halfRange;
    let maxVol = center + halfRange;
    
    if (actualMin >= 0) minVol = Math.min(-halfRange * 0.1, minVol);
    if (actualMax <= 0) maxVol = Math.max(halfRange * 0.1, maxVol);
    
    const finalRange = maxVol - minVol;
    if (finalRange < minSpread) {
      const adjustment = (minSpread - finalRange) / 2;
      minVol -= adjustment;
      maxVol += adjustment;
    }

    // Removed LIVE indicator, green bullet, and real-time streaming text
    // Pyth streaming indicator is shown in the UI overlay instead

    // Draw zero line (starting position)
    const zeroX = PADDING.left + ((0 - minVol) / (maxVol - minVol)) * (width - PADDING.left - PADDING.right);
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(zeroX, PADDING.top);
    ctx.lineTo(zeroX, height - PADDING.bottom);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw "START" label
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('START', zeroX, height - PADDING.bottom + 18);

    // Draw percentage markers
    const range = maxVol - minVol;
    const markerCount = 5;
    const markers: number[] = [];
    for (let i = 0; i < markerCount; i++) {
      markers.push(minVol + (range * i / (markerCount - 1)));
    }
    
    markers.forEach(vol => {
      const x = PADDING.left + ((vol - minVol) / (maxVol - minVol)) * (width - PADDING.left - PADDING.right);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${vol >= 0 ? '+' : ''}${vol.toFixed(4)}%`, x, height - PADDING.bottom + 30);
    });

    const displayPositions = displayPositionsForRange;

    // Sort champions by display position for drawing order
    const sortedChampions = [...champions].sort((a, b) => 
      (displayPositions[b.symbol] ?? 0) - (displayPositions[a.symbol] ?? 0)
    );

    // Draw each champion
    const circleRadius = 18; // Increased from 12 (50% larger)
    const now = Date.now();
    
    sortedChampions.forEach((champ, displayIndex) => {
      const trackY = PADDING.top + displayIndex * trackHeight + trackHeight / 2;
      const volatility = displayPositions[champ.symbol] ?? 0;
      const champX = PADDING.left + ((volatility - minVol) / (maxVol - minVol)) * (width - PADDING.left - PADDING.right);
      
      // Check if volatility recently changed (flash effect)
      const timeSinceUpdate = now - champ.lastUpdateTime;
      const isFlashing = timeSinceUpdate < 500; // Flash for 500ms
      const flashIntensity = isFlashing ? Math.cos((timeSinceUpdate / 500) * Math.PI) * 0.5 + 0.5 : 0;
      
      // Check if this is the leader and just took the lead
      const isLeader = displayIndex === 0;
      const isNewLeader = champ.justTookLead;

      // Draw track line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PADDING.left, trackY);
      ctx.lineTo(width - PADDING.right, trackY);
      ctx.stroke();

      // Draw energy trail (larger for leader)
      const trailLength = Math.min(champX - PADDING.left, isLeader ? 150 : 120);
      const gradient = ctx.createLinearGradient(champX - trailLength, trackY, champX, trackY);
      gradient.addColorStop(0, 'transparent');
      gradient.addColorStop(1, champ.color + (isLeader ? '60' : '40'));
      
      ctx.fillStyle = gradient;
      ctx.fillRect(champX - trailLength, trackY - 8, trailLength, 16);

      // Draw rank badge
      const rankColors = ['#FFD700', '#C0C0C0', '#CD7F32'];
      const rankBg = displayIndex < 3 ? rankColors[displayIndex] : 'rgba(255, 255, 255, 0.1)';
      
      ctx.fillStyle = rankBg;
      ctx.beginPath();
      ctx.roundRect(8, trackY - 10, 22, 20, 3);
      ctx.fill();
      
      ctx.fillStyle = displayIndex < 3 ? '#000' : 'rgba(255, 255, 255, 0.7)';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${displayIndex + 1}`, 19, trackY);

      // Draw token name
      ctx.fillStyle = champ.color;
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(champ.symbol, 36, trackY + 1);

      // Draw glow effect for new leader or flashing
      if (isNewLeader || (isLeader && isFlashing)) {
        const glowRadius = circleRadius + 8 + (isNewLeader ? 4 : flashIntensity * 4);
        const glowGradient = ctx.createRadialGradient(champX, trackY, circleRadius, champX, trackY, glowRadius);
        glowGradient.addColorStop(0, isNewLeader ? '#FFD70080' : champ.color + '60');
        glowGradient.addColorStop(1, 'transparent');
        ctx.fillStyle = glowGradient;
        ctx.beginPath();
        ctx.arc(champX, trackY, glowRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw champion marker (50% larger)
      ctx.beginPath();
      ctx.arc(champX, trackY, circleRadius, 0, Math.PI * 2);
      ctx.fillStyle = isNewLeader ? 'rgba(255, 215, 0, 0.3)' : 'rgba(0, 0, 0, 0.6)';
      ctx.fill();
      ctx.strokeStyle = isNewLeader ? '#FFD700' : champ.color;
      ctx.lineWidth = isNewLeader ? 3 : 2;
      ctx.stroke();

      // Draw symbol in circle (larger font)
      ctx.fillStyle = isNewLeader ? '#FFD700' : champ.color;
      ctx.font = 'bold 9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const shortSymbol = champ.symbol.length > 4 ? champ.symbol.slice(0, 3) : champ.symbol;
      ctx.fillText(shortSymbol, champX, trackY);

      // Draw volatility on right with flash effect
      const volatilityFlash = isFlashing ? Math.floor(flashIntensity * 255) : 0;
      const baseColor = volatility >= 0 ? [56, 189, 248] : [239, 68, 68]; // sky-400 or red-500
      const flashColor = `rgb(${Math.min(255, baseColor[0] + volatilityFlash)}, ${Math.min(255, baseColor[1] + volatilityFlash)}, ${Math.min(255, baseColor[2] + volatilityFlash)})`;
      
      ctx.fillStyle = flashColor;
      ctx.font = isFlashing ? 'bold 12px monospace' : 'bold 11px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(
        `${volatility >= 0 ? '+' : ''}${volatility.toFixed(4)}%`,
        width - 12,
        trackY + 1
      );

      // Draw rank change indicator
      if (viewMode === 'live' && champ.previousRank !== champ.rank) {
        const change = champ.previousRank - champ.rank;
        ctx.fillStyle = change > 0 ? '#38bdf8' : '#ef4444';
        ctx.font = '9px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(change > 0 ? `▲${change}` : `▼${Math.abs(change)}`, width - 80, trackY + 1);
      }
    });

    // Draw leader crown/star with animation
    if (sortedChampions.length > 0) {
      const leader = sortedChampions[0];
      const leaderVol = displayPositions[leader.symbol] ?? 0;
      const leaderX = PADDING.left + ((leaderVol - minVol) / (maxVol - minVol)) * (width - PADDING.left - PADDING.right);
      const leaderY = PADDING.top + trackHeight / 2;
      
      // Larger crown for new leader
      ctx.font = leader.justTookLead ? '16px system-ui, sans-serif' : '14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('👑', leaderX, leaderY - circleRadius - 6);
    }

  }, [champions, animationTrigger, height, viewMode, historyIndex, refreshInterval, isStreaming, lastUpdate]);

  // Handle history slider
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setHistoryIndex(parseInt(e.target.value));
  };

  if (isLoading) {
    return (
      <div 
        className="flex items-center justify-center bg-white/5 backdrop-blur-md rounded-xl border border-white/10"
        style={{ height }}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-white/50 text-sm">Loading arena data...</p>
        </div>
      </div>
    );
  }

  if (error || champions.length === 0) {
    return (
      <div 
        className="flex items-center justify-center bg-white/5 backdrop-blur-md rounded-xl border border-white/10"
        style={{ height }}
      >
        <div className="text-center">
          <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-white/50 text-lg mb-2">Connecting to price feed...</p>
          <p className="text-white/30 text-sm">Real-time data will appear shortly</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Streaming indicator */}
      {isStreaming && viewMode === 'live' && (
        <div className="absolute top-3 left-4 z-10 flex items-center gap-2 px-2 py-1 bg-green-500/20 rounded-lg border border-green-500/30">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          <span className="text-green-400 text-xs font-medium">Pyth Stream</span>
        </div>
      )}

      {/* View mode toggle - History button hidden for now */}
      {/* <div className="absolute top-3 right-4 z-10 flex gap-2">
        <button
          onClick={() => setViewMode('live')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
            viewMode === 'live' 
              ? 'bg-amber-500/80 text-gray-900 shadow-lg shadow-amber-500/20' 
              : 'bg-white/10 backdrop-blur-sm text-white/60 hover:bg-white/20 border border-white/10'
          }`}
        >
          Live
        </button>
        <button
          onClick={() => setViewMode('history')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
            viewMode === 'history' 
              ? 'bg-amber-500/80 text-gray-900 shadow-lg shadow-amber-500/20' 
              : 'bg-white/10 backdrop-blur-sm text-white/60 hover:bg-white/20 border border-white/10'
          }`}
        >
          History
        </button>
      </div> */}

      {/* Arena battlefield canvas */}
      <div 
        ref={containerRef}
        className="bg-white/5 backdrop-blur-md rounded-xl border border-white/10 overflow-hidden shadow-xl"
        style={{ height }}
      >
        <canvas ref={canvasRef} />
      </div>

      {/* History slider */}
      {viewMode === 'history' && maxHistoryLength > 1 && (
        <div className="mt-4 px-4">
          <div className="flex items-center gap-4">
            <span className="text-white/50 text-xs">Past</span>
            <input
              type="range"
              min={0}
              max={maxHistoryLength - 1}
              value={historyIndex}
              onChange={handleSliderChange}
              className="flex-1 h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
            <span className="text-white/50 text-xs">Now</span>
          </div>
          {champions[0]?.history[historyIndex] && (
            <p className="text-center text-white/40 text-xs mt-2">
              {new Date(champions[0].history[historyIndex].timestamp).toLocaleTimeString()}
            </p>
          )}
        </div>
      )}

      {/* Leaderboard summary - Live Standings */}
      <div className="mt-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-white/60 text-xs font-medium uppercase tracking-wider">Live Standings</span>
          {isStreaming && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
          )}
        </div>
        <div className="grid grid-cols-5 gap-2">
          {champions.slice(0, 5).map((champ, idx) => {
            const isFlashing = Date.now() - champ.lastUpdateTime < 500;
            const isNewLeader = champ.justTookLead;
            
            return (
              <div 
                key={champ.symbol}
                className={`relative flex items-center gap-2 px-3 py-2 rounded-lg backdrop-blur-sm border transition-all overflow-hidden ${
                  isNewLeader
                    ? 'bg-amber-500/30 border-amber-400 shadow-lg shadow-amber-500/30 animate-pulse'
                    : idx === 0 
                      ? 'bg-amber-500/10 border-amber-500/30 shadow-lg shadow-amber-500/10' 
                      : 'bg-white/5 border-white/10 hover:bg-white/10'
                } ${isFlashing && !isNewLeader ? 'ring-2 ring-sky-400/50' : ''}`}
              >
                {/* Flash overlay effect */}
                {isFlashing && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_0.5s_ease-out]" />
                )}
                
                {/* New leader celebration effect */}
                {isNewLeader && (
                  <>
                    <div className="absolute inset-0 bg-gradient-to-r from-amber-500/0 via-amber-500/30 to-amber-500/0 animate-[shimmer_1s_ease-in-out_infinite]" />
                    <span className="absolute -top-1 -right-1 text-sm">🔥</span>
                  </>
                )}
                
                <span className={`relative z-10 text-xs font-bold ${
                  isNewLeader ? 'text-amber-300' : idx === 0 ? 'text-amber-400' : idx === 1 ? 'text-zinc-300' : idx === 2 ? 'text-orange-400' : 'text-white/40'
                }`}>
                  {idx === 0 ? '1st' : idx === 1 ? '2nd' : idx === 2 ? '3rd' : `#${idx + 1}`}
                </span>
                <span className={`relative z-10 text-xs font-medium ${isNewLeader ? 'text-amber-100' : 'text-white'}`}>
                  {champ.symbol}
                </span>
                <span className={`relative z-10 text-xs font-bold ml-auto transition-all ${
                  isFlashing 
                    ? 'text-white scale-110' 
                    : champ.currentVolatility >= 0 ? 'text-sky-400' : 'text-red-400'
                }`}>
                  {champ.currentVolatility >= 0 ? '+' : ''}{champ.currentVolatility.toFixed(4)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}