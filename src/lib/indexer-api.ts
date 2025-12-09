// Indexer Service API Client
// Connects to the Solana indexer service to fetch on-chain arena data

const INDEXER_BASE_URL = process.env.NEXT_PUBLIC_INDEXER_URL || 'http://localhost:3001';

// Types based on indexer responses
export interface PlayerEntry {
  playerWallet: string;
  playerIndex: number;
  assetIndex: number;
  assetSymbol: string;
  tokenAmount: number;
  usdValue: number;  // User's submitted value
  entryPrice?: number;  // Actual token price at entry time
  actualUsdValue?: number;  // Actual market value (tokenAmount * entryPrice)
  entryTimestamp: string;
}

export interface ArenaAsset {
  assetIndex: number;
  assetSymbol: string;
  playerCount: number;
}

export interface CurrentArena {
  arenaId: string;
  status: number;
  statusLabel: string;
  playerCount: number;
  maxPlayers: number;
  totalPoolUsd: number;
  startTimestamp: string | null;
  endTimestamp: string | null;
  playerEntries: PlayerEntry[];
  arenaAssets: ArenaAsset[];
  // Countdown info for waiting room (10 minutes from first player)
  countdownStartAt?: string;
  countdownEndsAt?: string;
  countdownRemainingMs?: number;
  countdownDurationMs?: number;
}

export interface CurrentArenaResponse {
  exists: boolean;
  arena?: CurrentArena;
  nextArenaId?: string;
  message?: string;
}

export interface PlayerCheckResponse {
  hasCurrentArena: boolean;
  arenaId?: string;
  arenaStatus?: string;
  isInArena: boolean;
  playerEntry?: {
    assetIndex: number;
    assetSymbol: string;
    tokenAmount: number;
    usdValue: number;
    playerIndex: number;
  } | null;
}

export interface PlayerStats {
  playerWallet: string;
  totalArenasPlayed: number;
  totalWins: number;
  totalLosses: number;
  totalUsdWagered: number;
  totalUsdWon: number;
  totalUsdLost: number;
  winRate: number;
  favoriteAsset: number | null;
  lastPlayedAt: string | null;
}

export interface PlayerProfile {
  wallet: string;
  stats: PlayerStats & { netProfit: number };
  recentArenas: Array<{
    arenaId: string;
    status: string;
    assetIndex: number;
    assetSymbol: string;
    usdValue: number;
    isWinner: boolean;
    entryTimestamp: string;
  }>;
}

class IndexerApi {
  private baseUrl: string;

  constructor(baseUrl: string = INDEXER_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async fetch<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Indexer API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  // Get current arena (the one accepting players)
  async getCurrentArena(): Promise<CurrentArenaResponse> {
    return this.fetch<CurrentArenaResponse>('/api/v1/arenas/current');
  }

  // Check if a wallet is already in the current arena
  async checkPlayerInCurrentArena(wallet: string): Promise<PlayerCheckResponse> {
    return this.fetch<PlayerCheckResponse>(`/api/v1/arenas/current/check-player/${wallet}`);
  }

  // Get player profile and stats
  async getPlayerProfile(wallet: string): Promise<PlayerProfile> {
    return this.fetch<PlayerProfile>(`/api/v1/players/${wallet}`);
  }

  // Get player stats
  async getPlayerStats(wallet: string): Promise<PlayerStats> {
    return this.fetch<PlayerStats>(`/api/v1/players/${wallet}/stats`);
  }

  // Get arena by ID
  async getArena(arenaId: string): Promise<CurrentArena> {
    return this.fetch<CurrentArena>(`/api/v1/arenas/${arenaId}`);
  }

  // Get active arenas (waiting, ready, active)
  async getActiveArenas(): Promise<CurrentArena[]> {
    return this.fetch<CurrentArena[]>('/api/v1/arenas/active');
  }

  // Health check
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    return this.fetch<{ status: string; timestamp: string }>('/health');
  }

  // Get arena details by ID
  async getArenaById(arenaId: string): Promise<ArenaDetail> {
    return this.fetch<ArenaDetail>(`/api/v1/arenas/${arenaId}`);
  }

  // Get arena players
  async getArenaPlayers(arenaId: string): Promise<PlayerEntry[]> {
    return this.fetch<PlayerEntry[]>(`/api/v1/arenas/${arenaId}/players`);
  }

  // Get latest prices for all assets
  async getLatestPrices(): Promise<{ data: LatestPriceData[]; timestamp: string }> {
    return this.fetch<{ data: LatestPriceData[]; timestamp: string }>('/api/v1/prices/latest');
  }

  // Get price history for specific assets
  async getPriceHistory(params: {
    assets?: number[];
    startTime?: Date;
    endTime?: Date;
    interval?: '1m' | '5m' | '15m' | '1h' | '4h';
  }): Promise<PriceHistoryResponse> {
    const query = new URLSearchParams();
    if (params.assets) query.set('assets', params.assets.join(','));
    if (params.startTime) query.set('startTime', params.startTime.toISOString());
    if (params.endTime) query.set('endTime', params.endTime.toISOString());
    if (params.interval) query.set('interval', params.interval);
    
    return this.fetch<PriceHistoryResponse>(`/api/v1/prices/history?${query.toString()}`);
  }

  // Get volatility data for an arena (for the chart)
  async getArenaVolatility(arenaId: string, interval?: '1m' | '5m' | '15m' | '1h' | '4h'): Promise<ArenaVolatilityResponse> {
    const query = interval ? `?interval=${interval}` : '';
    return this.fetch<ArenaVolatilityResponse>(`/api/v1/prices/arena/${arenaId}/volatility${query}`);
  }

  // Get current volatility for active arenas
  async getActiveArenasVolatility(): Promise<{
    arenas: Array<{
      arenaId: string;
      startTimestamp: string;
      endTimestamp: string;
      playerCount: number;
      assets: Array<{
        assetIndex: number;
        symbol: string;
        startPrice: number;
        currentPrice: number;
        volatility: number;
        playerCount: number;
      }>;
      leader: {
        assetIndex: number;
        symbol: string;
        volatility: number;
      } | null;
    }>;
  }> {
    return this.fetch('/api/v1/prices/active-arenas/volatility');
  }
}

// Extended arena detail with full player info
export interface ArenaDetail {
  id: string;
  arenaId: string;
  pda: string;
  status: number;
  statusLabel: string;
  playerCount: number;
  assetCount: number;
  totalPoolUsd: number;
  startTimestamp: string | null;
  endTimestamp: string | null;
  winningAsset: number | null;
  winningAssetSymbol: string | null;
  playerEntries: PlayerEntry[];
  arenaAssets: ArenaAsset[];
}

// Price history types
export interface PricePoint {
  timestamp: string;
  price: number;
}

export interface AssetPriceHistory {
  assetIndex: number;
  symbol: string;
  prices: PricePoint[];
}

export interface PriceHistoryResponse {
  data: AssetPriceHistory[];
  meta: {
    startTime: string;
    endTime: string;
    interval: string;
    assetCount: number;
  };
}

export interface VolatilityPoint {
  timestamp: string;
  price: number;
  volatility: number;
}

export interface AssetVolatilityData {
  assetIndex: number;
  symbol: string;
  startPrice: number;
  data: VolatilityPoint[];
}

export interface ArenaVolatilityResponse {
  arenaId: string;
  status: number;
  startTimestamp: string;
  endTimestamp: string;
  winningAsset: number | null;
  assets: AssetVolatilityData[];
  meta: {
    interval: string;
    assetCount: number;
  };
}

export interface LatestPriceData {
  assetIndex: number;
  symbol: string;
  price: number;
  timestamp: string;
}

export const indexerApi = new IndexerApi();
export default indexerApi;

