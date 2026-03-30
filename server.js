require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN; // Set your bot token in a .env file

// Mock Database (Replace with MongoDB/PostgreSQL in production)
const usersDB = {};

// Helper: Validate Telegram WebApp initData
function validateTelegramWebAppData(telegramInitData) {
  const initData = new URLSearchParams(telegramInitData);
  const hash = initData.get('hash');
  initData.delete('hash');
  
  const dataToCheck = [...initData.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, val]) => `${key}=${val}`)
    .join('\n');
    
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataToCheck).digest('hex');
  
  if (calculatedHash === hash) {
    return JSON.parse(initData.get('user'));
  }
  return null;
}

// Ensure user exists in DB
function getOrCreateUser(tgUser) {
  if (!usersDB[tgUser.id]) {
    usersDB[tgUser.id] = { id: tgUser.id, name: tgUser.first_name, sparks: 0, gifts: ["🌹", "🧸", "🎁"] };
  }
  return usersDB[tgUser.id];
}

// Endpoint: Get User Profile
app.post('/api/user', (req, res) => {
  const user = validateTelegramWebAppData(req.body.initData);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  
  res.json(getOrCreateUser(user));
});

// Endpoint: Generate Telegram Stars Invoice Link
app.post('/api/invoice', async (req, res) => {
  const tgUser = validateTelegramWebAppData(req.body.initData);
  if (!tgUser) return res.status(401).json({ error: "Unauthorized" });

  const { tierCost } = req.body; // e.g., 25, 33, 42, 50

  try {
    // Call Telegram API to create an invoice link
    const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
      title: 'Random Gift Spin',
      description: `Spin the wheel for ${tierCost} Stars!`,
      payload: `spin_${tgUser.id}_${tierCost}_${Date.now()}`,
      provider_token: '', // Leave empty for Telegram Stars
      currency: 'XTR', // XTR is the currency code for Telegram Stars
      prices: [{ label: 'Spin', amount: tierCost }]
    });

    res.json({ invoiceUrl: response.data.result });
  } catch (error) {
    res.status(500).json({ error: "Failed to generate invoice" });
  }
});

// Endpoint: Spin the Wheel (Server-side RNG)
app.post('/api/spin', (req, res) => {
  const tgUser = validateTelegramWebAppData(req.body.initData);
  if (!tgUser) return res.status(401).json({ error: "Unauthorized" });

  const { tierCost } = req.body;
  const user = getOrCreateUser(tgUser);

  // In a real app, you would verify the Telegram Stars payment webhook first!
  // For now, we assume payment is verified or they are paying in sparks.

  // Define pools directly on the server for security
  const pool = tierCost >= 50 ? [
    { id: "cup100", emoji: "🏆", probability: 5.46, reward: 100, sell: 70 },
    { id: "gift25", emoji: "🎁", probability: 11.61, reward: 25, sell: 18 }
    // ... add the rest of your pool50 items here
  ] : [
    { id: "cup100", emoji: "🏆", probability: 0.806, reward: 100, sell: 70 },
    { id: "gift25", emoji: "🎁", probability: 25, reward: 25, sell: 18 }
    // ... add the rest of your pool25 items here
  ];

  // Weighted random generation
  const totalWeight = pool.reduce((a, i) => a + i.probability, 0);
  let r = Math.random() * totalWeight;
  let winner = pool[pool.length - 1];
  for (const item of pool) {
    r -= item.probability;
    if (r <= 0) { winner = item; break; }
  }

  // Update user database (e.g., automatically adding to inventory)
  user.gifts.unshift(winner.emoji);

  res.json({ winner, newBalance: user.sparks, newInventory: user.gifts });
});

app.listen(3000, () => console.log('Backend running on port 3000'));
