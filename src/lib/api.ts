import { API_URL } from './config';

// Token storage keys
const ACCESS_TOKEN_KEY = 'cryptarena_access_token';
const REFRESH_TOKEN_KEY = 'cryptarena_refresh_token';

// Types
export interface User {
  id: string;
  name: string;
  twitterUsername: string;
  twitterProfilePicture: string | null;
  profileBanner: string | null;
  gold: number;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: User;
}

export interface Wallet {
  id: string;
  address: string;
  walletType: string;
  walletSource: string;
  chainType: string;
  label: string | null;
  isPrimary: boolean;
  createdAt: string;
}

export interface PrivyAuthRequest {
  accessToken: string;
}

export interface WalletCheckResponse {
  exists: boolean;
  linkedToCurrentUser: boolean;
  linkedToOtherUser: boolean;
  userId: string | null;
  walletType: string | null;
  wallet: Wallet | null;
}

export interface GenerateMessageResponse {
  message: string;
  timestamp: number;
  nonce: string;
}

export interface LinkWalletRequest {
  address: string;
  signature: string;
  message: string;
  walletType?: string;
  label?: string;
  isPrimary?: boolean;
}

export interface CryptoCoin {
  symbol: string;
  name: string;
  currentPrice: number;
  marketCap: number;
  percentChange24h: number;
  lastUpdated: number;
}

interface ApiError {
  status: number;
  error: string;
  message: string;
}

class ApiClient {
  private baseUrl: string;
  private refreshPromise: Promise<string | null> | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  // Token management
  getAccessToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  }

  getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  }

  setTokens(accessToken: string, refreshToken: string): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  }

  clearTokens(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }

  isAuthenticated(): boolean {
    return !!this.getAccessToken();
  }

  // Refresh token logic with deduplication
  private async refreshAccessToken(): Promise<string | null> {
    // If already refreshing, return the existing promise
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      return null;
    }

    this.refreshPromise = (async () => {
      try {
        const response = await fetch(`${this.baseUrl}/api/auth/refresh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ refreshToken }),
        });

        if (!response.ok) {
          this.clearTokens();
          return null;
        }

        const data: AuthResponse = await response.json();
        this.setTokens(data.accessToken, data.refreshToken);
        return data.accessToken;
      } catch (error) {
        console.error('Failed to refresh token:', error);
        this.clearTokens();
        return null;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  // Generic fetch with automatic token refresh
  async fetch<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const accessToken = this.getAccessToken();

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (accessToken) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${accessToken}`;
    }

    let response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    // If 401, try to refresh token and retry
    if (response.status === 401 && accessToken) {
      const newToken = await this.refreshAccessToken();
      
      if (newToken) {
        (headers as Record<string, string>)['Authorization'] = `Bearer ${newToken}`;
        response = await fetch(`${this.baseUrl}${endpoint}`, {
          ...options,
          headers,
        });
      } else {
        // Refresh failed, user needs to re-authenticate
        throw new Error('Session expired. Please log in again.');
      }
    }

    if (!response.ok) {
      const errorData: ApiError = await response.json().catch(() => ({
        status: response.status,
        error: 'Error',
        message: 'An unexpected error occurred',
      }));
      throw new Error(errorData.message);
    }

    return response.json();
  }

  // Auth endpoints
  async twitterCallback(code: string, codeVerifier: string): Promise<AuthResponse> {
    const response = await this.fetch<AuthResponse>('/api/auth/twitter/callback', {
      method: 'POST',
      body: JSON.stringify({ code, codeVerifier }),
    });

    this.setTokens(response.accessToken, response.refreshToken);
    return response;
  }

  async privyCallback(request: PrivyAuthRequest): Promise<AuthResponse> {
    const response = await this.fetch<AuthResponse>('/api/auth/privy/callback', {
      method: 'POST',
      body: JSON.stringify(request),
    });

    this.setTokens(response.accessToken, response.refreshToken);
    return response;
  }

  async getCurrentUser(): Promise<User> {
    return this.fetch<User>('/api/auth/me');
  }

  async logout(): Promise<void> {
    this.clearTokens();
  }

  // Wallet endpoints
  async getUserWallets(): Promise<Wallet[]> {
    return this.fetch<Wallet[]>('/api/wallets');
  }

  async getUserWalletsByType(walletType: string): Promise<Wallet[]> {
    return this.fetch<Wallet[]>(`/api/wallets/type/${walletType}`);
  }

  async checkWallet(address: string): Promise<WalletCheckResponse> {
    return this.fetch<WalletCheckResponse>(`/api/wallets/check/${address}`);
  }

  async generateLinkingMessage(address: string): Promise<GenerateMessageResponse> {
    return this.fetch<GenerateMessageResponse>(`/api/wallets/message/${address}`);
  }

  async linkWallet(request: LinkWalletRequest): Promise<Wallet> {
    return this.fetch<Wallet>('/api/wallets/link', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async unlinkWallet(walletId: string): Promise<void> {
    await this.fetch<void>(`/api/wallets/${walletId}`, {
      method: 'DELETE',
    });
  }

  async setPrimaryWallet(walletId: string): Promise<Wallet> {
    return this.fetch<Wallet>(`/api/wallets/${walletId}/primary`, {
      method: 'PATCH',
    });
  }

  // Crypto endpoints
  async getCoinBySymbol(symbol: string): Promise<CryptoCoin> {
    return this.fetch<CryptoCoin>(`/api/crypto/coin/${symbol}`);
  }
}

// Export singleton instance
export const api = new ApiClient(API_URL);

