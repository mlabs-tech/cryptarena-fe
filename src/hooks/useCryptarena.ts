'use client';

import { useCallback, useState, useMemo } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import BN from 'bn.js';
import { useAuth } from '@/context/AuthContext';
import { usePrivyAuth } from '@/context/PrivyContext';
import { useSignTransaction, useWallets } from '@privy-io/react-auth/solana';

// Program ID for cryptarena-sol (new SOL-based program)
const PROGRAM_ID = new PublicKey('GX4gVWUtVgq6XxL8oHYy6psoN9KFdJhwnds2T3NHe5na');

// PDA Seeds (from the new program)
const GLOBAL_STATE_SEED = 'global_state';
const ARENA_SEED = 'arena';
const ARENA_VAULT_SEED = 'arena_vault';
const PLAYER_ENTRY_SEED = 'player_entry';
const WHITELIST_TOKEN_SEED = 'whitelist_token';

// All supported tokens (Solana + EVM)
// Index must match the on-chain whitelist
export const TOKEN_INDEX: Record<string, number> = {
  SOL: 0,
  TRUMP: 1,
  PUMP: 2,
  BONK: 3,
  JUP: 4,
  PENGU: 5,
  PYTH: 6,
  HNT: 7,
  FARTCOIN: 8,
  RAY: 9,
  JTO: 10,
  KMNO: 11,
  MET: 12,
  W: 13,
  // EVM tokens (indices 14-18)
  ETH: 14,
  UNI: 15,
  LINK: 16,
  PEPE: 17,
  SHIB: 18,
};

// Instruction discriminators from IDL
const ENTER_ARENA_DISCRIMINATOR = Buffer.from([237, 44, 241, 163, 152, 39, 13, 181]);
const CLAIM_WINNER_REWARDS_DISCRIMINATOR = Buffer.from([219, 234, 112, 241, 132, 16, 126, 206]);
const CLAIM_REFUND_DISCRIMINATOR = Buffer.from([15, 16, 30, 161, 255, 228, 97, 60]);

interface GlobalState {
  admin: PublicKey;
  treasuryWallet: PublicKey;
  arenaDuration: BN;
  entryFee: BN;
  currentArenaId: BN;
  isPaused: boolean;
  bump: number;
}

interface EnterArenaParams {
  tokenSymbol: string;
}

interface EnterArenaResult {
  success: boolean;
  signature?: string;
  error?: string;
}

// Reverse mapping: index to symbol
const INDEX_TO_TOKEN: Record<number, string> = Object.fromEntries(
  Object.entries(TOKEN_INDEX).map(([k, v]) => [v, k])
);

export function useCryptarena() {
  // External wallet adapter
  const { publicKey: externalPublicKey, signTransaction: externalSignTransaction, connected: externalConnected } = useWallet();
  const { connection } = useConnection();
  
  // Auth context to determine which wallet to use
  const { authMethod } = useAuth();
  const { getSolanaWalletAddress, isPrivyAuthenticated } = usePrivyAuth();
  
  // Privy wallet hooks - use signTransaction (not signAndSendTransaction) to avoid funding check
  const { signTransaction: privySignTransaction } = useSignTransaction();
  const { wallets: privyWallets, ready: privyWalletsReady } = useWallets();
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Determine if we should use Privy wallet
  const usePrivyWallet = authMethod === 'privy' && isPrivyAuthenticated;
  
  // Get the Privy Solana wallet
  const getPrivySolanaWallet = useCallback(() => {
    const privyAddress = getSolanaWalletAddress();
    if (!privyAddress || !privyWallets.length) return null;
    
    // Find the Solana wallet that matches our address
    return privyWallets.find(w => w.address === privyAddress) || privyWallets[0];
  }, [getSolanaWalletAddress, privyWallets]);
  
  // Get the active wallet address as a string (for stable dependency)
  const activeWalletAddress = useMemo((): string | null => {
    if (usePrivyWallet) {
      return getSolanaWalletAddress();
    }
    return externalPublicKey?.toBase58() || null;
  }, [usePrivyWallet, getSolanaWalletAddress, externalPublicKey]);
  
  // Memoize the PublicKey to prevent creating new objects on every render
  const publicKey = useMemo((): PublicKey | null => {
    if (!activeWalletAddress) return null;
    try {
      return new PublicKey(activeWalletAddress);
    } catch {
      return null;
    }
  }, [activeWalletAddress]);
  
  const connected = usePrivyWallet ? !!activeWalletAddress : externalConnected;

  // Derive Global State PDA
  const getGlobalStatePDA = useCallback((): [PublicKey, number] => {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(GLOBAL_STATE_SEED)],
      PROGRAM_ID
    );
  }, []);

  // Derive Arena PDA
  const getArenaPDA = useCallback((arenaId: BN): [PublicKey, number] => {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(ARENA_SEED), arenaId.toArrayLike(Buffer, 'le', 8)],
      PROGRAM_ID
    );
  }, []);

  // Derive Arena Vault PDA
  const getArenaVaultPDA = useCallback((arenaId: BN): [PublicKey, number] => {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(ARENA_VAULT_SEED), arenaId.toArrayLike(Buffer, 'le', 8)],
      PROGRAM_ID
    );
  }, []);

  // Derive Player Entry PDA
  const getPlayerEntryPDA = useCallback((arenaPubkey: PublicKey, playerPubkey: PublicKey): [PublicKey, number] => {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(PLAYER_ENTRY_SEED), arenaPubkey.toBuffer(), playerPubkey.toBuffer()],
      PROGRAM_ID
    );
  }, []);

  // Derive Whitelisted Token PDA (by asset_index - u8)
  const getWhitelistedTokenPDA = useCallback((assetIndex: number): [PublicKey, number] => {
    // asset_index is u8 in the program, so use 1 byte
    const indexBuffer = Buffer.from([assetIndex]);
    return PublicKey.findProgramAddressSync(
      [Buffer.from(WHITELIST_TOKEN_SEED), indexBuffer],
      PROGRAM_ID
    );
  }, []);

  // Fetch global state to get current arena ID and entry fee
  const fetchGlobalState = useCallback(async (): Promise<GlobalState | null> => {
    try {
      const [globalStatePDA] = getGlobalStatePDA();
      const accountInfo = await connection.getAccountInfo(globalStatePDA);
      
      if (!accountInfo) {
        console.log('Global state not found');
        return null;
      }

      // Parse the account data (skip 8-byte discriminator)
      const data = accountInfo.data.slice(8);
      
      return {
        admin: new PublicKey(data.slice(0, 32)),
        treasuryWallet: new PublicKey(data.slice(32, 64)),
        arenaDuration: new BN(data.slice(64, 72), 'le'),
        entryFee: new BN(data.slice(72, 80), 'le'),
        currentArenaId: new BN(data.slice(80, 88), 'le'),
        isPaused: data[88] === 1,
        bump: data[89],
      };
    } catch (err) {
      console.error('Failed to fetch global state:', err);
      return null;
    }
  }, [connection, getGlobalStatePDA]);

  // Get entry fee in SOL
  const getEntryFee = useCallback(async (): Promise<number> => {
    const globalState = await fetchGlobalState();
    if (!globalState) return 0.01; // Default fallback
    return globalState.entryFee.toNumber() / LAMPORTS_PER_SOL;
  }, [fetchGlobalState]);

  // Enter arena with a token pick (pays SOL entry fee)
  const enterArena = useCallback(async (params: EnterArenaParams): Promise<EnterArenaResult> => {
    if (!publicKey || !connected) {
      return { success: false, error: 'Wallet not connected' };
    }
    
    // For external wallets, we need signTransaction
    if (!usePrivyWallet && !externalSignTransaction) {
      return { success: false, error: 'Wallet not connected' };
    }

    setIsLoading(true);
    setError(null);

    try {
      const { tokenSymbol } = params;
      
      // Get token index
      const assetIndex = TOKEN_INDEX[tokenSymbol];
      
      if (assetIndex === undefined) {
        return { success: false, error: `Unknown token: ${tokenSymbol}` };
      }

      // Fetch global state to get current arena ID
      const globalState = await fetchGlobalState();
      if (!globalState) {
        return { success: false, error: 'Protocol not initialized' };
      }

      if (globalState.isPaused) {
        return { success: false, error: 'Protocol is paused' };
      }

      // Derive all PDAs
      const [globalStatePDA] = getGlobalStatePDA();
      const [arenaPDA] = getArenaPDA(globalState.currentArenaId);
      const [arenaVaultPDA] = getArenaVaultPDA(globalState.currentArenaId);
      const [playerEntryPDA] = getPlayerEntryPDA(arenaPDA, publicKey);
      const [whitelistedTokenPDA] = getWhitelistedTokenPDA(assetIndex);

      // Build instruction data: discriminator + asset_index (u8)
      const instructionData = Buffer.concat([
        ENTER_ARENA_DISCRIMINATOR,
        Buffer.from([assetIndex]),
      ]);

      // Build the instruction
      const instruction = new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: globalStatePDA, isSigner: false, isWritable: true },
          { pubkey: arenaPDA, isSigner: false, isWritable: true },
          { pubkey: arenaVaultPDA, isSigner: false, isWritable: true },
          { pubkey: playerEntryPDA, isSigner: false, isWritable: true },
          { pubkey: whitelistedTokenPDA, isSigner: false, isWritable: false },
          { pubkey: publicKey, isSigner: true, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: instructionData,
      });

      // Create transaction
      const transaction = new Transaction();
      transaction.add(instruction);

      // Get recent blockhash
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      let signature: string;

      if (usePrivyWallet) {
        // Use Privy to sign transaction (not signAndSend to avoid funding check)
        console.log('Using Privy wallet to sign transaction...');
        console.log('Privy wallets ready:', privyWalletsReady, 'count:', privyWallets.length);
        console.log('Privy wallets:', privyWallets.map(w => ({ address: w.address })));
        
        // Wait for wallets to be ready
        if (!privyWalletsReady) {
          return { success: false, error: 'Privy wallets not ready yet. Please try again.' };
        }
        
        // Get the Solana wallet - use first wallet if getPrivySolanaWallet doesn't find a match
        let privyWallet = getPrivySolanaWallet();
        if (!privyWallet && privyWallets.length > 0) {
          // Fallback to first available wallet
          privyWallet = privyWallets[0];
          console.log('Using first available wallet:', privyWallet.address);
        }
        
        if (!privyWallet) {
          console.error('No Privy wallet found. Ready:', privyWalletsReady, 'Wallets:', privyWallets);
          return { success: false, error: 'Privy wallet not found. Please reconnect.' };
        }
        
        console.log('Found privy wallet:', privyWallet.address);
        
        // Serialize the transaction to Uint8Array for Privy
        const serializedTransaction = new Uint8Array(transaction.serialize({ requireAllSignatures: false }));
        
        // Sign the transaction with Privy
        // Skip the wallet UI to avoid mainnet simulation - we handle sending ourselves
        const signResult = await privySignTransaction({
          transaction: serializedTransaction,
          wallet: privyWallet,
          options: {
            uiOptions: {
              showWalletUIs: false, // Skip Privy's transaction preview UI
            },
          },
        });
        
        console.log('Privy signed transaction, sending...');
        
        // Send the signed transaction ourselves
        signature = await connection.sendRawTransaction(signResult.signedTransaction, {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });
        
        console.log('Transaction sent, signature:', signature);
        
        // Wait for confirmation
        await connection.confirmTransaction({
          signature,
          blockhash,
          lastValidBlockHeight,
        }, 'confirmed');
      } else {
        // Use external wallet adapter to sign and send
        console.log('Using external wallet to sign and send transaction...');
        const signedTx = await externalSignTransaction!(transaction);
        
        signature = await connection.sendRawTransaction(signedTx.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });
        
        // Confirm transaction
        await connection.confirmTransaction({
          signature,
          blockhash,
          lastValidBlockHeight,
        }, 'confirmed');
      }

      console.log('Enter arena transaction confirmed:', signature);

      return { success: true, signature };
    } catch (err) {
      console.error('Enter arena failed:', err);
      const errorMessage = err instanceof Error ? err.message : 'Transaction failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, connected, usePrivyWallet, externalSignTransaction, privySignTransaction, getPrivySolanaWallet, connection, fetchGlobalState, getGlobalStatePDA, getArenaPDA, getArenaVaultPDA, getPlayerEntryPDA, getWhitelistedTokenPDA]);

  // Get token symbol from index
  const getTokenSymbol = useCallback((index: number): string => {
    return INDEX_TO_TOKEN[index] || `TOKEN_${index}`;
  }, []);

  // Claim winner rewards (90% of pool in SOL)
  const claimWinnerRewards = useCallback(async (params: { arenaId: number }): Promise<EnterArenaResult> => {
    if (!publicKey || !connected) {
      return { success: false, error: 'Wallet not connected' };
    }
    
    if (!usePrivyWallet && !externalSignTransaction) {
      return { success: false, error: 'Wallet not connected' };
    }

    setIsLoading(true);
    setError(null);

    try {
      const { arenaId } = params;
      
      // Derive all PDAs
      const arenaIdBN = new BN(arenaId);
      const [arenaPDA] = getArenaPDA(arenaIdBN);
      const [arenaVaultPDA] = getArenaVaultPDA(arenaIdBN);
      const [playerEntryPDA] = getPlayerEntryPDA(arenaPDA, publicKey);

      // Build instruction data: just discriminator (no arguments)
      const instructionData = CLAIM_WINNER_REWARDS_DISCRIMINATOR;

      // Build the instruction - accounts match ClaimWinnerRewards struct in Rust
      // 1. arena (read-only)
      // 2. arena_vault (mut)
      // 3. player_entry (mut)
      // 4. winner (signer, mut)
      // 5. system_program
      const instruction = new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: arenaPDA, isSigner: false, isWritable: false },
          { pubkey: arenaVaultPDA, isSigner: false, isWritable: true },
          { pubkey: playerEntryPDA, isSigner: false, isWritable: true },
          { pubkey: publicKey, isSigner: true, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: instructionData,
      });

      // Create transaction
      const transaction = new Transaction();
      transaction.add(instruction);

      // Get recent blockhash
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      let signature: string;

      if (usePrivyWallet) {
        // Use Privy to sign transaction
        console.log('Using Privy wallet to claim rewards...');
        
        const privyWallet = getPrivySolanaWallet() || (privyWallets.length > 0 ? privyWallets[0] : null);
        if (!privyWallet) {
          return { success: false, error: 'Privy wallet not found' };
        }
        
        const serializedTransaction = new Uint8Array(transaction.serialize({ requireAllSignatures: false }));
        
        // Sign with Privy - skip wallet UI to avoid mainnet simulation
        const signResult = await privySignTransaction({
          transaction: serializedTransaction,
          wallet: privyWallet,
          options: {
            uiOptions: {
              showWalletUIs: false,
            },
          },
        });
        
        // Send the signed transaction ourselves to devnet
        signature = await connection.sendRawTransaction(signResult.signedTransaction, {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });
        
        await connection.confirmTransaction({
          signature,
          blockhash,
          lastValidBlockHeight,
        }, 'confirmed');
      } else {
        // Use external wallet adapter to sign and send
        console.log('Using external wallet to claim rewards...');
        const signedTx = await externalSignTransaction!(transaction);
        
        signature = await connection.sendRawTransaction(signedTx.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });
        
        await connection.confirmTransaction({
          signature,
          blockhash,
          lastValidBlockHeight,
        }, 'confirmed');
      }

      console.log('Claim winner rewards transaction confirmed:', signature);

      return { success: true, signature };
    } catch (err) {
      console.error('Claim winner rewards failed:', err);
      const errorMessage = err instanceof Error ? err.message : 'Transaction failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, connected, usePrivyWallet, externalSignTransaction, privySignTransaction, getPrivySolanaWallet, connection, getArenaPDA, getArenaVaultPDA, getPlayerEntryPDA]);

  // Claim refund for canceled arena (tie scenario)
  const claimRefund = useCallback(async (params: { arenaId: number }): Promise<EnterArenaResult> => {
    if (!publicKey || !connected) {
      return { success: false, error: 'Wallet not connected' };
    }
    
    if (!usePrivyWallet && !externalSignTransaction) {
      return { success: false, error: 'Wallet not connected' };
    }

    setIsLoading(true);
    setError(null);

    try {
      const { arenaId } = params;
      
      // Derive all PDAs
      const arenaIdBN = new BN(arenaId);
      const [arenaPDA] = getArenaPDA(arenaIdBN);
      const [arenaVaultPDA] = getArenaVaultPDA(arenaIdBN);
      const [playerEntryPDA] = getPlayerEntryPDA(arenaPDA, publicKey);

      // Build instruction data: just discriminator (no arguments)
      const instructionData = CLAIM_REFUND_DISCRIMINATOR;

      // Build the instruction - accounts match ClaimRefund struct in Rust
      // 1. arena (read-only)
      // 2. arena_vault (mut)
      // 3. player_entry (mut)
      // 4. player (signer, mut)
      // 5. system_program
      const instruction = new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: arenaPDA, isSigner: false, isWritable: false },
          { pubkey: arenaVaultPDA, isSigner: false, isWritable: true },
          { pubkey: playerEntryPDA, isSigner: false, isWritable: true },
          { pubkey: publicKey, isSigner: true, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: instructionData,
      });

      // Create transaction
      const transaction = new Transaction();
      transaction.add(instruction);

      // Get recent blockhash
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      let signature: string;

      if (usePrivyWallet) {
        // Use Privy to sign transaction
        console.log('Using Privy wallet to claim refund...');
        
        const privyWallet = getPrivySolanaWallet() || (privyWallets.length > 0 ? privyWallets[0] : null);
        if (!privyWallet) {
          return { success: false, error: 'Privy wallet not found' };
        }
        
        const serializedTransaction = new Uint8Array(transaction.serialize({ requireAllSignatures: false }));
        
        // Sign with Privy - skip wallet UI to avoid mainnet simulation
        const signResult = await privySignTransaction({
          transaction: serializedTransaction,
          wallet: privyWallet,
          options: {
            uiOptions: {
              showWalletUIs: false,
            },
          },
        });
        
        // Send the signed transaction ourselves to devnet
        signature = await connection.sendRawTransaction(signResult.signedTransaction, {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });
        
        await connection.confirmTransaction({
          signature,
          blockhash,
          lastValidBlockHeight,
        }, 'confirmed');
      } else {
        // Use external wallet adapter to sign and send
        console.log('Using external wallet to claim refund...');
        const signedTx = await externalSignTransaction!(transaction);
        
        signature = await connection.sendRawTransaction(signedTx.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });
        
        await connection.confirmTransaction({
          signature,
          blockhash,
          lastValidBlockHeight,
        }, 'confirmed');
      }

      console.log('Claim refund transaction confirmed:', signature);

      return { success: true, signature };
    } catch (err) {
      console.error('Claim refund failed:', err);
      const errorMessage = err instanceof Error ? err.message : 'Transaction failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, connected, usePrivyWallet, externalSignTransaction, privySignTransaction, getPrivySolanaWallet, connection, getArenaPDA, getArenaVaultPDA, getPlayerEntryPDA]);

  return {
    enterArena,
    claimWinnerRewards,
    claimRefund,
    fetchGlobalState,
    getEntryFee,
    getTokenSymbol,
    isLoading,
    error,
    programId: PROGRAM_ID,
    TOKEN_INDEX,
    // Wallet info
    publicKey,
    connected,
    usePrivyWallet,
  };
}
