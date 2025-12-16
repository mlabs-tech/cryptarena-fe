'use client';

import { useEffect, useRef, useState } from 'react';

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

export interface ChartDataPoint {
  symbol: string;
  assetIndex: number;
  volatility: number;
  startPrice: number | null;
  currentPrice: number | null;
}

interface ChampionData {
  symbol: string;
  assetIndex: number;
  color: string;
  currentVolatility: number;
  previousVolatility: number;
  rank: number;
  previousRank: number;
  lastUpdateTime: number;
  justTookLead: boolean;
}

interface SimpleVolatilityChartProps {
  data: ChartDataPoint[];
  height?: number;
  isStreaming?: boolean;
}

export default function SimpleVolatilityChart({ 
  data, 
  height = 500,
  isStreaming = false,
}: SimpleVolatilityChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number>(0);
  const animatedPositionsRef = useRef<Record<string, number>>({});
  const previousDataRef = useRef<ChartDataPoint[]>([]);
  const previousRanksRef = useRef<Record<string, number>>({});
  const lastLeaderRef = useRef<string>('');
  
  const [champions, setChampions] = useState<ChampionData[]>([]);
  const drawRef = useRef<() => void>(() => {});

  // Convert data to champions format
  useEffect(() => {
    if (data.length === 0) return;

    const now = Date.now();
    
    // Sort by volatility to get ranks
    const sortedData = [...data].sort((a, b) => b.volatility - a.volatility);
    const newLeader = sortedData[0]?.symbol;
    const leaderChanged = lastLeaderRef.current !== '' && lastLeaderRef.current !== newLeader;
    
    const newChampions: ChampionData[] = sortedData.map((item, idx) => {
      const previousData = previousDataRef.current.find(p => p.symbol === item.symbol);
      const previousRank = previousRanksRef.current[item.symbol] ?? idx + 1;
      const volatilityChanged = previousData && Math.abs(previousData.volatility - item.volatility) > 0.0001;
      
      return {
        symbol: item.symbol,
        assetIndex: item.assetIndex,
        color: TOKEN_COLORS[item.symbol] || '#ffffff',
        currentVolatility: item.volatility,
        previousVolatility: previousData?.volatility ?? item.volatility,
        rank: idx + 1,
        previousRank: previousRank,
        lastUpdateTime: volatilityChanged ? now : (champions.find(c => c.symbol === item.symbol)?.lastUpdateTime ?? now - 1000),
        justTookLead: leaderChanged && item.symbol === newLeader,
      };
    });

    // Update refs for next comparison
    previousDataRef.current = data;
    const newRanks: Record<string, number> = {};
    sortedData.forEach((item, idx) => {
      newRanks[item.symbol] = idx + 1;
    });
    previousRanksRef.current = newRanks;
    lastLeaderRef.current = newLeader;

    setChampions(newChampions);
  }, [data]);

  // Animate positions smoothly - redraws on every frame for 60fps
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
    const duration = 300; // Faster animation for more responsiveness

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

      // Update ref
      animatedPositionsRef.current = newPositions;
      
      // Redraw canvas on every frame
      drawRef.current();

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [champions]);

  // Draw function stored in ref so animation can call it
  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container || champions.length === 0) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      
      // Only resize if needed
      const targetWidth = rect.width * dpr;
      const targetHeight = height * dpr;
      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${height}px`;
      }
      
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const width = rect.width;
      const PADDING = { top: 50, right: 100, bottom: 40, left: 90 };
      const trackHeight = (height - PADDING.top - PADDING.bottom) / champions.length;

      // Clear
      ctx.clearRect(0, 0, width, height);

      // Calculate range from display positions (use ref for animated positions)
      const displayPositionsForRange: Record<string, number> = {};
      champions.forEach(c => {
        displayPositionsForRange[c.symbol] = animatedPositionsRef.current[c.symbol] ?? c.currentVolatility;
      });
      
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
      const circleRadius = 18;
      const now = Date.now();
      
      sortedChampions.forEach((champ, displayIndex) => {
        const trackY = PADDING.top + displayIndex * trackHeight + trackHeight / 2;
        const volatility = displayPositions[champ.symbol] ?? 0;
        const champX = PADDING.left + ((volatility - minVol) / (maxVol - minVol)) * (width - PADDING.left - PADDING.right);
        
        // Check if volatility recently changed (flash effect)
        const timeSinceUpdate = now - champ.lastUpdateTime;
        const isFlashing = timeSinceUpdate < 500;
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

        // Draw champion marker
        ctx.beginPath();
        ctx.arc(champX, trackY, circleRadius, 0, Math.PI * 2);
        ctx.fillStyle = isNewLeader ? 'rgba(255, 215, 0, 0.3)' : 'rgba(0, 0, 0, 0.6)';
        ctx.fill();
        ctx.strokeStyle = isNewLeader ? '#FFD700' : champ.color;
        ctx.lineWidth = isNewLeader ? 3 : 2;
        ctx.stroke();

        // Draw symbol in circle
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
        if (champ.previousRank !== champ.rank) {
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
    };

    // Store draw function in ref
    drawRef.current = draw;
    
    // Initial draw
    draw();
  }, [champions, height]);

  if (data.length === 0) {
    return (
      <div 
        className="flex items-center justify-center bg-white/5 backdrop-blur-md rounded-xl border border-white/10"
        style={{ height }}
      >
        <div className="text-center">
          <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-white/50 text-lg mb-2">Waiting for data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Streaming indicator */}
      {isStreaming && (
        <div className="absolute top-3 left-4 z-10 flex items-center gap-2 px-2 py-1 bg-green-500/20 rounded-lg border border-green-500/30">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          <span className="text-green-400 text-xs font-medium">Pyth Stream</span>
        </div>
      )}

      {/* Arena battlefield canvas */}
      <div 
        ref={containerRef}
        className="bg-white/5 backdrop-blur-md rounded-xl border border-white/10 overflow-hidden shadow-xl"
        style={{ height }}
      >
        <canvas ref={canvasRef} />
      </div>

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
