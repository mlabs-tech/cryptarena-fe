// Backend API Client
// Connects to the Spring Boot backend for user management and airdrop functionality

const BACKEND_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

// Airdrop types
export interface AirdropEligibilityResponse {
  eligible: boolean;
  reason: string;
  nextEligibleAt: string | null;
  secondsUntilEligible: number;
}

export interface AirdropClaimRequest {
  walletAddress: string;
}

export interface AirdropClaimResponse {
  id: string;
  walletAddress: string;
  amountSol: number;
  transactionSignature: string | null;
  status: string;
  claimedAt: string;
}

export interface AirdropHistoryResponse {
  id: string;
  walletAddress: string;
  amountSol: number;
  transactionSignature: string | null;
  status: string;
  claimedAt: string;
}

class BackendApi {
  private baseUrl: string;

  constructor(baseUrl: string = BACKEND_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Check if a wallet is eligible for airdrop
   */
  async checkAirdropEligibility(
    walletAddress: string, 
    token: string
  ): Promise<AirdropEligibilityResponse> {
    const response = await fetch(
      `${this.baseUrl}/api/airdrop/eligibility/${walletAddress}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to check eligibility' }));
      throw new Error(error.message || 'Failed to check airdrop eligibility');
    }

    return response.json();
  }

  /**
   * Claim airdrop
   */
  async claimAirdrop(
    walletAddress: string, 
    token: string
  ): Promise<AirdropClaimResponse> {
    const response = await fetch(
      `${this.baseUrl}/api/airdrop/claim`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ walletAddress }),
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to claim airdrop' }));
      throw new Error(error.message || 'Failed to claim airdrop');
    }

    return response.json();
  }

  /**
   * Get airdrop history for the authenticated user
   */
  async getAirdropHistory(token: string): Promise<AirdropHistoryResponse[]> {
    const response = await fetch(
      `${this.baseUrl}/api/airdrop/history`,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to fetch history' }));
      throw new Error(error.message || 'Failed to fetch airdrop history');
    }

    return response.json();
  }
}

export const backendApi = new BackendApi();
export default backendApi;

