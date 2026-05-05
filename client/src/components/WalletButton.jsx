import React from 'react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useSolana } from '../hooks/useSolana.js';

export default function WalletButton() {
  const { connected, publicKey, disconnect, connecting, shortenAddress } = useSolana();
  const { setVisible } = useWalletModal();

  if (connecting) {
    return (
      <button className="btn-secondary py-2 px-5 w-auto text-sm opacity-60" disabled>
        Connecting...
      </button>
    );
  }

  if (connected && publicKey) {
    return (
      <button
        onClick={disconnect}
        className="flex items-center gap-2 bg-white/[0.06] border border-white/[0.1] rounded-xl px-4 py-2 text-sm text-white/80 active:scale-95 transition-all"
      >
        <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        {shortenAddress(publicKey)}
      </button>
    );
  }

  return (
    <button
      onClick={() => setVisible(true)}
      className="flex items-center gap-2 bg-gradient-to-r from-aura-violet to-aura-purple rounded-xl px-4 py-2 text-sm font-semibold text-white active:scale-95 transition-all"
      style={{ boxShadow: '0 0 16px rgba(124, 58, 237, 0.4)' }}
    >
      Connect Wallet
    </button>
  );
}
