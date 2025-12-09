'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { indexerApi, AssetVolatilityData, VolatilityPoint } from '@/lib/indexer-api';

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
}

interface ChampionData {
  symbol: string;
  assetIndex: number;
  color: string;
  currentVolatility: number;
  rank: number;
  previousRank: number;
  history: VolatilityPoint[];
  startPrice: number;
}

export default function VolatilityChart({ 
  arenaId, 
  height = 500,
  refreshInterval = 5000 
}: VolatilityChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number>(0);
  
  const [champions, setChampions] = useState<ChampionData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'live' | 'history'>('live');
  const [historyIndex, setHistoryIndex] = useState(0);
  const [maxHistoryLength, setMaxHistoryLength] = useState(0);
  const [animatedPositions, setAnimatedPositions] = useState<Record<string, number>>({});

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      const response = await indexerApi.getArenaVolatility(arenaId, '1m');
      
      // Convert to champion data
      const champData: ChampionData[] = response.assets
        .filter(a => a.data.length > 0)
        .map(asset => ({
          symbol: asset.symbol,
          assetIndex: asset.assetIndex,
          color: TOKEN_COLORS[asset.symbol] || '#ffffff',
          currentVolatility: asset.data.length > 0 ? asset.data[asset.data.length - 1].volatility : 0,
          rank: 0,
          previousRank: 0,
          history: asset.data,
          startPrice: asset.startPrice,
        }));

      // Sort by volatility to get rankings
      champData.sort((a, b) => b.currentVolatility - a.currentVolatility);
      
      // Assign ranks
      champData.forEach((champ, index) => {
        const existingChamp = champions.find(c => c.symbol === champ.symbol);
        champ.previousRank = existingChamp?.rank || index + 1;
        champ.rank = index + 1;
      });

      // Find max history length
      const maxLen = Math.max(...champData.map(c => c.history.length), 0);
      setMaxHistoryLength(maxLen);
      setHistoryIndex(maxLen - 1);

      setChampions(champData);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch volatility data:', err);
      setError('Failed to load arena data');
    } finally {
      setIsLoading(false);
    }
  }, [arenaId, champions]);

  useEffect(() => {
    fetchData();
    const timer = window.setInterval(fetchData, refreshInterval);
    return () => window.clearInterval(timer);
  }, [arenaId, refreshInterval]);

  // Animate positions smoothly
  useEffect(() => {
    if (champions.length === 0) return;

    const targetPositions: Record<string, number> = {};
    champions.forEach(champ => {
      targetPositions[champ.symbol] = champ.currentVolatility;
    });

    let startTime: number | null = null;
    const duration = 500;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);

      const newPositions: Record<string, number> = {};
      champions.forEach(champ => {
        const current = animatedPositions[champ.symbol] ?? champ.currentVolatility;
        const target = targetPositions[champ.symbol];
        newPositions[champ.symbol] = current + (target - current) * easeOut;
      });

      setAnimatedPositions(newPositions);

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

    // Calculate range from display positions
    const displayPositionsForRange: Record<string, number> = {};
    if (viewMode === 'live') {
      champions.forEach(c => {
        displayPositionsForRange[c.symbol] = animatedPositions[c.symbol] ?? c.currentVolatility;
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

    // Draw title with live indicator
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('LIVE', PADDING.left, 28);

    // Draw live indicator dot
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(PADDING.left + 42, 24, 4, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw sync interval info
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText(`updates every ${refreshInterval / 1000}s`, PADDING.left + 55, 28);

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
    sortedChampions.forEach((champ, displayIndex) => {
      const trackY = PADDING.top + displayIndex * trackHeight + trackHeight / 2;
      const volatility = displayPositions[champ.symbol] ?? 0;
      const champX = PADDING.left + ((volatility - minVol) / (maxVol - minVol)) * (width - PADDING.left - PADDING.right);

      // Draw track line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PADDING.left, trackY);
      ctx.lineTo(width - PADDING.right, trackY);
      ctx.stroke();

      // Draw energy trail
      const trailLength = Math.min(champX - PADDING.left, 120);
      const gradient = ctx.createLinearGradient(champX - trailLength, trackY, champX, trackY);
      gradient.addColorStop(0, 'transparent');
      gradient.addColorStop(1, champ.color + '40');
      
      ctx.fillStyle = gradient;
      ctx.fillRect(champX - trailLength, trackY - 6, trailLength, 12);

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

      // Draw champion marker
      ctx.beginPath();
      ctx.arc(champX, trackY, 12, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fill();
      ctx.strokeStyle = champ.color;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw symbol in circle
      ctx.fillStyle = champ.color;
      ctx.font = 'bold 7px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const shortSymbol = champ.symbol.length > 4 ? champ.symbol.slice(0, 3) : champ.symbol;
      ctx.fillText(shortSymbol, champX, trackY);

      // Draw volatility on right
      ctx.fillStyle = volatility >= 0 ? '#38bdf8' : '#ef4444';
      ctx.font = 'bold 11px monospace';
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
        ctx.fillText(change > 0 ? `▲${change}` : `▼${Math.abs(change)}`, width - 75, trackY + 1);
      }
    });

    // Draw leader crown/star
    if (sortedChampions.length > 0) {
      const leader = sortedChampions[0];
      const leaderVol = displayPositions[leader.symbol] ?? 0;
      const leaderX = PADDING.left + ((leaderVol - minVol) / (maxVol - minVol)) * (width - PADDING.left - PADDING.right);
      const leaderY = PADDING.top + trackHeight / 2;
      
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('⭐', leaderX, leaderY - 18);
    }

  }, [champions, animatedPositions, height, viewMode, historyIndex, refreshInterval]);

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
          <p className="text-white/50 text-lg mb-2">Waiting for champions...</p>
          <p className="text-white/30 text-sm">Price data will appear once the battle begins</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* View mode toggle */}
      <div className="absolute top-3 right-4 z-10 flex gap-2">
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
      </div>

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

      {/* Leaderboard summary */}
      <div className="mt-4 grid grid-cols-5 gap-2">
        {champions.slice(0, 5).map((champ, idx) => (
          <div 
            key={champ.symbol}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg backdrop-blur-sm border transition-all ${
              idx === 0 
                ? 'bg-amber-500/10 border-amber-500/30 shadow-lg shadow-amber-500/10' 
                : 'bg-white/5 border-white/10 hover:bg-white/10'
            }`}
          >
            <span className={`text-xs font-bold ${
              idx === 0 ? 'text-amber-400' : idx === 1 ? 'text-zinc-300' : idx === 2 ? 'text-orange-400' : 'text-white/40'
            }`}>
              {idx === 0 ? '1st' : idx === 1 ? '2nd' : idx === 2 ? '3rd' : `#${idx + 1}`}
            </span>
            <span className="text-white text-xs font-medium">{champ.symbol}</span>
            <span className={`text-xs font-bold ml-auto ${
              champ.currentVolatility >= 0 ? 'text-sky-400' : 'text-red-400'
            }`}>
              {champ.currentVolatility >= 0 ? '+' : ''}{champ.currentVolatility.toFixed(4)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
