import {
  TWITTER_AUTH_URL,
  TWITTER_CLIENT_ID,
  TWITTER_REDIRECT_URI,
  TWITTER_SCOPES,
} from './config';
import { generateCodeChallenge, generateCodeVerifier, generateState } from './pkce';

const PKCE_STORAGE_KEY = 'twitter_pkce';
const STATE_STORAGE_KEY = 'twitter_oauth_state';

interface PKCEData {
  codeVerifier: string;
  codeChallenge: string;
}

/**
 * Initiate Twitter OAuth 2.0 flow with PKCE
 */
export async function initiateTwitterAuth(): Promise<void> {
  // Generate PKCE values
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = generateState();

  // Store PKCE verifier and state for callback
  sessionStorage.setItem(PKCE_STORAGE_KEY, JSON.stringify({ codeVerifier, codeChallenge }));
  sessionStorage.setItem(STATE_STORAGE_KEY, state);

  // Build authorization URL
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: TWITTER_CLIENT_ID,
    redirect_uri: TWITTER_REDIRECT_URI,
    scope: TWITTER_SCOPES.join(' '),
    state: state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  const authUrl = `${TWITTER_AUTH_URL}?${params.toString()}`;

  // Redirect to Twitter
  window.location.href = authUrl;
}

/**
 * Get stored PKCE data
 */
export function getPKCEData(): PKCEData | null {
  const stored = sessionStorage.getItem(PKCE_STORAGE_KEY);
  if (!stored) return null;
  
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

/**
 * Get stored state
 */
export function getStoredState(): string | null {
  return sessionStorage.getItem(STATE_STORAGE_KEY);
}

/**
 * Clear stored PKCE data and state
 */
export function clearPKCEData(): void {
  sessionStorage.removeItem(PKCE_STORAGE_KEY);
  sessionStorage.removeItem(STATE_STORAGE_KEY);
}

/**
 * Validate OAuth callback state
 */
export function validateState(callbackState: string): boolean {
  const storedState = getStoredState();
  return storedState === callbackState;
}

