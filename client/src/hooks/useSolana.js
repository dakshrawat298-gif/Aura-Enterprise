import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { useState, useCallback } from 'react';

export function useSolana() {
  const { connection } = useConnection();
  const { publicKey, connected, connecting, disconnect } = useWallet();
  const [balance, setBalance] = useState(null);

  const fetchBalance = useCallback(async () => {
    if (!publicKey) return;
    try {
      const lamports = await connection.getBalance(publicKey);
      setBalance((lamports / LAMPORTS_PER_SOL).toFixed(4));
    } catch (err) {
      console.error('[useSolana] fetchBalance error:', err);
    }
  }, [connection, publicKey]);

  const shortenAddress = (address) => {
    if (!address) return '';
    const str = address.toString();
    return `${str.slice(0, 4)}...${str.slice(-4)}`;
  };

  return {
    connection,
    publicKey,
    connected,
    connecting,
    disconnect,
    balance,
    fetchBalance,
    shortenAddress,
  };
}
