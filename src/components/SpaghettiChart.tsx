'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { indexerApi, VolatilityPoint } from '@/lib/indexer-api';

// Token colors - same as other charts
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

interface SpaghettiChartProps {
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
  history: VolatilityPoint[];
  startPrice: number;
}

export default function SpaghettiChart({ 
  arenaId, 
  height = 450,
  refreshInterval = 5000 
}: SpaghettiChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [champions, setChampions] = useState<ChampionData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredToken, setHoveredToken] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

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

      // Sort by current volatility for rankings
      champData.sort((a, b) => b.currentVolatility - a.currentVolatility);
      champData.forEach((champ, index) => {
        champ.rank = index + 1;
      });

      setChampions(champData);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch volatility data:', err);
      setError('Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, [arenaId]);

  useEffect(() => {
    fetchData();
    const timer = window.setInterval(fetchData, refreshInterval);
    return () => window.clearInterval(timer);
  }, [arenaId, refreshInterval, fetchData]);

  // Draw spaghetti chart
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || champions.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = container.getBoundingClientRect();
    const width = rect.width;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    const PADDING = { top: 50, right: 80, bottom: 50, left: 60 };
    const chartWidth = width - PADDING.left - PADDING.right;
    const chartHeight = height - PADDING.top - PADDING.bottom;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Find data range
    let minVol = 0, maxVol = 0;
    let maxDataPoints = 0;
    champions.forEach(c => {
      c.history.forEach(h => {
        if (h.volatility < minVol) minVol = h.volatility;
        if (h.volatility > maxVol) maxVol = h.volatility;
      });
      if (c.history.length > maxDataPoints) maxDataPoints = c.history.length;
    });

    // Add padding to range
    const range = Math.max(Math.abs(minVol), Math.abs(maxVol), 0.5);
    minVol = -range * 1.1;
    maxVol = range * 1.1;

    // Draw title
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('LIVE', 20, 28);

    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(62, 24, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText(`updates every ${refreshInterval / 1000}s`, 75, 28);

    // Draw grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;

    // Horizontal grid lines
    const ySteps = 5;
    for (let i = 0; i <= ySteps; i++) {
      const y = PADDING.top + (chartHeight / ySteps) * i;
      ctx.beginPath();
      ctx.moveTo(PADDING.left, y);
      ctx.lineTo(width - PADDING.right, y);
      ctx.stroke();

      // Y-axis labels
      const volValue = maxVol - ((maxVol - minVol) / ySteps) * i;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.font = '10px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${volValue >= 0 ? '+' : ''}${volValue.toFixed(1)}%`, PADDING.left - 10, y + 4);
    }

    // Draw 0% line (more prominent)
    const zeroY = PADDING.top + chartHeight * (maxVol / (maxVol - minVol));
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(PADDING.left, zeroY);
    ctx.lineTo(width - PADDING.right, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '9px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('0%', width - PADDING.right + 5, zeroY + 3);

    // X-axis labels (time)
    if (maxDataPoints > 0 && champions[0]?.history.length > 0) {
      const firstTime = new Date(champions[0].history[0].timestamp);
      const lastTime = new Date(champions[0].history[champions[0].history.length - 1].timestamp);
      
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(firstTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), PADDING.left, height - 15);
      ctx.fillText(lastTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), width - PADDING.right, height - 15);
      ctx.fillText('Time', width / 2, height - 15);
    }

    // Draw lines for each champion (draw hovered one last so it's on top)
    const sortedForDrawing = [...champions].sort((a, b) => {
      if (a.symbol === hoveredToken) return 1;
      if (b.symbol === hoveredToken) return -1;
      return 0;
    });

    sortedForDrawing.forEach(champ => {
      if (champ.history.length < 2) return;

      const isHovered = champ.symbol === hoveredToken;
      const opacity = hoveredToken && !isHovered ? 0.2 : 1;

      // Draw line
      ctx.beginPath();
      ctx.strokeStyle = isHovered ? champ.color : `${champ.color}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`;
      ctx.lineWidth = isHovered ? 3 : 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      champ.history.forEach((point, idx) => {
        const x = PADDING.left + (chartWidth / (maxDataPoints - 1)) * idx;
        const y = PADDING.top + chartHeight * ((maxVol - point.volatility) / (maxVol - minVol));
        
        if (idx === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();

      // Draw end point marker
      const lastPoint = champ.history[champ.history.length - 1];
      const endX = PADDING.left + chartWidth;
      const endY = PADDING.top + chartHeight * ((maxVol - lastPoint.volatility) / (maxVol - minVol));

      // Glow effect for end point
      if (isHovered || !hoveredToken) {
        const glowGradient = ctx.createRadialGradient(endX, endY, 0, endX, endY, 15);
        glowGradient.addColorStop(0, `${champ.color}40`);
        glowGradient.addColorStop(1, 'transparent');
        ctx.beginPath();
        ctx.arc(endX, endY, 15, 0, Math.PI * 2);
        ctx.fillStyle = glowGradient;
        ctx.fill();
      }

      // End point circle
      ctx.beginPath();
      ctx.arc(endX, endY, isHovered ? 8 : 6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fill();
      ctx.strokeStyle = champ.color;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Token label at end
      ctx.fillStyle = isHovered ? champ.color : `${champ.color}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`;
      ctx.font = isHovered ? 'bold 11px system-ui, sans-serif' : '10px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(champ.symbol, endX + 12, endY + 4);
    });

    // Draw "WINNING" and "LOSING" labels on sides
    ctx.save();
    ctx.translate(15, PADDING.top + 30);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.5)';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('WINNING ↑', 0, 0);
    ctx.restore();

    ctx.save();
    ctx.translate(15, height - PADDING.bottom - 30);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = 'rgba(239, 68, 68, 0.5)';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('↓ LOSING', 0, 0);
    ctx.restore();

  }, [champions, height, refreshInterval, hoveredToken]);

  // Handle mouse move for hover effects
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMousePos({ x, y });

    // Check if hovering near any line endpoint
    const PADDING = { top: 50, right: 80, bottom: 50, left: 60 };
    const chartWidth = rect.width - PADDING.left - PADDING.right;
    const chartHeight = height - PADDING.top - PADDING.bottom;

    let minVol = 0, maxVol = 0;
    champions.forEach(c => {
      c.history.forEach(h => {
        if (h.volatility < minVol) minVol = h.volatility;
        if (h.volatility > maxVol) maxVol = h.volatility;
      });
    });
    const range = Math.max(Math.abs(minVol), Math.abs(maxVol), 0.5);
    minVol = -range * 1.1;
    maxVol = range * 1.1;

    let found: string | null = null;
    const endX = PADDING.left + chartWidth;

    for (const champ of champions) {
      if (champ.history.length === 0) continue;
      const lastPoint = champ.history[champ.history.length - 1];
      const endY = PADDING.top + chartHeight * ((maxVol - lastPoint.volatility) / (maxVol - minVol));
      
      const distance = Math.sqrt((x - endX) ** 2 + (y - endY) ** 2);
      if (distance < 20) {
        found = champ.symbol;
        break;
      }
    }

    setHoveredToken(found);
  };

  const handleMouseLeave = () => {
    setHoveredToken(null);
    setMousePos(null);
  };

  if (isLoading) {
    return (
      <div 
        className="flex items-center justify-center bg-white/5 backdrop-blur-md rounded-xl border border-white/10"
        style={{ height }}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-white/50 text-sm">Loading chart data...</p>
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
          <p className="text-white/50 text-lg mb-2">Waiting for data...</p>
          <p className="text-white/30 text-sm">Chart will appear once battle begins</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Chart */}
      <div 
        ref={containerRef}
        className="bg-white/5 backdrop-blur-md rounded-xl border border-white/10 overflow-hidden shadow-xl"
        style={{ height }}
      >
        <canvas 
          ref={canvasRef} 
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="cursor-crosshair"
        />
      </div>
    </div>
  );
}

