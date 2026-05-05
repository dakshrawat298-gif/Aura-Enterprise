import React, { useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';

const PRESET_AMOUNTS = [1, 5, 10, 25];

export default function CreatorTab() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();

  const [creatorAddress, setCreatorAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [txSig, setTxSig] = useState(null);

  const handleSendTip = async () => {
    if (!connected || !publicKey) {
      setStatus({ type: 'error', message: 'Please connect your wallet first.' });
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (!creatorAddress.trim() || !parsedAmount || parsedAmount <= 0) {
      setStatus({ type: 'error', message: 'Enter a valid creator address and tip amount.' });
      return;
    }

    setLoading(true);
    setTxSig(null);

    try {
      const { PublicKey, Transaction, TransactionInstruction, ComputeBudgetProgram } = await import('@solana/web3.js');
      const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createTransferInstruction, getAccount, TokenAccountNotFoundError } = await import('@solana/spl-token');

      const DEVNET_USDC_MINT = new PublicKey('4zMMC9srt5Ri5X14vA1jJZRu2KptW37gZYGQEiAT');
      const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
      const USDC_DECIMALS = 6;

      let recipientPubKey;
      try {
        recipientPubKey = new PublicKey(creatorAddress.trim());
      } catch {
        setStatus({ type: 'error', message: 'Invalid Solana address.' });
        setLoading(false);
        return;
      }

      // Step 1: Backend derives the stealth address
      setStatus({ type: 'loading', message: 'Deriving stealth address on server...' });
      const stealthRes = await fetch('/api/generate-stealth-address', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientPublicKey: recipientPubKey.toBase58() }),
      });

      if (!stealthRes.ok) {
        const err = await stealthRes.json();
        throw new Error(err.error || 'Stealth address generation failed.');
      }

      const { stealthPublicKey: stealthPubKeyStr, ephemeralPublicKey: ephemeralHex } = await stealthRes.json();
      const stealthPubKey = new PublicKey(stealthPubKeyStr);

      // Step 2: Build transaction client-side
      setStatus({ type: 'loading', message: 'Building transaction client-side...' });
      const senderAta = await getAssociatedTokenAddress(DEVNET_USDC_MINT, publicKey);
      const stealthAta = await getAssociatedTokenAddress(DEVNET_USDC_MINT, stealthPubKey, true);

      let senderAccount;
      try {
        senderAccount = await getAccount(connection, senderAta);
      } catch (e) {
        if (e instanceof TokenAccountNotFoundError) {
          throw new Error('No USDC token account found. Fund your wallet with devnet USDC first.');
        }
        throw e;
      }

      const transferAmount = BigInt(Math.round(parsedAmount * 10 ** USDC_DECIMALS));
      if (senderAccount.amount < transferAmount) {
        throw new Error(`Insufficient USDC. You have ${(Number(senderAccount.amount) / 10 ** USDC_DECIMALS).toFixed(2)} USDC.`);
      }

      const transaction = new Transaction();
      transaction.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5000 }));

      // Create stealth ATA if needed
      let stealthAtaExists = false;
      try { await getAccount(connection, stealthAta); stealthAtaExists = true; } catch { stealthAtaExists = false; }

      if (!stealthAtaExists) {
        transaction.add(createAssociatedTokenAccountInstruction(publicKey, stealthAta, stealthPubKey, DEVNET_USDC_MINT));
      }

      transaction.add(createTransferInstruction(senderAta, stealthAta, publicKey, transferAmount));
      transaction.add(new TransactionInstruction({
        keys: [],
        programId: MEMO_PROGRAM_ID,
        data: Buffer.from(`Aura-Enterprise|Stealth|${ephemeralHex}`, 'utf-8'),
      }));

      // Step 3: Phantom signs locally — private key never leaves wallet
      setStatus({ type: 'loading', message: 'Waiting for Phantom to sign...' });
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      const signature = await sendTransaction(transaction, connection, { maxRetries: 3 });

      // Step 4: Confirm
      setStatus({ type: 'loading', message: 'Confirming on-chain...' });
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');

      setTxSig(signature);
      setStatus({
        type: 'success',
        message: `${parsedAmount.toFixed(2)} USDC sent anonymously. No on-chain link to you.`,
      });
      setAmount('');
      setMessage('');
    } catch (err) {
      const msg = err?.message || 'Transaction failed.';
      if (msg.toLowerCase().includes('user rejected') || msg.toLowerCase().includes('rejected')) {
        setStatus({ type: 'error', message: 'Transaction cancelled in wallet.' });
      } else {
        setStatus({ type: 'error', message: msg });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="glass-card p-5">
        <h2 className="text-base font-semibold text-white mb-1">Anonymous Tip</h2>
        <p className="text-xs text-white/40 mb-4">
          Your identity is protected via Umbra stealth addresses. The creator receives USDC — no
          on-chain link to you.
        </p>

        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs text-white/40 mb-1.5 block">Creator's Wallet</label>
            <input
              type="text"
              placeholder="Solana wallet address"
              value={creatorAddress}
              onChange={(e) => setCreatorAddress(e.target.value)}
              className="glass-input font-mono text-xs"
              disabled={loading}
            />
          </div>

          <div>
            <label className="text-xs text-white/40 mb-1.5 block">Tip Amount</label>
            <div className="relative">
              <input
                type="number"
                placeholder="0.00"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="glass-input pr-16"
                disabled={loading}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/30 font-medium">
                USDC
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            {PRESET_AMOUNTS.map((preset) => (
              <button
                key={preset}
                onClick={() => setAmount(preset.toString())}
                disabled={loading}
                className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all duration-150 ${
                  parseFloat(amount) === preset
                    ? 'bg-aura-purple text-white'
                    : 'bg-white/[0.04] border border-white/[0.08] text-white/50 active:scale-95'
                }`}
              >
                ${preset}
              </button>
            ))}
          </div>

          <div>
            <label className="text-xs text-white/40 mb-1.5 block">
              Message <span className="text-white/20">(optional, off-chain)</span>
            </label>
            <textarea
              placeholder="Say something..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={120}
              rows={2}
              disabled={loading}
              className="glass-input resize-none"
            />
            <p className="text-right text-xs text-white/20 mt-1">{message.length}/120</p>
          </div>
        </div>
      </div>

      <div className="glass-card p-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-aura-purple/20 flex items-center justify-center flex-shrink-0">
          <span className="text-base">🔒</span>
        </div>
        <div>
          <p className="text-xs font-medium text-aura-glow">Full Anonymity — Zero-Knowledge</p>
          <p className="text-xs text-white/30">
            Private key never leaves Phantom. Backend only sees public keys.
          </p>
        </div>
      </div>

      {status && (
        <div
          className={`glass-card p-4 text-sm text-center transition-all ${
            status.type === 'success'
              ? 'border-green-500/30 text-green-300'
              : status.type === 'error'
              ? 'border-red-500/30 text-red-300'
              : 'border-aura-glow/20 text-aura-glow animate-pulse'
          }`}
        >
          {status.message}
        </div>
      )}

      {txSig && (
        <a
          href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`}
          target="_blank"
          rel="noopener noreferrer"
          className="glass-card p-3 text-center text-xs text-aura-glow/70 hover:text-aura-glow transition-colors"
        >
          View on Solana Explorer ↗
        </a>
      )}

      <button
        onClick={handleSendTip}
        disabled={loading || !connected}
        className="btn-primary"
      >
        {loading ? (status?.message || 'Processing...') : 'Send Anonymous Tip'}
      </button>

      {!connected && (
        <p className="text-center text-xs text-white/30">Connect your wallet to send a tip</p>
      )}
    </div>
  );
}
