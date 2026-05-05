import React, { useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';

const EMPTY_RECIPIENT = { address: '', amount: '' };
const USDC_DECIMALS = 6;

const TX_STATUS = {
  IDLE: 'idle',
  STEALTH: 'stealth',
  BUILDING: 'building',
  SIGNING: 'signing',
  CONFIRMING: 'confirming',
  SUCCESS: 'success',
  FAILED: 'failed',
};

const STATUS_LABEL = {
  [TX_STATUS.STEALTH]: 'Deriving stealth address...',
  [TX_STATUS.BUILDING]: 'Building transaction...',
  [TX_STATUS.SIGNING]: 'Waiting for signature...',
  [TX_STATUS.CONFIRMING]: 'Confirming on-chain...',
  [TX_STATUS.SUCCESS]: 'Paid',
  [TX_STATUS.FAILED]: 'Failed',
};

const STATUS_COLOR = {
  [TX_STATUS.IDLE]: 'text-white/20',
  [TX_STATUS.STEALTH]: 'text-aura-glow',
  [TX_STATUS.BUILDING]: 'text-aura-glow',
  [TX_STATUS.SIGNING]: 'text-yellow-400',
  [TX_STATUS.CONFIRMING]: 'text-blue-400',
  [TX_STATUS.SUCCESS]: 'text-green-400',
  [TX_STATUS.FAILED]: 'text-red-400',
};

const STATUS_DOT = {
  [TX_STATUS.IDLE]: 'bg-white/10',
  [TX_STATUS.STEALTH]: 'bg-aura-glow animate-pulse',
  [TX_STATUS.BUILDING]: 'bg-aura-glow animate-pulse',
  [TX_STATUS.SIGNING]: 'bg-yellow-400 animate-pulse',
  [TX_STATUS.CONFIRMING]: 'bg-blue-400 animate-pulse',
  [TX_STATUS.SUCCESS]: 'bg-green-400',
  [TX_STATUS.FAILED]: 'bg-red-400',
};

export default function EnterpriseTab() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();

  const [recipients, setRecipients] = useState([{ ...EMPTY_RECIPIENT }]);
  const [txStatuses, setTxStatuses] = useState([]);
  const [txSigs, setTxSigs] = useState([]);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchDone, setBatchDone] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [globalError, setGlobalError] = useState(null);

  const addRecipient = () => {
    if (batchRunning) return;
    setRecipients((prev) => [...prev, { ...EMPTY_RECIPIENT }]);
  };

  const removeRecipient = (index) => {
    if (batchRunning) return;
    setRecipients((prev) => prev.filter((_, i) => i !== index));
  };

  const updateRecipient = (index, field, value) => {
    if (batchRunning) return;
    setRecipients((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [field]: value } : r))
    );
  };

  const setEmployeeStatus = (index, status) => {
    setTxStatuses((prev) => {
      const next = [...prev];
      next[index] = status;
      return next;
    });
  };

  const setEmployeeSig = (index, sig) => {
    setTxSigs((prev) => {
      const next = [...prev];
      next[index] = sig;
      return next;
    });
  };

  const totalAmount = recipients.reduce(
    (sum, r) => sum + (parseFloat(r.amount) || 0),
    0
  );

  const successCount = txStatuses.filter((s) => s === TX_STATUS.SUCCESS).length;
  const failCount = txStatuses.filter((s) => s === TX_STATUS.FAILED).length;

  const handleDisburse = async () => {
    if (!connected || !publicKey) {
      setGlobalError('Please connect your wallet first.');
      return;
    }

    const valid = recipients.every((r) => r.address.trim() && parseFloat(r.amount) > 0);
    if (!valid) {
      setGlobalError('All employees need a valid address and USDC amount.');
      return;
    }

    try {
      recipients.forEach((r) => {
        new (require('@solana/web3.js')?.PublicKey || Object)(r.address.trim());
      });
    } catch { /* validated below per-employee */ }

    setBatchRunning(true);
    setBatchDone(false);
    setGlobalError(null);
    setCurrentIndex(-1);
    setTxSigs(new Array(recipients.length).fill(null));
    setTxStatuses(new Array(recipients.length).fill(TX_STATUS.IDLE));

    const {
      PublicKey,
      Transaction,
      TransactionInstruction,
      ComputeBudgetProgram,
    } = await import('@solana/web3.js');

    const {
      getAssociatedTokenAddress,
      createAssociatedTokenAccountInstruction,
      createTransferInstruction,
      getAccount,
      TokenAccountNotFoundError,
    } = await import('@solana/spl-token');

    const DEVNET_USDC_MINT = new PublicKey('4zMMC9srt5Ri5X14vA1jJZRu2KptW37gZYGQEiAT');
    const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

    // Process each employee sequentially
    for (let i = 0; i < recipients.length; i++) {
      const { address, amount } = recipients[i];
      setCurrentIndex(i);

      let employeePubKey;
      try {
        employeePubKey = new PublicKey(address.trim());
      } catch {
        setEmployeeStatus(i, TX_STATUS.FAILED);
        continue;
      }

      const parsedAmount = parseFloat(amount);
      if (!parsedAmount || parsedAmount <= 0) {
        setEmployeeStatus(i, TX_STATUS.FAILED);
        continue;
      }

      try {
        // ── Step 1: Derive stealth address on backend ──────────────────────
        setEmployeeStatus(i, TX_STATUS.STEALTH);
        const stealthRes = await fetch('/api/generate-stealth-address', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recipientPublicKey: employeePubKey.toBase58() }),
        });

        if (!stealthRes.ok) {
          const err = await stealthRes.json();
          throw new Error(err.error || 'Stealth address generation failed.');
        }

        const { stealthPublicKey: stealthPubKeyStr, ephemeralPublicKey: ephemeralHex } =
          await stealthRes.json();

        const stealthPubKey = new PublicKey(stealthPubKeyStr);

        // ── Step 2: Build transaction client-side ──────────────────────────
        setEmployeeStatus(i, TX_STATUS.BUILDING);

        const senderAta = await getAssociatedTokenAddress(DEVNET_USDC_MINT, publicKey);
        const stealthAta = await getAssociatedTokenAddress(DEVNET_USDC_MINT, stealthPubKey, true);

        let senderAccount;
        try {
          senderAccount = await getAccount(connection, senderAta);
        } catch (e) {
          if (e instanceof TokenAccountNotFoundError) {
            throw new Error('No USDC token account found. Fund your wallet with devnet USDC.');
          }
          throw e;
        }

        const transferAmount = BigInt(Math.round(parsedAmount * 10 ** USDC_DECIMALS));
        if (senderAccount.amount < transferAmount) {
          throw new Error(
            `Insufficient USDC for employee ${i + 1}. Balance: ${(
              Number(senderAccount.amount) / 10 ** USDC_DECIMALS
            ).toFixed(2)} USDC.`
          );
        }

        const transaction = new Transaction();
        transaction.add(
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5000 })
        );

        let stealthAtaExists = false;
        try {
          await getAccount(connection, stealthAta);
          stealthAtaExists = true;
        } catch {
          stealthAtaExists = false;
        }

        if (!stealthAtaExists) {
          transaction.add(
            createAssociatedTokenAccountInstruction(
              publicKey,
              stealthAta,
              stealthPubKey,
              DEVNET_USDC_MINT
            )
          );
        }

        transaction.add(
          createTransferInstruction(senderAta, stealthAta, publicKey, transferAmount)
        );

        transaction.add(
          new TransactionInstruction({
            keys: [],
            programId: MEMO_PROGRAM_ID,
            data: Buffer.from(`Aura-Enterprise|Payroll|${ephemeralHex}`, 'utf-8'),
          })
        );

        // ── Step 3: CEO signs this specific employee's transaction ─────────
        setEmployeeStatus(i, TX_STATUS.SIGNING);

        const { blockhash, lastValidBlockHeight } =
          await connection.getLatestBlockhash('confirmed');
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = publicKey;

        const signature = await sendTransaction(transaction, connection, {
          maxRetries: 3,
        });

        // ── Step 4: Wait for confirmation before next employee ─────────────
        setEmployeeStatus(i, TX_STATUS.CONFIRMING);

        await connection.confirmTransaction(
          { signature, blockhash, lastValidBlockHeight },
          'confirmed'
        );

        setEmployeeSig(i, signature);
        setEmployeeStatus(i, TX_STATUS.SUCCESS);
      } catch (err) {
        const msg = err?.message || '';
        if (msg.toLowerCase().includes('user rejected') || msg.toLowerCase().includes('rejected')) {
          // User cancelled in wallet — stop the whole batch
          setEmployeeStatus(i, TX_STATUS.FAILED);
          for (let j = i + 1; j < recipients.length; j++) {
            setEmployeeStatus(j, TX_STATUS.IDLE);
          }
          setGlobalError('Batch cancelled — transaction rejected in wallet.');
          setBatchRunning(false);
          setCurrentIndex(-1);
          setBatchDone(true);
          return;
        }
        setEmployeeStatus(i, TX_STATUS.FAILED);
      }
    }

    setBatchRunning(false);
    setCurrentIndex(-1);
    setBatchDone(true);
  };

  const handleReset = () => {
    setTxStatuses([]);
    setTxSigs([]);
    setBatchDone(false);
    setGlobalError(null);
    setCurrentIndex(-1);
  };

  const isRunning = batchRunning;
  const showProgress = txStatuses.length > 0;

  return (
    <div className="flex flex-col gap-4">

      {/* Employee list */}
      <div className="glass-card p-5">
        <h2 className="text-base font-semibold text-white mb-1">Batch Payroll</h2>
        <p className="text-xs text-white/40 mb-4">
          Each employee receives USDC to a unique stealth address. Signed sequentially — one
          Phantom confirmation per employee.
        </p>

        <div className="flex flex-col gap-3">
          {recipients.map((recipient, index) => {
            const txStatus = txStatuses[index] || TX_STATUS.IDLE;
            const sig = txSigs[index];
            const isActive = index === currentIndex;

            return (
              <div
                key={index}
                className={`glass-card p-3 flex flex-col gap-2 transition-all duration-300 ${
                  isActive ? 'border-aura-glow/40' : ''
                } ${txStatus === TX_STATUS.SUCCESS ? 'border-green-500/20' : ''} ${
                  txStatus === TX_STATUS.FAILED ? 'border-red-500/20' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 transition-all ${
                        STATUS_DOT[txStatus]
                      }`}
                    />
                    <span className="text-xs text-white/40">Employee {index + 1}</span>
                    {showProgress && (
                      <span className={`text-xs font-medium ${STATUS_COLOR[txStatus]}`}>
                        {txStatus !== TX_STATUS.IDLE ? STATUS_LABEL[txStatus] : ''}
                      </span>
                    )}
                  </div>
                  {recipients.length > 1 && !isRunning && !batchDone && (
                    <button
                      onClick={() => removeRecipient(index)}
                      className="text-white/20 hover:text-red-400 text-xs transition-colors"
                    >
                      Remove
                    </button>
                  )}
                  {sig && (
                    <a
                      href={`https://explorer.solana.com/tx/${sig}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-aura-glow/60 hover:text-aura-glow transition-colors"
                    >
                      View ↗
                    </a>
                  )}
                </div>

                <input
                  type="text"
                  placeholder="Solana wallet address"
                  value={recipient.address}
                  onChange={(e) => updateRecipient(index, 'address', e.target.value)}
                  disabled={isRunning || batchDone}
                  className="glass-input font-mono text-xs disabled:opacity-50"
                />
                <div className="relative">
                  <input
                    type="number"
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    value={recipient.amount}
                    onChange={(e) => updateRecipient(index, 'amount', e.target.value)}
                    disabled={isRunning || batchDone}
                    className="glass-input pr-16 disabled:opacity-50"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/30 font-medium">
                    USDC
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {!isRunning && !batchDone && (
          <button
            onClick={addRecipient}
            className="w-full mt-3 py-3 rounded-xl border border-dashed border-white/10 text-white/30 text-sm hover:border-aura-glow/30 hover:text-aura-glow/60 transition-all"
          >
            + Add Employee
          </button>
        )}
      </div>

      {/* Summary bar */}
      <div className="glass-card p-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-white/40">Total Disbursement</p>
          <p className="text-2xl font-bold text-white mt-0.5">
            {totalAmount.toFixed(2)}{' '}
            <span className="text-aura-glow text-base font-medium">USDC</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-white/40">Employees</p>
          <p className="text-2xl font-bold text-white mt-0.5">{recipients.length}</p>
        </div>
      </div>

      {/* Live batch progress panel */}
      {showProgress && (
        <div className="glass-card p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-white/60 uppercase tracking-widest">
              Payroll Progress
            </p>
            {batchDone && (
              <span className="text-xs font-medium text-white/40">
                {successCount}/{recipients.length} sent
              </span>
            )}
          </div>

          {/* Progress bar */}
          <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-aura-violet to-aura-purple transition-all duration-500"
              style={{
                width: `${
                  recipients.length > 0
                    ? (txStatuses.filter(
                        (s) => s === TX_STATUS.SUCCESS || s === TX_STATUS.FAILED
                      ).length /
                        recipients.length) *
                      100
                    : 0
                }%`,
              }}
            />
          </div>

          {/* Per-employee status rows */}
          <div className="flex flex-col gap-1.5">
            {recipients.map((r, i) => {
              const txStatus = txStatuses[i] || TX_STATUS.IDLE;
              const isActive = i === currentIndex;
              return (
                <div
                  key={i}
                  className={`flex items-center justify-between py-1.5 px-2 rounded-lg transition-all duration-200 ${
                    isActive ? 'bg-aura-glow/5' : ''
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[txStatus]}`} />
                    <span className="text-xs text-white/50 truncate font-mono">
                      {r.address
                        ? `${r.address.slice(0, 6)}...${r.address.slice(-4)}`
                        : `Employee ${i + 1}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-white/40">{parseFloat(r.amount || 0).toFixed(2)} USDC</span>
                    <span className={`text-xs font-medium w-24 text-right ${STATUS_COLOR[txStatus]}`}>
                      {isActive && isRunning && txStatus !== TX_STATUS.IDLE
                        ? STATUS_LABEL[txStatus]
                        : txStatus !== TX_STATUS.IDLE
                        ? STATUS_LABEL[txStatus]
                        : '—'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Final summary */}
          {batchDone && (
            <div
              className={`mt-1 p-3 rounded-xl text-sm text-center font-medium ${
                failCount === 0
                  ? 'bg-green-500/10 border border-green-500/20 text-green-300'
                  : successCount === 0
                  ? 'bg-red-500/10 border border-red-500/20 text-red-300'
                  : 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-300'
              }`}
            >
              {failCount === 0
                ? `All ${successCount} payroll transaction${successCount !== 1 ? 's' : ''} confirmed.`
                : `${successCount} paid · ${failCount} failed`}
            </div>
          )}
        </div>
      )}

      {/* Global error */}
      {globalError && (
        <div className="glass-card p-4 text-sm text-center border-red-500/30 text-red-300">
          {globalError}
        </div>
      )}

      {/* Action buttons */}
      {!batchDone ? (
        <button
          onClick={handleDisburse}
          disabled={isRunning || !connected}
          className="btn-primary"
        >
          {isRunning
            ? `Paying Employee ${currentIndex + 1} of ${recipients.length}...`
            : 'Disburse Payroll'}
        </button>
      ) : (
        <button onClick={handleReset} className="btn-secondary">
          Start New Payroll Run
        </button>
      )}

      {!connected && (
        <p className="text-center text-xs text-white/30">
          Connect your wallet to disburse payroll
        </p>
      )}
    </div>
  );
}
