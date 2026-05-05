import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction, ComputeBudgetProgram } from '@solana/web3.js';
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createTransferInstruction, getAccount, TokenAccountNotFoundError, TokenInvalidAccountOwnerError } from '@solana/spl-token';
import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';

let DEVNET_USDC_MINT: PublicKey;
try {
  // ߔ Asli Circle Devnet USDC Mint
  DEVNET_USDC_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
} catch (e) {
  console.error('[stealth_transfer] Failed to parse DEVNET_USDC_MINT:', '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', e);
  throw e;
}
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
const DEVNET_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

export interface StealthAddressResult {
  stealthPublicKey: PublicKey;
  ephemeralPublicKey: Uint8Array;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  return BigInt('0x' + Buffer.from(bytes).toString('hex'));
}

async function withRpcRetry<T>(fn: () => Promise<T>, maxRetries: number = 5): Promise<T> {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await fn();
    } catch (error: any) {
      const isRateLimit = error?.message?.includes('429') || error?.message?.includes('Too Many Requests');
      if (isRateLimit && attempt < maxRetries - 1) {
        const backoffMs = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        console.warn(`[RPC Rate Limit] Retrying in ${Math.round(backoffMs)}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        attempt++;
      } else {
        throw error;
      }
    }
  }
  throw new Error('Max RPC retries exceeded');
}

export function generateStealthAddress(recipientPublicKey: string): StealthAddressResult {
  try {
    const receiverPubBytes = new PublicKey(recipientPublicKey).toBytes();

    // ߔ FIX 1: Convert to hex string for @noble/curves
    const receiverHex = Buffer.from(receiverPubBytes).toString('hex');
    // ߔ FIX 2: Use ExtendedPoint (sahi method Ed25519 ke liye)
    const receiverPoint = ed25519.ExtendedPoint.fromHex(receiverHex);

    const ephemeralScalarBytes = ed25519.utils.randomPrivateKey();

    // ߔ FIX 3: Clamp the scalar (Ed25519 standard taaki funds lock na ho)
    ephemeralScalarBytes[0] &= 248;
    ephemeralScalarBytes[31] &= 127;
    ephemeralScalarBytes[31] |= 64;

    const ephemeralScalar = bytesToBigInt(ephemeralScalarBytes) % ed25519.CURVE.n;

    // R = r * G (Ephemeral Public Key)
    const ephemeralPoint = ed25519.ExtendedPoint.BASE.multiply(ephemeralScalar);
    const ephemeralPub = ephemeralPoint.toRawBytes();

    // S = r * Q (Shared Secret)
    const sharedSecretPoint = receiverPoint.multiply(ephemeralScalar);
    const sharedSecretBytes = sharedSecretPoint.toRawBytes();

    const hBytes = sha256(sharedSecretBytes);
    const hBigInt = bytesToBigInt(hBytes) % ed25519.CURVE.n;

    const hG = ed25519.ExtendedPoint.BASE.multiply(hBigInt);
    const stealthPoint = receiverPoint.add(hG);

    return {
      stealthPublicKey: new PublicKey(stealthPoint.toRawBytes()),
      ephemeralPublicKey: ephemeralPub,
    };
  } catch (error: any) {
    // ߔ FIX 4: Unmasking the error
    console.error('[generateStealthAddress] Error message:', error.message);
    console.error('[generateStealthAddress] Error stack:', error.stack);
    throw new Error(error.message);
  }
}

export async function executeStealthUSDCTransfer(
  senderKeypair: Keypair,
  recipientPublicKey: string,
  amount: number | bigint
): Promise<string> {
  const connection = new Connection(DEVNET_RPC_URL, 'confirmed');
  try {
    const { stealthPublicKey, ephemeralPublicKey } = generateStealthAddress(recipientPublicKey);
    const senderAta = await getAssociatedTokenAddress(DEVNET_USDC_MINT, senderKeypair.publicKey);
    const stealthAta = await getAssociatedTokenAddress(DEVNET_USDC_MINT, stealthPublicKey, true);

    await withRpcRetry(async () => {
      const accountInfo = await getAccount(connection, senderAta);
      if (BigInt(accountInfo.amount) < BigInt(amount)) throw new Error('Insufficient USDC balance');
    });

    const transaction = new Transaction();
    transaction.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5000 }));
    transaction.add(
      createAssociatedTokenAccountInstruction(
        senderKeypair.publicKey,
        stealthAta,
        stealthPublicKey,
        DEVNET_USDC_MINT
      )
    );
    transaction.add(
      createTransferInstruction(senderAta, stealthAta, senderKeypair.publicKey, amount)
    );

    const ephemeralHex = Buffer.from(ephemeralPublicKey).toString('hex');
    transaction.add(
      new TransactionInstruction({
        keys: [],
        programId: MEMO_PROGRAM_ID,
        data: Buffer.from(`Aura-Enterprise|Stealth|${ephemeralHex}`, 'utf-8'),
      })
    );

    return await withRpcRetry(async () => {
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = senderKeypair.publicKey;
      const txSig = await sendAndConfirmTransaction(connection, transaction, [senderKeypair], {
        commitment: 'confirmed',
        maxRetries: 3,
      });
      return txSig;
    });
  } catch (error) {
    throw error;
  }
}