/**
 * PKCE (Proof Key for Code Exchange) utilities for OAuth 2.0
 */

/**
 * Generate a cryptographically random string for code verifier
 */
export function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64URLEncode(array);
}

/**
 * Generate code challenge from code verifier using SHA-256
 */
export async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  // Some TS/lib.dom combinations model `Uint8Array#buffer` as `ArrayBuffer | SharedArrayBuffer`,
  // but WebCrypto's `BufferSource` type doesn't accept `SharedArrayBuffer` in those versions.
  // Copy to a fresh ArrayBuffer to satisfy typing and keep runtime behavior identical.
  const bytes = new Uint8Array(data);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return base64URLEncode(new Uint8Array(digest));
}

/**
 * Base64 URL encode (no padding, URL-safe characters)
 */
function base64URLEncode(buffer: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Generate a random state parameter for CSRF protection
 */
export function generateState(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return base64URLEncode(array);
}

