const express = require('express');
const router = express.Router();

// Dynamically import the TypeScript utility via tsx
let stealthTransfer;

async function getStealthModule() {
  if (!stealthTransfer) {
    stealthTransfer = await import('../backend/utils/stealth_transfer.ts');
  }
  return stealthTransfer;
}

/**
 * POST /api/stealth-transfer
 * Body: { senderSecretKey: number[], recipientPublicKey: string, amount: number }
 * Executes a stealth USDC transfer on Solana devnet.
 */
router.post('/stealth-transfer', async (req, res) => {
  try {
    const { senderSecretKey, recipientPublicKey, amount } = req.body;

    if (!senderSecretKey || !recipientPublicKey || amount === undefined) {
      return res.status(400).json({ error: 'Missing required fields: senderSecretKey, recipientPublicKey, amount' });
    }

    const { Keypair } = await import('@solana/web3.js');
    const { executeStealthUSDCTransfer } = await getStealthModule();

    const senderKeypair = Keypair.fromSecretKey(Uint8Array.from(senderSecretKey));
    const txSignature = await executeStealthUSDCTransfer(senderKeypair, recipientPublicKey, BigInt(amount));

    res.json({ success: true, txSignature });
  } catch (error) {
    console.error('[stealth-transfer error]', error);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

/**
 * POST /api/generate-stealth-address
 * Body: { recipientPublicKey: string }
 * Returns a one-time stealth address for the given recipient.
 */
router.post('/generate-stealth-address', async (req, res) => {
  try {
    const { recipientPublicKey } = req.body;

    if (!recipientPublicKey) {
      return res.status(400).json({ error: 'Missing required field: recipientPublicKey' });
    }

    const { generateStealthAddress } = await getStealthModule();
    const result = generateStealthAddress(recipientPublicKey);

    res.json({
      success: true,
      stealthPublicKey: result.stealthPublicKey.toBase58(),
      ephemeralPublicKey: Buffer.from(result.ephemeralPublicKey).toString('hex'),
    });
  } catch (error) {
    console.error('[generate-stealth-address error]', error);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

module.exports = router;
