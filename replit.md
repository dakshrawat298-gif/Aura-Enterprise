# Aura Enterprise

Mobile-first, confidential payroll and tipping application on Solana (Devnet).

## Architecture

**Monorepo layout:**
- `/server.js` — Express API server (port 3001)
- `/routes/stealth.js` — API routes: `POST /api/stealth-transfer`, `POST /api/generate-stealth-address`
- `/backend/utils/stealth_transfer.ts` — TypeScript stealth cryptography logic (runs via `tsx`)
- `/client/` — Vite + React frontend (port 5000, served as webview)

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js + Express |
| TypeScript runtime | `tsx` (for `.ts` files in Node) |
| Frontend | React 18 + Vite |
| Styling | Tailwind CSS (glassmorphism design system) |
| Solana | `@solana/web3.js`, `@solana/wallet-adapter-react` |
| Wallets | Phantom, Solflare |
| Stealth crypto | `@noble/curves` (ed25519), `@noble/hashes` (sha256) |
| Token | USDC on Devnet (`4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`) |

## Workflows

- **API Server** — `node server.js` → port 3001
- **Start application** — `cd client && npm run dev` → port 5000 (webview)

## Features

### Enterprise Tab
Batch USDC payroll disbursement. Add multiple recipients (address + amount), then disburse all via stealth addresses in one flow.

### Creator Tab
Anonymous USDC tipping to creators via Umbra-style stealth addresses. Preset quick-amounts ($1/$5/$10/$25), optional off-chain message.

## Stealth Address Logic

1. Backend receives `recipientPublicKey`
2. Generates ephemeral keypair + shared secret via ECDH on ed25519
3. Derives one-time stealth public key = `recipientPubKey + H(sharedSecret) * G`
4. Creates USDC token account at stealth address
5. Transfers USDC to stealth ATA
6. Embeds ephemeral public key in on-chain memo for recipient scanning

## Build Phases

- **Phase 1** ✅ Vite/React frontend + Express server + Tailwind
- **Phase 2** ✅ Solana Wallet Adapter (Phantom + Solflare)
- **Phase 3** ✅ Dashboard UI with Enterprise/Creator tab toggle
- **Phase 4** ✅ Stealth transfer backend routes (awaiting real signing integration)

## Environment Variables

| Variable | Description |
|---|---|
| `PORT` | Express server port (default: 3001) |
| `SOLANA_RPC_URL` | Solana RPC endpoint (default: devnet) |
| `NODE_ENV` | Environment (development/production) |
