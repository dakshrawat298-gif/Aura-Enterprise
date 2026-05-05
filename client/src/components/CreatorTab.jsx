import React, { useState } from 'react';
import { useSolana } from '../hooks/useSolana.js';

const PRESET_AMOUNTS = [1, 5, 10, 25];

export default function CreatorTab() {
  const { connected } = useSolana();
  const [creatorAddress, setCreatorAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSendTip = async () => {
    if (!connected) {
      setStatus({ type: 'error', message: 'Please connect your wallet first.' });
      return;
    }

    if (!creatorAddress.trim() || !parseFloat(amount)) {
      setStatus({ type: 'error', message: 'Enter a valid creator address and tip amount.' });
      return;
    }

    setLoading(true);
    setStatus({ type: 'loading', message: 'Generating stealth address for creator...' });

    try {
      // Phase 4: Will call POST /api/stealth-transfer with stealth logic
      // Simulating for now — Phase 4 wires in real signing
      await new Promise((res) => setTimeout(res, 2000));
      setStatus({
        type: 'success',
        message: `${parseFloat(amount).toFixed(2)} USDC sent anonymously. Your identity is protected.`,
      });
      setAmount('');
      setMessage('');
    } catch (err) {
      setStatus({ type: 'error', message: err.message || 'Transaction failed.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="glass-card p-5">
        <h2 className="text-base font-semibold text-white mb-1">Anonymous Tip</h2>
        <p className="text-xs text-white/40 mb-4">
          Your identity is protected via Umbra stealth addresses. The creator receives USDC — no on-chain link to you.
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
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/30 font-medium">
                USDC
              </span>
            </div>
          </div>

          {/* Preset amounts */}
          <div className="flex gap-2">
            {PRESET_AMOUNTS.map((preset) => (
              <button
                key={preset}
                onClick={() => setAmount(preset.toString())}
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
              Message <span className="text-white/20">(optional)</span>
            </label>
            <textarea
              placeholder="Say something... (stays off-chain)"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={120}
              rows={2}
              className="glass-input resize-none"
            />
            <p className="text-right text-xs text-white/20 mt-1">{message.length}/120</p>
          </div>
        </div>
      </div>

      {/* Privacy badge */}
      <div className="glass-card p-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-aura-purple/20 flex items-center justify-center flex-shrink-0">
          <span className="text-base">🔒</span>
        </div>
        <div>
          <p className="text-xs font-medium text-aura-glow">Full Anonymity</p>
          <p className="text-xs text-white/30">
            Stealth address generated fresh per tip. No wallet link on-chain.
          </p>
        </div>
      </div>

      {/* Status */}
      {status && (
        <div
          className={`glass-card p-4 text-sm text-center transition-all ${
            status.type === 'success'
              ? 'border-green-500/30 text-green-300'
              : status.type === 'error'
              ? 'border-red-500/30 text-red-300'
              : 'border-aura-glow/20 text-aura-glow'
          }`}
        >
          {status.message}
        </div>
      )}

      <button
        onClick={handleSendTip}
        disabled={loading || !connected}
        className="btn-primary"
      >
        {loading ? 'Sending...' : 'Send Tip'}
      </button>

      {!connected && (
        <p className="text-center text-xs text-white/30">Connect your wallet to send a tip</p>
      )}
    </div>
  );
}
