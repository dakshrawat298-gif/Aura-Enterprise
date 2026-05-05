import React, { useState } from 'react';
import WalletButton from './WalletButton.jsx';
import EnterpriseTab from './EnterpriseTab.jsx';
import CreatorTab from './CreatorTab.jsx';

const TABS = [
  { id: 'enterprise', label: 'Enterprise', icon: '⚡' },
  { id: 'creator', label: 'Creator', icon: '✦' },
];

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('enterprise');

  return (
    <div className="flex flex-col min-h-screen max-w-md mx-auto px-4 pt-safe">
      {/* Header */}
      <header className="flex items-center justify-between py-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            <span className="text-aura-glow">Aura</span>
            <span className="text-white/90"> Enterprise</span>
          </h1>
          <p className="text-xs text-white/30 mt-0.5">Solana Devnet</p>
        </div>
        <WalletButton />
      </header>

      {/* Hero pill */}
      <div className="glass-card p-4 mb-6 text-center">
        <p className="text-xs text-white/40 uppercase tracking-widest mb-1">Powered by</p>
        <p className="text-sm font-medium text-aura-glow">
          Umbra Stealth Addresses · USDC · Solana
        </p>
      </div>

      {/* Tab switcher */}
      <div className="glass-card p-1 flex mb-6 gap-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
              activeTab === tab.id ? 'tab-active' : 'tab-inactive'
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 pb-10">
        {activeTab === 'enterprise' ? <EnterpriseTab /> : <CreatorTab />}
      </div>
    </div>
  );
}
