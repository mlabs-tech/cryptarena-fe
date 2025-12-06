'use client';

import { useCallback, useState } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from '@solana/spl-token';
import BN from 'bn.js';

// Program ID for cryptarena-svm-test
const PROGRAM_ID = new PublicKey('2LsREShXRB5GMera37czrEKwe5xt9FUnKAjwpW183ce9');

// PDA Seeds
const GLOBAL_STATE_SEED = 'global_state_v2';
const ARENA_SEED = 'arena_v2';
const ARENA_ASSET_SEED = 'arena_asset_v2';
const PLAYER_ENTRY_SEED = 'player_entry_v2';

// Token mint addresses (same as in queue page)
const TOKEN_MINTS: Record<string, string> = {
  SOL: '7a1eh57mbAvEHevFhsofrGYgGPiNBpwwPzQu4KU85EXe',
  TRUMP: '5aTAebL8dn3s4SFDLaMTC866XomLCJ4vY1Z1VTEALSdh',
  PUMP: 'K3vfcZbYhEuEHG6woBVpShURxnVxavhgyP16VM9zChS',
  BONK: 'DkHvWT5Ayk9ciWhz7FU48A2MdEwZekuRdaYVUGtjZdYB',
  JUP: 'E1JEPG4CcK2AHh3s6FFSHBjdzBqBcYjttL4GBHQGKNGS',
  PENGU: 'BhhivFuau4RFEPTwrdvhzvSQuyezc8nJW8vPsBDoLruz',
  PYTH: 'Cm8Z4DsQ4SP7zc3FTcTHpzyZ8hMR1adiDSG7Hf45dFMt',
  HNT: '8dbowGCfdiL7x3tzuKJfbc4WPpHdqRqsHEeqfd5Wh7xn',
  FARTCOIN: '2yaeL5SPximYfKHJMvhsaFfmcoA3XUMcKd7buuq7sFnz',
  RAY: 'Dx67K9UyaHsPy7shTmuC4xuHvKGFcSpfzBQQNEgP3Fcf',
  JTO: 'ChMDp2sBn23Zyu2YtGU7M6hQUJzMmMdZ6XmWpsrxRKEr',
  KMNO: '2byoKnAGKFFRKcmrxJ7FeizXH1pw2tqN38E7dLs7ogvg',
  MET: '4YHdgCq49res2mKd4EUBFtk2krmzt3RLaSUVVkgwMH36',
  W: 'H9wd9H5wAVXBpsf9VtRKMXtSeUGNWHk33UkywWNvWjDi',
};

// Token index mapping (must match program)
const TOKEN_INDEX: Record<string, number> = {
  SOL: 0, TRUMP: 1, PUMP: 2, BONK: 3, JUP: 4, PENGU: 5, PYTH: 6,
  HNT: 7, FARTCOIN: 8, RAY: 9, JTO: 10, KMNO: 11, MET: 12, W: 13,
};

// Instruction discriminators (from IDL)
const ENTER_ARENA_DISCRIMINATOR = Buffer.from([237, 44, 241, 163, 152, 39, 13, 181]);
const CLAIM_OWN_TOKENS_DISCRIMINATOR = Buffer.from([29, 84, 22, 14, 126, 67, 12, 111]);
const CLAIM_LOSER_TOKENS_DISCRIMINATOR = Buffer.from([76, 127, 192, 84, 200, 201, 164, 199]);

interface GlobalState {
  admin: PublicKey;
  treasuryWallet: PublicKey;
  arenaDuration: BN;
  currentArenaId: BN;
  maxPlayersPerArena: number;
  maxSameAsset: number;
  isPaused: boolean;
  bump: number;
}

interface EnterArenaParams {
  tokenSymbol: string;
  tokenAmount: number; // in token units (not smallest unit)
  usdValue: number; // in dollars
}

interface EnterArenaResult {
  success: boolean;
  signature?: string;
  error?: string;
}

interface ClaimOwnTokensParams {
  arenaId: number;
  tokenSymbol: string;
}

interface ClaimLoserTokensParams {
  arenaId: number;
  loserWallet: string;
  loserTokenSymbol: string;
  winningAssetIndex: number;
}

interface ClaimResult {
  success: boolean;
  signature?: string;
  error?: string;
}

// Reverse mapping: index to symbol
const INDEX_TO_TOKEN: Record<number, string> = Object.fromEntries(
  Object.entries(TOKEN_INDEX).map(([k, v]) => [v, k])
);

export function useCryptarena() {
  const { publicKey, signTransaction, connected } = useWallet();
  const { connection } = useConnection();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Derive Global State PDA
  const getGlobalStatePDA = useCallback(async (): Promise<[PublicKey, number]> => {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(GLOBAL_STATE_SEED)],
      PROGRAM_ID
    );
  }, []);

  // Derive Arena PDA
  const getArenaPDA = useCallback(async (arenaId: BN): Promise<[PublicKey, number]> => {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(ARENA_SEED), arenaId.toArrayLike(Buffer, 'le', 8)],
      PROGRAM_ID
    );
  }, []);

  // Derive Arena Asset PDA
  const getArenaAssetPDA = useCallback(async (arenaPubkey: PublicKey, assetIndex: number): Promise<[PublicKey, number]> => {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(ARENA_ASSET_SEED), arenaPubkey.toBuffer(), Buffer.from([assetIndex])],
      PROGRAM_ID
    );
  }, []);

  // Derive Player Entry PDA
  const getPlayerEntryPDA = useCallback(async (arenaPubkey: PublicKey, playerPubkey: PublicKey): Promise<[PublicKey, number]> => {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(PLAYER_ENTRY_SEED), arenaPubkey.toBuffer(), playerPubkey.toBuffer()],
      PROGRAM_ID
    );
  }, []);

  // Get Arena Vault - this is an ATA owned by the arena PDA
  const getArenaVault = useCallback(async (arenaPubkey: PublicKey, mintPubkey: PublicKey): Promise<PublicKey> => {
    // The arena vault is an Associated Token Account for the arena PDA
    // allowOwnerOffCurve = true allows the ATA to be owned by a PDA
    return getAssociatedTokenAddress(mintPubkey, arenaPubkey, true);
  }, []);

  // Derive Whitelisted Token PDA
  const getWhitelistedTokenPDA = useCallback(async (mintPubkey: PublicKey): Promise<[PublicKey, number]> => {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("whitelist_token_v2"), mintPubkey.toBuffer()],
      PROGRAM_ID
    );
  }, []);

  // Fetch global state to get current arena ID
  const fetchGlobalState = useCallback(async (): Promise<GlobalState | null> => {
    try {
      const [globalStatePDA] = await getGlobalStatePDA();
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
        currentArenaId: new BN(data.slice(72, 80), 'le'),
        maxPlayersPerArena: data[80],
        maxSameAsset: data[81],
        isPaused: data[82] === 1,
        bump: data[83],
      };
    } catch (err) {
      console.error('Failed to fetch global state:', err);
      return null;
    }
  }, [connection, getGlobalStatePDA]);

  // Enter arena
  const enterArena = useCallback(async (params: EnterArenaParams): Promise<EnterArenaResult> => {
    if (!publicKey || !signTransaction || !connected) {
      return { success: false, error: 'Wallet not connected' };
    }

    setIsLoading(true);
    setError(null);

    try {
      const { tokenSymbol, tokenAmount, usdValue } = params;
      
      // Get token mint and index
      const mintAddress = TOKEN_MINTS[tokenSymbol];
      const assetIndex = TOKEN_INDEX[tokenSymbol];
      
      if (!mintAddress || assetIndex === undefined) {
        return { success: false, error: `Unknown token: ${tokenSymbol}` };
      }

      const mint = new PublicKey(mintAddress);

      // Fetch global state to get current arena ID
      const globalState = await fetchGlobalState();
      if (!globalState) {
        return { success: false, error: 'Protocol not initialized' };
      }

      if (globalState.isPaused) {
        return { success: false, error: 'Protocol is paused' };
      }

      // Derive all PDAs
      const [globalStatePDA] = await getGlobalStatePDA();
      const [arenaPDA] = await getArenaPDA(globalState.currentArenaId);
      const [arenaAssetPDA] = await getArenaAssetPDA(arenaPDA, assetIndex);
      const [playerEntryPDA] = await getPlayerEntryPDA(arenaPDA, publicKey);
      const [whitelistedTokenPDA] = await getWhitelistedTokenPDA(mint);
      
      // Arena vault is an ATA owned by the arena PDA
      const arenaVault = await getArenaVault(arenaPDA, mint);

      // Get player's token account (ATA)
      const playerTokenAccount = await getAssociatedTokenAddress(mint, publicKey);

      // Convert amounts to smallest units (9 decimals for SPL tokens)
      const amountInSmallestUnit = new BN(Math.floor(tokenAmount * 1e9));
      // USD value uses 6 decimals in the program
      const usdValueInSmallestUnit = new BN(Math.floor(usdValue * 1e6));

      // Build instruction data
      const instructionData = Buffer.concat([
        ENTER_ARENA_DISCRIMINATOR,
        Buffer.from([assetIndex]), // asset_index: u8
        amountInSmallestUnit.toArrayLike(Buffer, 'le', 8), // amount: u64
        usdValueInSmallestUnit.toArrayLike(Buffer, 'le', 8), // usd_value: u64
      ]);

      // Build the instruction
      const instruction = new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: globalStatePDA, isSigner: false, isWritable: true },
          { pubkey: arenaPDA, isSigner: false, isWritable: true },
          { pubkey: arenaAssetPDA, isSigner: false, isWritable: true },
          { pubkey: playerEntryPDA, isSigner: false, isWritable: true },
          { pubkey: playerTokenAccount, isSigner: false, isWritable: true },
          { pubkey: arenaVault, isSigner: false, isWritable: true },
          { pubkey: whitelistedTokenPDA, isSigner: false, isWritable: false },
          { pubkey: publicKey, isSigner: true, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: instructionData,
      });

      // Create transaction
      const transaction = new Transaction();

      // Check if player token account exists, if not create it
      try {
        await getAccount(connection, playerTokenAccount);
      } catch {
        // ATA doesn't exist, add creation instruction
        transaction.add(
          createAssociatedTokenAccountInstruction(
            publicKey,
            playerTokenAccount,
            publicKey,
            mint
          )
        );
      }

      // Check if arena vault exists, if not create it
      // The arena vault is an ATA owned by the arena PDA
      try {
        await getAccount(connection, arenaVault);
      } catch {
        // Arena vault ATA doesn't exist, create it
        // The payer is the user, but the owner is the arena PDA
        transaction.add(
          createAssociatedTokenAccountInstruction(
            publicKey,     // payer
            arenaVault,    // ATA address
            arenaPDA,      // owner (the arena PDA)
            mint           // mint
          )
        );
      }

      // Add the enter_arena instruction
      transaction.add(instruction);

      // Get recent blockhash
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      // Sign transaction
      const signedTx = await signTransaction(transaction);

      // Send transaction
      const signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      // Confirm transaction
      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');

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
  }, [publicKey, signTransaction, connected, connection, fetchGlobalState, getGlobalStatePDA, getArenaPDA, getArenaAssetPDA, getPlayerEntryPDA, getArenaVault]);

  // Claim own tokens (winner gets their original entry back)
  const claimOwnTokens = useCallback(async (params: ClaimOwnTokensParams): Promise<ClaimResult> => {
    if (!publicKey || !signTransaction || !connected) {
      return { success: false, error: 'Wallet not connected' };
    }

    setIsLoading(true);
    setError(null);

    try {
      const { arenaId, tokenSymbol } = params;

      // Get token mint
      const mintAddress = TOKEN_MINTS[tokenSymbol];
      if (!mintAddress) {
        return { success: false, error: `Unknown token: ${tokenSymbol}` };
      }

      const mint = new PublicKey(mintAddress);
      const arenaIdBN = new BN(arenaId);

      // Derive PDAs
      const [arenaPDA] = await getArenaPDA(arenaIdBN);
      const [playerEntryPDA] = await getPlayerEntryPDA(arenaPDA, publicKey);
      
      // Arena vault is an ATA owned by the arena PDA
      const arenaVault = await getArenaVault(arenaPDA, mint);

      // Check if the arena vault exists (tokens were actually deposited)
      const vaultInfo = await connection.getAccountInfo(arenaVault);
      if (!vaultInfo) {
        return { 
          success: false, 
          error: `No tokens available - arena vault for ${tokenSymbol} does not exist` 
        };
      }

      // Winner's token account
      const winnerTokenAccount = await getAssociatedTokenAddress(mint, publicKey);

      // Build instruction
      const instruction = new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: arenaPDA, isSigner: false, isWritable: false },
          { pubkey: playerEntryPDA, isSigner: false, isWritable: true },
          { pubkey: arenaVault, isSigner: false, isWritable: true },
          { pubkey: winnerTokenAccount, isSigner: false, isWritable: true },
          { pubkey: publicKey, isSigner: true, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        data: CLAIM_OWN_TOKENS_DISCRIMINATOR,
      });

      // Create transaction
      const transaction = new Transaction();

      // Ensure winner's ATA exists
      try {
        await getAccount(connection, winnerTokenAccount);
      } catch {
        transaction.add(
          createAssociatedTokenAccountInstruction(
            publicKey,
            winnerTokenAccount,
            publicKey,
            mint
          )
        );
      }

      transaction.add(instruction);

      // Get recent blockhash
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      // Sign and send
      const signedTx = await signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');

      console.log('Claim own tokens confirmed:', signature);
      return { success: true, signature };
    } catch (err) {
      console.error('Claim own tokens failed:', err);
      const errorMessage = err instanceof Error ? err.message : 'Transaction failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, signTransaction, connected, connection, getArenaPDA, getPlayerEntryPDA, getArenaVault]);

  // Claim loser tokens (winner claims from a specific loser)
  const claimLoserTokens = useCallback(async (params: ClaimLoserTokensParams): Promise<ClaimResult> => {
    if (!publicKey || !signTransaction || !connected) {
      return { success: false, error: 'Wallet not connected' };
    }

    setIsLoading(true);
    setError(null);

    try {
      const { arenaId, loserWallet, loserTokenSymbol, winningAssetIndex } = params;

      // Get loser's token mint
      const mintAddress = TOKEN_MINTS[loserTokenSymbol];
      if (!mintAddress) {
        return { success: false, error: `Unknown token: ${loserTokenSymbol}` };
      }

      const mint = new PublicKey(mintAddress);
      const arenaIdBN = new BN(arenaId);
      const loserPubkey = new PublicKey(loserWallet);

      // Fetch global state to get treasury wallet
      const globalState = await fetchGlobalState();
      if (!globalState) {
        return { success: false, error: 'Protocol not initialized' };
      }

      // Derive PDAs
      const [globalStatePDA] = await getGlobalStatePDA();
      const [arenaPDA] = await getArenaPDA(arenaIdBN);
      const [arenaAssetPDA] = await getArenaAssetPDA(arenaPDA, winningAssetIndex);
      const [winnerEntryPDA] = await getPlayerEntryPDA(arenaPDA, publicKey);
      const [loserEntryPDA] = await getPlayerEntryPDA(arenaPDA, loserPubkey);
      
      // Arena vault for the loser's token
      const arenaVault = await getArenaVault(arenaPDA, mint);

      // Check if the arena vault exists (tokens were actually deposited)
      const vaultInfo = await connection.getAccountInfo(arenaVault);
      if (!vaultInfo) {
        return { 
          success: false, 
          error: `No tokens available - arena vault for ${loserTokenSymbol} does not exist` 
        };
      }

      // Winner's token account for the loser's token type
      const winnerTokenAccount = await getAssociatedTokenAddress(mint, publicKey);

      // Build instruction (treasury claims separately now)
      const instruction = new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: globalStatePDA, isSigner: false, isWritable: false },
          { pubkey: arenaPDA, isSigner: false, isWritable: false },
          { pubkey: arenaAssetPDA, isSigner: false, isWritable: false },
          { pubkey: winnerEntryPDA, isSigner: false, isWritable: true },
          { pubkey: loserEntryPDA, isSigner: false, isWritable: false },
          { pubkey: arenaVault, isSigner: false, isWritable: true },
          { pubkey: winnerTokenAccount, isSigner: false, isWritable: true },
          { pubkey: publicKey, isSigner: true, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        data: CLAIM_LOSER_TOKENS_DISCRIMINATOR,
      });

      // Create transaction
      const transaction = new Transaction();

      // Ensure winner's ATA exists for this token type
      try {
        await getAccount(connection, winnerTokenAccount);
      } catch {
        transaction.add(
          createAssociatedTokenAccountInstruction(
            publicKey,
            winnerTokenAccount,
            publicKey,
            mint
          )
        );
      }

      transaction.add(instruction);

      // Get recent blockhash
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      // Sign and send
      const signedTx = await signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');

      console.log('Claim loser tokens confirmed:', signature);
      return { success: true, signature };
    } catch (err) {
      console.error('Claim loser tokens failed:', err);
      const errorMessage = err instanceof Error ? err.message : 'Transaction failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, signTransaction, connected, connection, fetchGlobalState, getGlobalStatePDA, getArenaPDA, getArenaAssetPDA, getPlayerEntryPDA, getArenaVault]);

  // Get token symbol from index
  const getTokenSymbol = useCallback((index: number): string => {
    return INDEX_TO_TOKEN[index] || `TOKEN_${index}`;
  }, []);

  return {
    enterArena,
    claimOwnTokens,
    claimLoserTokens,
    fetchGlobalState,
    getTokenSymbol,
    isLoading,
    error,
    programId: PROGRAM_ID,
    TOKEN_MINTS,
    TOKEN_INDEX,
  };
}

