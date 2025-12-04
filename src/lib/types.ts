// Re-export types from api for convenience
export type { User, AuthResponse, Wallet, WalletCheckResponse, GenerateMessageResponse, LinkWalletRequest } from './api';

// Additional types can be added here
export interface Champion {
  id: string;
  name: string;
  profilePicture: string | null;
  profileBanner: string | null;
  profileCharacter: string | null;
  cryptoCoinId: string | null;
}

export interface CryptoCoin {
  id: string;
  name: string;
  symbol: string;
  currentPrice: number | null;
  marketCap: number | null;
}

