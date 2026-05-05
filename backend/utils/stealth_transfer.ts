import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction, ComputeBudgetProgram } from '@solana/web3.js';
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createTransferInstruction, getAccount, TokenAccountNotFoundError, TokenInvalidAccountOwnerError } from '@solana/spl-token';
import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';

const DEVNET_USDC_MINT = new PublicKey('4zMMC9srt5Ri5X14vA1jJZRu2KptW37gZYGQEiAT');
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
    const receiverPoint = ed25519.ProjectivePoint.fromHex(receiverPubBytes);
    const ephemeralPriv = ed25519.utils.randomPrivateKey();
    const ephemeralPub = ed25519.getPublicKey(ephemeralPriv);
    const ephemeralPrivBigInt = bytesToBigInt(ephemeralPriv) % ed25519.CURVE.n;
    const sharedSecretPoint = receiverPoint.multiply(ephemeralPrivBigInt);
    const hBytes = sha256(sharedSecretPoint.toRawBytes());
    const hBigInt = bytesToBigInt(hBytes) % ed25519.CURVE.n;
    const hG = ed25519.ProjectivePoint.BASE.multiply(hBigInt);
    const stealthPoint = receiverPoint.add(hG);
    return {
      stealthPublicKey: new PublicKey(stealthPoint.toRawBytes()),
      ephemeralPublicKey: ephemeralPub,
    };
  } catch (error) {
    throw new Error(`Failed to generate stealth address`);
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
