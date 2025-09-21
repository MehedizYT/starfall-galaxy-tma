const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { JsonDB, Config } = require('node-json-db');
const fetch = require('node-fetch'); // Using v2 for easier require syntax

const app = express();
const PORT = process.env.PORT || 3000;

// --- IMPORTANT: SET THESE IN YOUR RENDER ENVIRONMENT VARIABLES ---
const BOT_TOKEN = process.env.BOT_TOKEN;
const PAYMENT_PROVIDER_TOKEN = process.env.PAYMENT_PROVIDER_TOKEN;

if (!BOT_TOKEN || !PAYMENT_PROVIDER_TOKEN) {
    console.error("FATAL ERROR: BOT_TOKEN or PAYMENT_PROVIDER_TOKEN is not set.");
    process.exit(1);
}

// Simple file-based database
const db = new JsonDB(new Config("starfallDB", true, true, '/'));

// Server-side price list for security
const SKIN_CATALOG_SERVER = {
    'crate': { name: 'Wooden Crate', price: 5 },
    'golden': { name: 'Golden Bucket', price: 10 },
    'rainbow': { name: 'Rainbow Pot', price: 15 },
    'tech': { name: 'Tech Catcher', price: 20 },
    'claw': { name: 'Sci-Fi Claw', price: 25 },
    'crown': { name: 'Royal Crown', price: 50 },
};

app.use(cors());
app.use(express.json());

// --- Helper Function to Validate Telegram Data ---
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

// --- Health Check Endpoint ---
app.get('/', (req, res) => {
    res.send('Starfall Galaxy Server is running!');
});

// --- REFERRAL ENDPOINTS ---

app.post('/register', async (req, res) => {
    const { initData } = req.body;
    if (!initData || !validateInitData(initData)) {
        return res.status(403).json({ error: 'Invalid Telegram data' });
    }

    const params = new URLSearchParams(initData);
    const user = JSON.parse(params.get('user'));
    const startParam = params.get('start_param');

    try {
        const userPath = `/users/${user.id}`;
        if (await db.exists(userPath)) {
            return res.json({ status: 'already_registered' });
        }

        await db.push(userPath, { id: user.id, username: user.username, rewardsToClaim: 0 });

        if (startParam && startParam.startsWith('ref_')) {
            const inviterId = startParam.split('_')[1];
            if (inviterId && inviterId != user.id) {
                const inviterPath = `/users/${inviterId}`;
                if (await db.exists(inviterPath)) {
                    const currentRewards = await db.getData(`${inviterPath}/rewardsToClaim`);
                    await db.push(`${inviterPath}/rewardsToClaim`, currentRewards + 1);
                }
            }
        }
        res.json({ status: 'registered_successfully' });
    } catch (error) {
        console.error("Error in /register:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/claim-rewards', async (req, res) => {
    const { initData } = req.body;
    if (!initData || !validateInitData(initData)) {
        return res.status(403).json({ error: 'Invalid Telegram data' });
    }

    const params = new URLSearchParams(initData);
    const user = JSON.parse(params.get('user'));

    try {
        const userPath = `/users/${user.id}`;
        if (!(await db.exists(userPath))) {
            return res.json({ rewards: 0 });
        }

        const rewards = await db.getData(`${userPath}/rewardsToClaim`);
        if (rewards > 0) {
            await db.push(`${userPath}/rewardsToClaim`, 0);
        }
        res.json({ rewards: rewards });
    } catch (error) {
        console.error("Error in /claim-rewards:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --- PAYMENT ENDPOINT ---

app.post('/create-invoice', async (req, res) => {
    const { initData, itemId } = req.body;
    if (!initData || !validateInitData(initData) || !itemId) {
        return res.status(403).json({ error: 'Invalid data' });
    }

    const item = SKIN_CATALOG_SERVER[itemId];
    if (!item) {
        return res.status(404).json({ error: 'Item not found' });
    }

    const params = new URLSearchParams(initData);
    const user = JSON.parse(params.get('user'));

    try {
        const invoicePayload = {
            title: item.name,
            description: `Purchase of the ${item.name} skin for Starfall Galaxy.`,
            payload: `purchase_${user.id}_${itemId}_${Date.now()}`,
            provider_token: PAYMENT_PROVIDER_TOKEN,
            currency: 'XTR',
            prices: [{ label: `${item.name} Skin`, amount: item.price }]
        };

        const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(invoicePayload),
        });

        const data = await response.json();

        if (data.ok) {
            res.json({ invoiceUrl: data.result });
        } else {
            console.error("Telegram API Error:", data.description);
            res.status(500).json({ error: 'Failed to create invoice link', details: data.description });
        }
    } catch (error) {
        console.error("Error in /create-invoice:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --- Start the Server ---
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
