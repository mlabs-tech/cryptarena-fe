'use client';

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';

// Pyth Hermes SSE endpoint for real-time price streaming
const PYTH_HERMES_SSE_URL = 'https://hermes.pyth.network/v2/updates/price/stream';

// Token to Pyth feed ID mapping
const TOKEN_PYTH_FEEDS: Record<string, string> = {
  SOL: 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
  TRUMP: '879551021853eec7a7dc827578e8e69da7e4fa8148339aa0d3d5296405be4b1a',
  PUMP: '7a01fca212788bba7c5bf8c9efd576a8a722f070d2c17596ff7bb609b8d5c3b9',
  BONK: '72b021217ca3fe68922a19aaf990109cb9d84e9ad004b4d2025ad6f529314419',
  JUP: '0a0408d619e9380abad35060f9192039ed5042fa6f82301d0e48bb52be830996',
  PENGU: 'bed3097008b9b5e3c93bec20be79cb43986b85a996475589351a21e67bae9b61',
  PYTH: '0bbf28e9a841a1cc788f6a361b17ca072d0ea3098a1e5df1c3922d06719579ff',
  HNT: '649fdd7ec08e8e2a20f425729854e90293dcbe2376abc47197a14da6ff339756',
  FARTCOIN: '58cd29ef0e714c5affc44f269b2c1899a52da4169d7acc147b9da692e6953608',
  RAY: '91568baa8beb53db23eb3fb7f22c6e8bd303d103919e19733f2bb642d3e7987a',
  JTO: 'b43660a5f790c69354b0729a5ef9d50d68f1df92107540210b9cccba1f947cc2',
  KMNO: 'b17e5bc5de742a8a378b54c9c75442b7d51e30ada63f28d9bd28d3c0e26511a0',
  MET: '0292e0f405bcd4a496d34e48307f6787349ad2bcd8505c3d3a9f77d81a67a682',
  W: 'eff7446475e218517566ea99e72a4abec2e1bd8498b43b7d8331e29dcb059389',
  ETH: 'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  UNI: '78d185a741d07edb3412b09008b7c5cfb9bbbd7d568bf00ba737b456ba171501',
  LINK: '8ac0c70fff57e9aefdf5edf44b51d62c2d433653cbb2cf5cc06bb115af04d221',
  PEPE: 'd69731a2e74ac1ce884fc3890f7ee324b6deb66147055249568869ed700882e4',
  SHIB: 'f0d57deca57b3da2fe63a493f4c25925fdfd8edf834b20f93e1f84dbd1504d4a',
};

// Reverse mapping: feed ID -> symbol
const FEED_ID_TO_SYMBOL: Record<string, string> = Object.fromEntries(
  Object.entries(TOKEN_PYTH_FEEDS).map(([symbol, feedId]) => [feedId, symbol])
);

// Parse Pyth price from the SSE data
function parsePythPrice(priceData: { price: string; expo: number }): number {
  const price = parseInt(priceData.price);
  const expo = priceData.expo;
  return price * Math.pow(10, expo);
}

export interface TokenPriceData {
  symbol: string;
  currentPrice: number;
  lastUpdateTime: number;
}

export interface ArenaVolatilityData {
  symbol: string;
  assetIndex: number;
  startPrice: number;
  currentPrice: number;
  volatility: number;
  previousVolatility: number;
  rank: number;
  previousRank: number;
  lastUpdateTime: number;
  justTookLead: boolean;
}

interface PythStreamContextType {
  // Global price data (all tokens)
  prices: Record<string, TokenPriceData>;
  isStreaming: boolean;
  lastUpdate: Date | null;
  
  // Arena-specific volatility data
  arenaVolatility: Record<string, ArenaVolatilityData[]>; // keyed by arenaId
  
  // Methods
  subscribeToArena: (arenaId: string, tokens: { symbol: string; assetIndex: number; startPrice: number }[]) => void;
  unsubscribeFromArena: (arenaId: string) => void;
}

const PythStreamContext = createContext<PythStreamContextType | null>(null);

export function usePythStream() {
  const context = useContext(PythStreamContext);
  if (!context) {
    throw new Error('usePythStream must be used within a PythStreamProvider');
  }
  return context;
}

// Hook to get arena-specific volatility data
export function useArenaVolatility(arenaId: string) {
  const { arenaVolatility, isStreaming, lastUpdate } = usePythStream();
  return {
    data: arenaVolatility[arenaId] || [],
    isStreaming,
    lastUpdate,
  };
}

interface PythStreamProviderProps {
  children: React.ReactNode;
}

export function PythStreamProvider({ children }: PythStreamProviderProps) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const [prices, setPrices] = useState<Record<string, TokenPriceData>>({});
  const [isStreaming, setIsStreaming] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [arenaVolatility, setArenaVolatility] = useState<Record<string, ArenaVolatilityData[]>>({});
  
  // Track subscribed arenas and their tokens
  const subscribedArenasRef = useRef<Map<string, { symbol: string; assetIndex: number; startPrice: number }[]>>(new Map());
  const currentPricesRef = useRef<Record<string, number>>({});

  // Connect to Pyth SSE stream
  const connectToSSE = useCallback(() => {
    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // Get all unique feed IDs from subscribed arenas
    const allSymbols = new Set<string>();
    subscribedArenasRef.current.forEach(tokens => {
      tokens.forEach(t => allSymbols.add(t.symbol));
    });

    if (allSymbols.size === 0) {
      console.log('[PythStream] No tokens to stream');
      return;
    }

    const feedIds = Array.from(allSymbols)
      .map(symbol => TOKEN_PYTH_FEEDS[symbol])
      .filter(Boolean);

    if (feedIds.length === 0) return;

    const params = new URLSearchParams();
    feedIds.forEach(id => params.append('ids[]', id));
    params.append('parsed', 'true');
    params.append('allow_unordered', 'true');
    params.append('benchmarks_only', 'false');

    const sseUrl = `${PYTH_HERMES_SSE_URL}?${params.toString()}`;
    console.log('[PythStream] Connecting to:', sseUrl);

    const eventSource = new EventSource(sseUrl);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('[PythStream] SSE connection opened');
      setIsStreaming(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.parsed && Array.isArray(data.parsed)) {
          const now = Date.now();
          let hasUpdates = false;
          
          data.parsed.forEach((priceUpdate: { id: string; price: { price: string; expo: number } }) => {
            const feedId = priceUpdate.id;
            const symbol = FEED_ID_TO_SYMBOL[feedId];
            
            if (symbol && priceUpdate.price) {
              const newPrice = parsePythPrice(priceUpdate.price);
              if (newPrice > 0 && currentPricesRef.current[symbol] !== newPrice) {
                currentPricesRef.current[symbol] = newPrice;
                hasUpdates = true;
                
                // Update global prices
                setPrices(prev => ({
                  ...prev,
                  [symbol]: {
                    symbol,
                    currentPrice: newPrice,
                    lastUpdateTime: now,
                  }
                }));
              }
            }
          });

          if (hasUpdates) {
            setLastUpdate(new Date());
            
            // Update volatility for all subscribed arenas
            setArenaVolatility(prev => {
              const updated = { ...prev };
              
              subscribedArenasRef.current.forEach((tokens, arenaId) => {
                const currentData = prev[arenaId] || [];
                
                // Get previous leader
                const sortedPrev = [...currentData].sort((a, b) => b.volatility - a.volatility);
                const previousLeader = sortedPrev[0]?.symbol;
                
                // Calculate new volatility for each token
                let newData = tokens.map(token => {
                  const existing = currentData.find(d => d.symbol === token.symbol);
                  const currentPrice = currentPricesRef.current[token.symbol] || token.startPrice;
                  const newVolatility = token.startPrice > 0 
                    ? ((currentPrice - token.startPrice) / token.startPrice) * 100 
                    : 0;
                  
                  const volatilityChanged = existing 
                    ? Math.abs(newVolatility - existing.volatility) > 0.0001 
                    : true;
                  
                  return {
                    symbol: token.symbol,
                    assetIndex: token.assetIndex,
                    startPrice: token.startPrice,
                    currentPrice,
                    volatility: newVolatility,
                    previousVolatility: existing?.volatility ?? newVolatility,
                    rank: 0,
                    previousRank: existing?.rank ?? 0,
                    lastUpdateTime: volatilityChanged ? now : (existing?.lastUpdateTime ?? now),
                    justTookLead: false,
                  };
                });

                // Sort by volatility and assign ranks
                newData.sort((a, b) => b.volatility - a.volatility);
                newData.forEach((item, index) => {
                  const existing = currentData.find(d => d.symbol === item.symbol);
                  item.previousRank = existing?.rank || index + 1;
                  item.rank = index + 1;
                  
                  // Check if took lead
                  if (index === 0 && previousLeader && previousLeader !== item.symbol) {
                    item.justTookLead = true;
                    // Clear flag after 2 seconds
                    setTimeout(() => {
                      setArenaVolatility(p => ({
                        ...p,
                        [arenaId]: p[arenaId]?.map(d => 
                          d.symbol === item.symbol ? { ...d, justTookLead: false } : d
                        ) || []
                      }));
                    }, 2000);
                  }
                });

                updated[arenaId] = newData;
              });
              
              return updated;
            });
          }
        }
      } catch (err) {
        console.error('[PythStream] SSE parse error:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('[PythStream] SSE error:', err);
      setIsStreaming(false);
      
      // Reconnect after 2 seconds
      setTimeout(() => {
        if (subscribedArenasRef.current.size > 0) {
          console.log('[PythStream] Attempting reconnect...');
          connectToSSE();
        }
      }, 2000);
    };
  }, []);

  // Subscribe to an arena's tokens
  const subscribeToArena = useCallback((
    arenaId: string, 
    tokens: { symbol: string; assetIndex: number; startPrice: number }[]
  ) => {
    console.log(`[PythStream] Subscribing arena ${arenaId} with ${tokens.length} tokens`);
    
    // Store start prices
    tokens.forEach(t => {
      if (!currentPricesRef.current[t.symbol]) {
        currentPricesRef.current[t.symbol] = t.startPrice;
      }
    });
    
    subscribedArenasRef.current.set(arenaId, tokens);
    
    // Initialize volatility data
    setArenaVolatility(prev => ({
      ...prev,
      [arenaId]: tokens.map((t, idx) => ({
        symbol: t.symbol,
        assetIndex: t.assetIndex,
        startPrice: t.startPrice,
        currentPrice: currentPricesRef.current[t.symbol] || t.startPrice,
        volatility: 0,
        previousVolatility: 0,
        rank: idx + 1,
        previousRank: idx + 1,
        lastUpdateTime: Date.now(),
        justTookLead: false,
      }))
    }));
    
    // Reconnect to include new tokens
    connectToSSE();
  }, [connectToSSE]);

  // Unsubscribe from an arena
  const unsubscribeFromArena = useCallback((arenaId: string) => {
    console.log(`[PythStream] Unsubscribing arena ${arenaId}`);
    subscribedArenasRef.current.delete(arenaId);
    
    setArenaVolatility(prev => {
      const updated = { ...prev };
      delete updated[arenaId];
      return updated;
    });
    
    // Reconnect with remaining tokens (or close if none)
    if (subscribedArenasRef.current.size > 0) {
      connectToSSE();
    } else if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setIsStreaming(false);
    }
  }, [connectToSSE]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  const value: PythStreamContextType = {
    prices,
    isStreaming,
    lastUpdate,
    arenaVolatility,
    subscribeToArena,
    unsubscribeFromArena,
  };

  return (
    <PythStreamContext.Provider value={value}>
      {children}
    </PythStreamContext.Provider>
  );
}

export { TOKEN_PYTH_FEEDS, FEED_ID_TO_SYMBOL };

