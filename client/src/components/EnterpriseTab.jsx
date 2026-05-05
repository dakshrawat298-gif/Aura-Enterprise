import React, { useState, useRef, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';

const EMPTY_RECIPIENT = { address: '', amount: '' };
const USDC_DECIMALS = 6;

// ߔ GOOGLE STUDIO FIX: The Ultimate Ghost-Character Killer
// Yeh function iPhone ke saare hidden/invisible spaces ko destroy kar dega
const sanitizeKey = (key) => {
  if (!key) return '';
  return String(key).replace(/[^a-zA-Z0-9]/g, '');
};

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

function parseCSV(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    throw new Error('CSV file is empty.');
  }

  const firstLine = lines[0].toLowerCase().replace(/\s/g, '');
  const hasHeader =
    firstLine.includes('walletaddress') ||
    firstLine.includes('address') ||
    firstLine.includes('wallet');

  const dataLines = hasHeader ? lines.slice(1) : lines;

  if (dataLines.length === 0) {
    throw new Error('CSV has a header but no data rows.');
  }

  const parsed = [];
  const errors = [];

  dataLines.forEach((line, idx) => {
    const rowNum = hasHeader ? idx + 2 : idx + 1;
    const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));

    if (cols.length < 2) {
      errors.push(`Row ${rowNum}: expected 2 columns (walletAddress, amount), found ${cols.length}.`);
      return;
    }

    const address = sanitizeKey(cols[0]);
    const rawAmount = cols[1].trim();
    const amount = parseFloat(rawAmount);

    if (!address || address.length < 32) {
      errors.push(`Row ${rowNum}: "${address}" does not look like a valid Solana address.`);
      return;
    }

    if (isNaN(amount) || amount <= 0) {
      errors.push(`Row ${rowNum}: amount "${rawAmount}" is not a valid positive number.`);
      return;
    }

    parsed.push({ address, amount: String(amount) });
  });

  if (errors.length > 0 && parsed.length === 0) {
    throw new Error(errors[0]);
  }

  return { rows: parsed, skippedErrors: errors };
}

export default function EnterpriseTab() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();

  const [recipients, setRecipients] = useState([{ ...EMPTY_RECIPIENT }]);
  const [txStatuses, setTxStatuses] = useState([]);
  const [txSigs, setTxSigs] = useState([]);
  const [stealthAddresses, setStealthAddresses] = useState([]);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchDone, setBatchDone] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [globalError, setGlobalError] = useState(null);

  const [isDragging, setIsDragging] = useState(false);
  const [csvFeedback, setCsvFeedback] = useState(null);
  const fileInputRef = useRef(null);

  const processCSVFile = useCallback((file) => {
    setCsvFeedback(null);
    setGlobalError(null);

    if (!file) return;

    if (!file.name.endsWith('.csv') && file.type !== 'text/csv' && file.type !== 'text/plain') {
      setCsvFeedback({ type: 'error', message: 'Please upload a .csv file.' });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const { rows, skippedErrors } = parseCSV(text);

        if (rows.length === 0) {
          setCsvFeedback({ type: 'error', message: 'No valid rows found in CSV.' });
          return;
        }

        setRecipients(rows);
        setTxStatuses([]);
        setTxSigs([]);
        setBatchDone(false);

        const msg =
          skippedErrors.length > 0
            ? `${rows.length} employee${rows.length !== 1 ? 's' : ''} imported · ${skippedErrors.length} row${skippedErrors.length !== 1 ? 's' : ''} skipped`
            : `${rows.length} employee${rows.length !== 1 ? 's' : ''} imported successfully`;

        setCsvFeedback({ type: 'success', message: msg });
      } catch (err) {
        setCsvFeedback({ type: 'error', message: err.message });
      }
    };
    reader.onerror = () => {
      setCsvFeedback({ type: 'error', message: 'Failed to read file.' });
    };
    reader.readAsText(file);
  }, []);

  const handleFileInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) processCSVFile(file);
    e.target.value = '';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processCSVFile(file);
  };

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

    const valid = recipients.every((r) => sanitizeKey(r.address).length > 30 && parseFloat(r.amount) > 0);
    if (!valid) {
      setGlobalError('All employees need a valid address and USDC amount.');
      return;
    }

    setBatchRunning(true);
    setBatchDone(false);
    setGlobalError(null);
    setCsvFeedback(null);
    setCurrentIndex(-1);

    const initialStatuses = new Array(recipients.length).fill(TX_STATUS.IDLE);
    setTxStatuses(initialStatuses);
    setTxSigs(new Array(recipients.length).fill(null));
    setStealthAddresses(new Array(recipients.length).fill(null));

    try {
      const { PublicKey, Transaction, TransactionInstruction, ComputeBudgetProgram } = await import('@solana/web3.js');
      const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createTransferInstruction, getAccount } = await import('@solana/spl-token');

      // ߔ EXTREME SANITIZATION FOR MINTS
      const mintStr = sanitizeKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
      let DEVNET_USDC_MINT;
      try {
        console.log(`[DEBUG] DEVNET_USDC_MINT input: "${mintStr}", length: ${mintStr?.length}, type: ${typeof mintStr}`);
        DEVNET_USDC_MINT = new PublicKey(mintStr);
      } catch (err) {
        setGlobalError(`Error: DEVNET_USDC_MINT address is invalid. Input: "${mintStr}"`);
        setBatchRunning(false);
        setBatchDone(true);
        return;
      }

      const memoStr = sanitizeKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
      let MEMO_PROGRAM_ID;
      try {
        console.log(`[DEBUG] MEMO_PROGRAM_ID input: "${memoStr}", length: ${memoStr?.length}, type: ${typeof memoStr}`);
        MEMO_PROGRAM_ID = new PublicKey(memoStr);
      } catch (err) {
        setGlobalError(`Error: MEMO_PROGRAM_ID address is invalid. Input: "${memoStr}"`);
        setBatchRunning(false);
        setBatchDone(true);
        return;
      }

      // PHASE 1: PRE-FETCH ALL STEALTH ADDRESSES
      const stealthDataArray = new Array(recipients.length).fill(null);

      for (let i = 0; i < recipients.length; i++) {
        setEmployeeStatus(i, TX_STATUS.STEALTH);

        // ߔ EXTREME SANITIZATION FOR EMPLOYEE ADDRESS
        const employeePubKeyStr = sanitizeKey(recipients[i].address);

        try {
          console.log(`[DEBUG] Employee ${i + 1} Address input: "${employeePubKeyStr}", length: ${employeePubKeyStr?.length}, type: ${typeof employeePubKeyStr}`);
          new PublicKey(employeePubKeyStr);
        } catch (err) {
          console.error(`Invalid Public Key for Employee ${i}:`, err);
          setEmployeeStatus(i, TX_STATUS.FAILED);
          setGlobalError(`Error: Employee ${i + 1} address is invalid. Input: "${employeePubKeyStr}"`);
          setBatchRunning(false);
          setBatchDone(true);
          return;
        }

        try {
          const stealthRes = await fetch('/api/generate-stealth-address', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recipientPublicKey: employeePubKeyStr }),
          });

          if (!stealthRes.ok) {
            const errText = await stealthRes.text();
            throw new Error(`API Error: ${stealthRes.status} - ${errText}`);
          }

          const data = await stealthRes.json();
          if (!data.stealthPublicKey) throw new Error('Missing stealthPublicKey');

          stealthDataArray[i] = data;

          setStealthAddresses((prev) => {
            const next = [...prev];
            next[i] = data.stealthPublicKey;
            return next;
          });

        } catch (err) {
          console.error(`Stealth Fetch Failed for Employee ${i}:`, err);
          setEmployeeStatus(i, TX_STATUS.FAILED);
          setGlobalError(`API Error Employee ${i + 1}: ${err.message}`);
          setBatchRunning(false);
          setBatchDone(true);
          return; 
        }
      }

      // PHASE 2: TRANSACTION EXECUTION LOOP
      for (let i = 0; i < recipients.length; i++) {
        if (!stealthDataArray[i]) continue; 

        setCurrentIndex(i);
        const { amount } = recipients[i];
        const parsedAmount = parseFloat(amount);

        // ߔ EXTREME SANITIZATION FOR GENERATED STEALTH ADDRESS
        const stealthPubKeyStr = sanitizeKey(stealthDataArray[i].stealthPublicKey);
        const ephemeralHex = stealthDataArray[i].ephemeralPublicKey;

        let stealthPubKey;
        try {
          console.log(`[DEBUG] Stealth Address Employee ${i + 1} input: "${stealthPubKeyStr}", length: ${stealthPubKeyStr?.length}, type: ${typeof stealthPubKeyStr}`);
          stealthPubKey = new PublicKey(stealthPubKeyStr);
        } catch (err) {
          console.error(`Invalid Stealth Public Key for Employee ${i}:`, err);
          setEmployeeStatus(i, TX_STATUS.FAILED);
          setGlobalError(`Error: Generated Stealth Address for Employee ${i + 1} is invalid. Input: "${stealthPubKeyStr}"`);
          setBatchRunning(false);
          setBatchDone(true);
          return;
        }

        try {
          setEmployeeStatus(i, TX_STATUS.BUILDING);

          const senderAta = await getAssociatedTokenAddress(DEVNET_USDC_MINT, publicKey);
          const stealthAta = await getAssociatedTokenAddress(DEVNET_USDC_MINT, stealthPubKey, true);

          let senderAccount;
          try {
            senderAccount = await getAccount(connection, senderAta);
          } catch (e) {
            throw new Error('No USDC token account found. Fund wallet.');
          }

          const transferAmount = BigInt(Math.round(parsedAmount * 10 ** USDC_DECIMALS));
          if (senderAccount.amount < transferAmount) {
            throw new Error(`Insufficient USDC. Needed ${parsedAmount}`);
          }

          const transaction = new Transaction();
          transaction.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10000 })); 

          let stealthAtaExists = false;
          try {
            await getAccount(connection, stealthAta);
            stealthAtaExists = true;
          } catch {
            stealthAtaExists = false;
          }

          if (!stealthAtaExists) {
            transaction.add(
              createAssociatedTokenAccountInstruction(publicKey, stealthAta, stealthPubKey, DEVNET_USDC_MINT)
            );
          }

          transaction.add(createTransferInstruction(senderAta, stealthAta, publicKey, transferAmount));
          transaction.add(
            new TransactionInstruction({
              keys: [],
              programId: MEMO_PROGRAM_ID,
              data: Buffer.from(`Aura-Enterprise|Payroll|${ephemeralHex}`, 'utf-8'),
            })
          );

          setEmployeeStatus(i, TX_STATUS.SIGNING);

          const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
          transaction.recentBlockhash = blockhash;
          transaction.feePayer = publicKey;

          const signature = await sendTransaction(transaction, connection, { 
            maxRetries: 3,
            skipPreflight: false 
          });

          setEmployeeStatus(i, TX_STATUS.CONFIRMING);
          await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');

          setEmployeeSig(i, signature);
          setEmployeeStatus(i, TX_STATUS.SUCCESS);

        } catch (err) {
          console.error(`Transaction Failed for Employee ${i}:`, err);
          const msg = err?.message || '';

          if (msg.toLowerCase().includes('user rejected') || msg.toLowerCase().includes('rejected')) {
            setEmployeeStatus(i, TX_STATUS.FAILED);
            for (let j = i + 1; j < recipients.length; j++) {
              setEmployeeStatus(j, TX_STATUS.IDLE);
            }
            setGlobalError('Batch cancelled — transaction rejected in Phantom.');
            setBatchRunning(false);
            setCurrentIndex(-1);
            setBatchDone(true);
            return;
          }

          setEmployeeStatus(i, TX_STATUS.FAILED);
          setGlobalError(`Employee ${i + 1} Failed: ${msg}`);
        }
      }

    } catch (criticalErr) {
      console.error("Critical Setup Error:", criticalErr);
      setGlobalError(`Critical Error: ${criticalErr.message}`);
    } finally {
      setBatchRunning(false);
      setCurrentIndex(-1);
      setBatchDone(true);
    }
  };

  const handleExportReport = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const header = [
      'Employee Public Key',
      'Derived Stealth Address',
      'Amount Paid (USDC)',
      'Status',
      'Transaction Signature',
    ].join(',');

    const rows = recipients.map((r, i) => {
      const status = txStatuses[i] === TX_STATUS.SUCCESS ? 'Success' : 'Failed';
      const stealth = stealthAddresses[i] || '';
      const sig = txSigs[i] || '';
      const amount = parseFloat(r.amount || 0).toFixed(6);
      return [r.address, stealth, amount, status, sig]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',');
    });

    const csv = [header, ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `aura-payroll-report-${timestamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    setTxStatuses([]);
    setTxSigs([]);
    setStealthAddresses([]);
    setBatchDone(false);
    setGlobalError(null);
    setCsvFeedback(null);
    setCurrentIndex(-1);
  };

  const isRunning = batchRunning;
  const showProgress = txStatuses.length > 0;

  return (
    <div className="flex flex-col gap-4">

      {/* ── CSV Import Zone ─────────────────────────────────────────────── */}
      {!isRunning && !batchDone && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`glass-card p-4 flex flex-col gap-3 transition-all duration-200 ${
            isDragging
              ? 'border-aura-glow/60 bg-aura-glow/5'
              : 'border-white/[0.08]'
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-white">Import Payroll CSV</p>
              <p className="text-xs text-white/30 mt-0.5">
                Columns: <span className="font-mono text-white/40">walletAddress, amount</span>
              </p>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-aura-purple/20 border border-aura-glow/20 text-aura-glow text-xs font-medium hover:bg-aura-purple/30 active:scale-95 transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Upload CSV
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              className="hidden"
              onChange={handleFileInputChange}
            />
          </div>

          <div
            className={`flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed transition-all duration-200 ${
              isDragging
                ? 'border-aura-glow/50 bg-aura-glow/5'
                : 'border-white/10'
            }`}
          >
            <svg
              className={`w-4 h-4 transition-colors ${isDragging ? 'text-aura-glow' : 'text-white/20'}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
              />
            </svg>
            <span className={`text-xs transition-colors ${isDragging ? 'text-aura-glow' : 'text-white/20'}`}>
              {isDragging ? 'Drop to import' : 'or drag & drop your .csv here'}
            </span>
          </div>

          {csvFeedback && (
            <div
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium ${
                csvFeedback.type === 'success'
                  ? 'bg-green-500/10 border border-green-500/20 text-green-300'
                  : 'bg-red-500/10 border border-red-500/20 text-red-300'
              }`}
            >
              {csvFeedback.type === 'success' ? (
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              )}
              {csvFeedback.message}
            </div>
          )}
        </div>
      )}

      {/* ── Employee list ───────────────────────────────────────────────── */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-semibold text-white">Batch Payroll</h2>
          {recipients.length > 0 && !isRunning && !batchDone && csvFeedback?.type === 'success' && (
            <button
              onClick={() => {
                setRecipients([{ ...EMPTY_RECIPIENT }]);
                setCsvFeedback(null);
              }}
              className="text-xs text-white/20 hover:text-white/50 transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
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
                      className={`w-2 h-2 rounded-full flex-shrink-0 transition-all ${STATUS_DOT[txStatus]}`}
                    />
                    <span className="text-xs text-white/40">Employee {index + 1}</span>
                    {showProgress && txStatus !== TX_STATUS.IDLE && (
                      <span className={`text-xs font-medium ${STATUS_COLOR[txStatus]}`}>
                        {STATUS_LABEL[txStatus]}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
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
                    {recipients.length > 1 && !isRunning && !batchDone && (
                      <button
                        onClick={() => removeRecipient(index)}
                        className="text-white/20 hover:text-red-400 text-xs transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </div>
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

      {/* ── Summary bar ────────────────────────────────────────────────── */}
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

      {/* ── Live batch progress panel ───────────────────────────────────── */}
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
                    <span className="text-xs text-white/40">
                      {parseFloat(r.amount || 0).toFixed(2)} USDC
                    </span>
                    <span className={`text-xs font-medium w-24 text-right ${STATUS_COLOR[txStatus]}`}>
                      {txStatus !== TX_STATUS.IDLE ? STATUS_LABEL[txStatus] : '—'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

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

      {/* ── Global error ────────────────────────────────────────────────── */}
      {globalError && (
        <div className="glass-card p-4 text-sm text-center border-red-500/30 text-red-300">
          {globalError}
        </div>
      )}

      {/* ── Action buttons ──────────────────────────────────────────────── */}
      {!batchDone ? (
        <button
          onClick={handleDisburse}
          disabled={isRunning || !connected}
          className="btn-primary"
        >
          {isRunning
            ? `Running Payroll...`
            : 'Disburse Payroll'}
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          <button
            onClick={handleExportReport}
            className="w-full py-4 rounded-2xl font-semibold text-sm tracking-wide transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2.5
              bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 text-emerald-300
              hover:from-emerald-500/30 hover:to-teal-500/30 hover:border-emerald-400/50 hover:text-emerald-200"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            Download Payroll Report (CSV)
          </button>
          <button onClick={handleReset} className="btn-secondary">
            Start New Payroll Run
          </button>
        </div>
      )}

      {!connected && (
        <p className="text-center text-xs text-white/30">
          Connect your wallet to disburse payroll
        </p>
      )}
    </div>
  );
}