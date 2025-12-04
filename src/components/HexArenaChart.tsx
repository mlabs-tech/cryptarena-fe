'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { indexerApi, VolatilityPoint } from '@/lib/indexer-api';

// Token colors - distinct colors for each token
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
};

interface HexArenaChartProps {
  arenaId: string;
  size?: number;
  refreshInterval?: number;
}

interface ChampionData {
  symbol: string;
  assetIndex: number;
  color: string;
  currentVolatility: number;
  rank: number;
  history: VolatilityPoint[];
  startPrice: number;
}

export default function HexArenaChart({ 
  arenaId, 
  size = 700,
  refreshInterval = 5000 
}: HexArenaChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number>(0);
  
  const [champions, setChampions] = useState<ChampionData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [animatedPositions, setAnimatedPositions] = useState<Record<string, number>>({});

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      const response = await indexerApi.getArenaVolatility(arenaId, '1m');
      
      const champData: ChampionData[] = response.assets
        .filter(a => a.data.length > 0)
        .map(asset => ({
          symbol: asset.symbol,
          assetIndex: asset.assetIndex,
          color: TOKEN_COLORS[asset.symbol] || '#ffffff',
          currentVolatility: asset.data.length > 0 ? asset.data[asset.data.length - 1].volatility : 0,
          rank: 0,
          history: asset.data,
          startPrice: asset.startPrice,
        }));

      // Sort by volatility to get rankings
      champData.sort((a, b) => b.currentVolatility - a.currentVolatility);
      champData.forEach((champ, index) => {
        champ.rank = index + 1;
      });

      setChampions(champData);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch volatility data:', err);
      setError('Failed to load arena data');
    } finally {
      setIsLoading(false);
    }
  }, [arenaId]);

  useEffect(() => {
    fetchData();
    const timer = window.setInterval(fetchData, refreshInterval);
    return () => window.clearInterval(timer);
  }, [arenaId, refreshInterval, fetchData]);

  // Animate positions smoothly
  useEffect(() => {
    if (champions.length === 0) return;

    const targetPositions: Record<string, number> = {};
    champions.forEach(champ => {
      targetPositions[champ.symbol] = champ.currentVolatility;
    });

    // On first load, set positions immediately (no animation)
    const hasExistingPositions = Object.keys(animatedPositions).length > 0;
    if (!hasExistingPositions) {
      setAnimatedPositions(targetPositions);
      return;
    }

    let startTime: number | null = null;
    const duration = 600;

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

  // Draw hexagonal arena
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || champions.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);

    const centerX = size / 2;
    const centerY = size / 2;
    const hexRadius = size * 0.42;

    // Clear
    ctx.clearRect(0, 0, size, size);

    // Helper: draw hexagon
    const drawHexagon = (cx: number, cy: number, radius: number, fill?: string, stroke?: string, lineWidth = 1) => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 2;
        const x = cx + radius * Math.cos(angle);
        const y = cy + radius * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
      }
    };

    // Draw outer hexagon border
    drawHexagon(centerX, centerY, hexRadius, undefined, 'rgba(255, 255, 255, 0.2)', 2);

    // Draw inner hexagon rings
    for (let r = 0.2; r <= 0.8; r += 0.2) {
      drawHexagon(centerX, centerY, hexRadius * r, undefined, 'rgba(255, 255, 255, 0.05)', 1);
    }

    // Draw vertical gradient background (bottom = red/losing, top = blue/winning)
    const vertGradient = ctx.createLinearGradient(centerX, centerY + hexRadius, centerX, centerY - hexRadius);
    vertGradient.addColorStop(0, 'rgba(239, 68, 68, 0.08)'); // Red for losing (bottom)
    vertGradient.addColorStop(0.5, 'transparent');
    vertGradient.addColorStop(1, 'rgba(56, 189, 248, 0.08)'); // Light blue for winning (top)
    
    drawHexagon(centerX, centerY, hexRadius * 0.95, vertGradient, undefined);

    // Draw horizontal center line (0% baseline)
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(centerX - hexRadius * 0.8, centerY);
    ctx.lineTo(centerX + hexRadius * 0.8, centerY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw "LOSING" label (bottom)
    ctx.fillStyle = 'rgba(239, 68, 68, 0.6)';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('LOSING', centerX, centerY + hexRadius * 0.85 + 20);

    // Draw "WINNING" label (top)
    ctx.fillStyle = 'rgba(56, 189, 248, 0.6)';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('WINNING', centerX, centerY - hexRadius * 0.85 - 10);

    // Draw center marker (0% line)
    ctx.beginPath();
    ctx.arc(centerX, centerY, 6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('0%', centerX, centerY + 20);

    // Calculate volatility range
    const volatilityValues = champions.map(c => animatedPositions[c.symbol] ?? c.currentVolatility);
    const minVol = Math.min(...volatilityValues, 0);
    const maxVol = Math.max(...volatilityValues, 0);
    const maxAbsVol = Math.max(Math.abs(minVol), Math.abs(maxVol), 0.1);

    // Calculate positions for all champions first to avoid overlaps
    const positions: { champ: ChampionData; x: number; y: number; volatility: number }[] = [];
    
    // Sort by volatility for positioning
    const sortedChamps = [...champions].sort((a, b) => {
      const volA = animatedPositions[a.symbol] ?? a.currentVolatility;
      const volB = animatedPositions[b.symbol] ?? b.currentVolatility;
      return volB - volA; // Highest first
    });

    // Generate consistent "random" X offsets based on symbol
    const getXOffset = (symbol: string) => {
      let hash = 0;
      for (let i = 0; i < symbol.length; i++) {
        hash = ((hash << 5) - hash) + symbol.charCodeAt(i);
        hash = hash & hash;
      }
      return ((hash % 100) / 100) * 2 - 1; // Returns -1 to 1
    };

    // Helper to check if point is inside hexagon
    const isInsideHexagon = (x: number, y: number, margin: number = 30) => {
      const effectiveRadius = hexRadius - margin;
      const dx = Math.abs(x - centerX);
      const dy = Math.abs(y - centerY);
      
      // Simplified hexagon bounds check
      if (dy > effectiveRadius * 0.866) return false; // sqrt(3)/2
      if (dx > effectiveRadius) return false;
      if (dx + dy * 0.577 > effectiveRadius) return false; // 1/sqrt(3)
      return true;
    };

    // Clamp position to stay inside hexagon
    const clampToHexagon = (x: number, y: number, margin: number = 35): { x: number; y: number } => {
      const effectiveRadius = hexRadius - margin;
      let newX = x;
      let newY = y;
      
      // Clamp Y first
      const maxY = centerY + effectiveRadius * 0.75;
      const minY = centerY - effectiveRadius * 0.75;
      newY = Math.max(minY, Math.min(maxY, newY));
      
      // Calculate max X for this Y position (hexagon shape)
      const yRatio = Math.abs(newY - centerY) / (effectiveRadius * 0.866);
      const maxXAtY = effectiveRadius * (1 - yRatio * 0.5) * 0.85;
      
      newX = Math.max(centerX - maxXAtY, Math.min(centerX + maxXAtY, newX));
      
      return { x: newX, y: newY };
    };

    // Calculate initial positions
    sortedChamps.forEach((champ, index) => {
      const volatility = animatedPositions[champ.symbol] ?? champ.currentVolatility;
      const normalizedVol = volatility / maxAbsVol;
      
      // Y position based on volatility (keep within hexagon vertical bounds)
      let champY = centerY - normalizedVol * hexRadius * 0.55;
      
      // X position - alternate left/right based on index, with some randomness
      const baseXOffset = getXOffset(champ.symbol);
      const alternateMultiplier = index % 2 === 0 ? -1 : 1;
      const spreadFactor = 0.25 + (index % 3) * 0.15; // Reduced spread
      let champX = centerX + alternateMultiplier * hexRadius * spreadFactor + baseXOffset * hexRadius * 0.1;
      
      // Check for overlaps and adjust
      const minDistance = 55; // Minimum pixels between token centers
      for (const pos of positions) {
        const dx = champX - pos.x;
        const dy = champY - pos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < minDistance) {
          // Push apart horizontally
          const pushDirection = champX >= pos.x ? 1 : -1;
          champX += pushDirection * (minDistance - distance + 15);
        }
      }
      
      // Clamp to hexagon bounds
      const clamped = clampToHexagon(champX, champY);
      champX = clamped.x;
      champY = clamped.y;
      
      positions.push({ champ, x: champX, y: champY, volatility });
    });

    // Draw each champion
    positions.forEach(({ champ, x: champX, y: champY, volatility }) => {

      // Draw trail from center horizontal line to token
      const trailStartX = champX;
      const trailStartY = centerY;
      
      const trailGradient = ctx.createLinearGradient(trailStartX, trailStartY, champX, champY);
      trailGradient.addColorStop(0, 'transparent');
      trailGradient.addColorStop(0.3, champ.color + '20');
      trailGradient.addColorStop(1, champ.color + '70');

      ctx.beginPath();
      ctx.moveTo(trailStartX, trailStartY);
      ctx.lineTo(champX, champY);
      ctx.strokeStyle = trailGradient;
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Draw glow effect
      const glowGradient = ctx.createRadialGradient(champX, champY, 0, champX, champY, 30);
      glowGradient.addColorStop(0, champ.color + '50');
      glowGradient.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.arc(champX, champY, 30, 0, Math.PI * 2);
      ctx.fillStyle = glowGradient;
      ctx.fill();

      // Draw champion marker
      ctx.beginPath();
      ctx.arc(champX, champY, 18, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fill();
      ctx.strokeStyle = champ.color;
      ctx.lineWidth = 3;
      ctx.stroke();

      // Draw symbol in circle
      ctx.fillStyle = champ.color;
      ctx.font = 'bold 9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const shortSymbol = champ.symbol.length > 4 ? champ.symbol.slice(0, 3) : champ.symbol;
      ctx.fillText(shortSymbol, champX, champY);

      // Draw rank badge
      const rankColors = ['#FFD700', '#C0C0C0', '#CD7F32'];
      const badgeX = champX + 14;
      const badgeY = champY - 14;
      
      ctx.beginPath();
      ctx.arc(badgeX, badgeY, 10, 0, Math.PI * 2);
      ctx.fillStyle = champ.rank <= 3 ? rankColors[champ.rank - 1] : 'rgba(255, 255, 255, 0.15)';
      ctx.fill();
      
      ctx.fillStyle = champ.rank <= 3 ? '#000' : 'rgba(255, 255, 255, 0.6)';
      ctx.font = 'bold 9px system-ui, sans-serif';
      ctx.fillText(champ.rank.toString(), badgeX, badgeY);

      // Draw price label below the circle (close to it)
      ctx.fillStyle = volatility >= 0 ? '#38bdf8' : '#ef4444';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(`${volatility >= 0 ? '+' : ''}${volatility.toFixed(2)}%`, champX, champY + 22);
    });

    // Draw title
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('LIVE', 24, 24);

    // Draw live indicator
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(66, 30, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText(`updates every ${refreshInterval / 1000}s`, 78, 26);

    // Draw legend in corner
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.font = '9px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('↑ Higher = Winning | Lower = Losing ↓', size - 24, size - 24);

  }, [champions, animatedPositions, size, refreshInterval]);

  if (isLoading) {
    return (
      <div 
        className="flex items-center justify-center bg-white/5 backdrop-blur-md rounded-xl border border-white/10"
        style={{ width: size, height: size }}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-white/50 text-sm">Loading arena...</p>
        </div>
      </div>
    );
  }

  if (error || champions.length === 0) {
    return (
      <div 
        className="flex items-center justify-center bg-white/5 backdrop-blur-md rounded-xl border border-white/10"
        style={{ width: size, height: size }}
      >
        <div className="text-center">
          <p className="text-white/50 text-lg mb-2">Waiting for champions...</p>
          <p className="text-white/30 text-sm">Data will appear once battle begins</p>
        </div>
      </div>
    );
  }

  // Token full names
  const TOKEN_NAMES: Record<string, string> = {
    SOL: 'Solana',
    TRUMP: 'Official Trump',
    PUMP: 'Pump.fun',
    BONK: 'Bonk',
    JUP: 'Jupiter',
    PENGU: 'Pudgy Penguins',
    PYTH: 'Pyth Network',
    HNT: 'Helium',
    FARTCOIN: 'Fartcoin',
    RAY: 'Raydium',
    JTO: 'Jito',
    KMNO: 'Kamino',
    MET: 'Meteora',
    W: 'Wormhole',
  };

  return (
    <div className="relative flex gap-4" style={{ width: size + 280 }}>
      {/* Hexagonal arena canvas */}
      <div 
        ref={containerRef}
        className="bg-white/5 backdrop-blur-md rounded-xl border border-white/10 overflow-hidden shadow-xl flex-shrink-0"
        style={{ width: size, height: size, minWidth: size, minHeight: size }}
      >
        <canvas ref={canvasRef} />
      </div>

      {/* Top Gainers Widget */}
      <div className="w-[260px] flex-shrink-0">
        <div className="bg-white/5 backdrop-blur-md rounded-xl border border-white/10 p-4 h-full">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
            <h4 className="text-white/80 text-sm font-bold uppercase tracking-wider">Leaderboard</h4>
          </div>
          
          <div className="space-y-1.5">
            {champions.map((champ, idx) => (
              <div 
                key={champ.symbol}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${
                  idx === 0 
                    ? 'bg-amber-500/10 border border-amber-500/20' 
                    : 'bg-white/5 hover:bg-white/10'
                }`}
              >
                {/* Rank */}
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  idx === 0 ? 'bg-amber-500 text-gray-900' 
                  : idx === 1 ? 'bg-zinc-400 text-gray-900' 
                  : idx === 2 ? 'bg-orange-600 text-white' 
                  : 'bg-white/10 text-white/50'
                }`}>
                  {idx + 1}
                </div>
                
                {/* Token info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span 
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: champ.color }}
                    />
                    <span className="text-white text-sm font-medium">{TOKEN_NAMES[champ.symbol] || champ.symbol}</span>
                  </div>
                </div>
                
                {/* Volatility */}
                <span className={`text-xs font-bold flex-shrink-0 ${
                  champ.currentVolatility >= 0 ? 'text-sky-400' : 'text-red-400'
                }`}>
                  {champ.currentVolatility >= 0 ? '+' : ''}{champ.currentVolatility.toFixed(2)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
