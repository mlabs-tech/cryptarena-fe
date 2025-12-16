// API Configuration
export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

// Twitter OAuth 2.0 Configuration
export const TWITTER_CLIENT_ID = process.env.NEXT_PUBLIC_TWITTER_CLIENT_ID || '';
export const TWITTER_REDIRECT_URI = process.env.NEXT_PUBLIC_TWITTER_REDIRECT_URI || 'http://localhost:3000/auth/callback';

// Twitter OAuth 2.0 Scopes
export const TWITTER_SCOPES = ['tweet.read', 'users.read', 'offline.access'];

// Twitter OAuth 2.0 Authorization URL
export const TWITTER_AUTH_URL = 'https://twitter.com/i/oauth2/authorize';

// Privy Configuration
export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || '';

// Solana Configuration
export const SOLANA_RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
export const PROGRAM_ID = process.env.NEXT_PUBLIC_PROGRAM_ID || 'GX4gVWUtVgq6XxL8oHYy6psoN9KFdJhwnds2T3NHe5na';

