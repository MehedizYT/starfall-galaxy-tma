const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { JsonDB, Config } = require('node-json-db');

const app = express();
const PORT = process.env.PORT || 3000;

// --- IMPORTANT: SET THIS IN YOUR RENDER ENVIRONMENT VARIABLES ---
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
    console.error("FATAL ERROR: BOT_TOKEN is not set. Please set it in your environment variables.");
    process.exit(1);
}

// Simple file-based database for referrals
const db = new JsonDB(new Config("referralDB", true, true, '/'));

// --- NEW: A single source of truth for item prices on the server ---
// This prevents the client from sending a fake price.
const SKIN_PRICES = {
    'crate': 150,
    'golden': 250,
    'rainbow': 400,
    'tech': 500,
    'claw': 750,
    'crown': 1000,
};

app.use(cors());
app.use(express.json());

// Function to validate the initData string from Telegram
function validateInitData(initData) {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    urlParams.delete('hash');

    const dataCheckString = Array.from(urlParams.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    return calculatedHash === hash;
}

// --- NEW: Endpoint to create a Telegram Stars invoice ---
app.post('/create-invoice', async (req, res) => {
    const { initData, itemId, itemName } = req.body;

    if (!initData || !validateInitData(initData)) {
        return res.status(403).json({ error: 'Invalid Telegram data' });
    }

    const price = SKIN_PRICES[itemId];
    if (!price) {
        return res.status(400).json({ error: 'Invalid item ID' });
    }

    const params = new URLSearchParams(initData);
    const user = JSON.parse(params.get('user'));

    const invoicePayload = {
        title: itemName,
        description: `Purchase the ${itemName} skin from the Starfall Galaxy shop.`,
        payload: `purchase_${user.id}_${itemId}_${Date.now()}`, // Unique payload for this transaction
        currency: 'XTR', // XTR is the currency code for Telegram Stars
        prices: [{ label: 'Price', amount: price }]
    };

    try {
        const apiResponse = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(invoicePayload)
        });

        const data = await apiResponse.json();

        if (data.ok) {
            res.json({ invoiceLink: data.result });
        } else {
            console.error("Telegram API Error:", data);
            res.status(500).json({ error: 'Failed to create invoice link', details: data.description });
        }
    } catch (error) {
        console.error("Error creating invoice:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// Endpoint for a user to register and process a potential referral
app.post('/register', async (req, res) => {
    const { initData } = req.body;
    if (!initData || !validateInitData(initData)) return res.status(403).json({ error: 'Invalid Telegram data' });
    const params = new URLSearchParams(initData);
    const user = JSON.parse(params.get('user'));
    const startParam = params.get('start_param');
    try {
        const userPath = `/users/${user.id}`;
        if (await db.exists(userPath)) return res.json({ status: 'already_registered' });
        await db.push(userPath, { id: user.id, username: user.username, rewardsToClaim: 0 });
        if (startParam && startParam.startsWith('ref_')) {
            const inviterId = startParam.split('_')[1];
            if (inviterId && inviterId != user.id) {
                const inviterPath = `/users/${inviterId}`;
                if (await db.exists(inviterPath)) {
                    await db.push(`${inviterPath}/rewardsToClaim`, (await db.getData(`${inviterPath}/rewardsToClaim`)) + 1);
                }
            }
        }
        res.json({ status: 'registered_successfully' });
    } catch (error) {
        console.error("Error in /register:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Endpoint for an existing user to claim their accumulated rewards
app.post('/claim-rewards', async (req, res) => {
    const { initData } = req.body;
    if (!initData || !validateInitData(initData)) return res.status(403).json({ error: 'Invalid Telegram data' });
    const params = new URLSearchParams(initData);
    const user = JSON.parse(params.get('user'));
    try {
        const userPath = `/users/${user.id}`;
        if (!(await db.exists(userPath))) return res.json({ rewards: 0 });
        const rewards = await db.getData(`${userPath}/rewardsToClaim`);
        if (rewards > 0) await db.push(`${userPath}/rewardsToClaim`, 0);
        res.json({ rewards: rewards });
    } catch (error) {
        console.error("Error in /claim-rewards:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Health check endpoint for Render
app.get('/', (req, res) => {
    res.send('Starfall Galaxy Server is running!');
});

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
