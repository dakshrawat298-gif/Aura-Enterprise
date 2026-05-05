import React, { useState } from 'react';
import { useSolana } from '../hooks/useSolana.js';

const EMPTY_RECIPIENT = { address: '', amount: '' };

export default function EnterpriseTab() {
  const { connected } = useSolana();
  const [recipients, setRecipients] = useState([{ ...EMPTY_RECIPIENT }]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  const addRecipient = () => {
    setRecipients((prev) => [...prev, { ...EMPTY_RECIPIENT }]);
  };

  const removeRecipient = (index) => {
    setRecipients((prev) => prev.filter((_, i) => i !== index));
  };

  const updateRecipient = (index, field, value) => {
    setRecipients((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [field]: value } : r))
    );
  };

  const totalAmount = recipients.reduce(
    (sum, r) => sum + (parseFloat(r.amount) || 0),
    0
  );

  const handleDisburse = async () => {
    if (!connected) {
      setStatus({ type: 'error', message: 'Please connect your wallet first.' });
      return;
    }

    const valid = recipients.every((r) => r.address.trim() && parseFloat(r.amount) > 0);
    if (!valid) {
      setStatus({ type: 'error', message: 'All recipients need a valid address and amount.' });
      return;
    }

    setLoading(true);
    setStatus({ type: 'loading', message: 'Preparing stealth payroll batch...' });

    try {
      // Phase 4: Will call POST /api/stealth-transfer for each recipient
      // Simulating for now — Phase 4 will wire in real signing
      await new Promise((res) => setTimeout(res, 2000));
      setStatus({
        type: 'success',
        message: `Payroll dispatched to ${recipients.length} recipient${recipients.length > 1 ? 's' : ''} via stealth addresses.`,
      });
    } catch (err) {
      setStatus({ type: 'error', message: err.message || 'Transaction failed.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="glass-card p-5">
        <h2 className="text-base font-semibold text-white mb-1">Batch Payroll</h2>
        <p className="text-xs text-white/40 mb-4">
          USDC disbursements via stealth addresses. Recipients cannot be linked on-chain.
        </p>

        <div className="flex flex-col gap-3">
          {recipients.map((recipient, index) => (
            <div key={index} className="glass-card p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/40">Recipient {index + 1}</span>
                {recipients.length > 1 && (
                  <button
                    onClick={() => removeRecipient(index)}
                    className="text-white/20 hover:text-red-400 text-xs transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
              <input
                type="text"
                placeholder="Solana wallet address"
                value={recipient.address}
                onChange={(e) => updateRecipient(index, 'address', e.target.value)}
                className="glass-input font-mono text-xs"
              />
              <div className="relative">
                <input
                  type="number"
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  value={recipient.amount}
                  onChange={(e) => updateRecipient(index, 'amount', e.target.value)}
                  className="glass-input pr-16"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/30 font-medium">
                  USDC
                </span>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={addRecipient}
          className="w-full mt-3 py-3 rounded-xl border border-dashed border-white/10 text-white/30 text-sm hover:border-aura-glow/30 hover:text-aura-glow/60 transition-all"
        >
          + Add Recipient
        </button>
      </div>

      {/* Summary */}
      <div className="glass-card p-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-white/40">Total Disbursement</p>
          <p className="text-2xl font-bold text-white mt-0.5">
            {totalAmount.toFixed(2)} <span className="text-aura-glow text-base font-medium">USDC</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-white/40">Recipients</p>
          <p className="text-2xl font-bold text-white mt-0.5">{recipients.length}</p>
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
        onClick={handleDisburse}
        disabled={loading || !connected}
        className="btn-primary"
      >
        {loading ? 'Disbursing...' : 'Disburse Payroll'}
      </button>

      {!connected && (
        <p className="text-center text-xs text-white/30">Connect your wallet to disburse payroll</p>
      )}
    </div>
  );
}
