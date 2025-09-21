const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { JsonDB, Config } = require('node-json-db');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// --- IMPORTANT: ENSURE THESE ARE SET IN RENDER ENVIRONMENT VARIABLES ---
const BOT_TOKEN = process.env.BOT_TOKEN;
const PAYMENT_PROVIDER_TOKEN = process.env.PAYMENT_PROVIDER_TOKEN;

if (!BOT_TOKEN || !PAYMENT_PROVIDER_TOKEN) {
    console.error("FATAL ERROR: BOT_TOKEN or PAYMENT_PROVIDER_TOKEN is not set in environment variables.");
    process.exit(1);
}

const db = new JsonDB(new Config("starfallDB", true, true, '/'));

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

app.get('/', (req, res) => res.send('Starfall Galaxy Server is running!'));

app.post('/register', async (req, res) => { /* ... (no changes here) ... */ });
app.post('/claim-rewards', async (req, res) => { /* ... (no changes here) ... */ });

// --- PAYMENT ENDPOINT (IMPROVED) ---
app.post('/create-invoice', async (req, res) => {
    const { initData, itemId } = req.body;
    if (!initData || !validateInitData(initData) || !itemId) {
        return res.status(403).json({ error: 'Invalid or missing data.' });
    }

    const item = SKIN_CATALOG_SERVER[itemId];
    if (!item) {
        return res.status(404).json({ error: `Item with ID '${itemId}' not found on server.` });
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
            // SUCCESS! Send the URL back to the game.
            res.json({ invoiceUrl: data.result });
        } else {
            // FAILURE! Log the error and send a detailed message back to the game.
            console.error("Telegram API Error:", data.description);
            res.status(500).json({ 
                error: 'Telegram API failed to create invoice.', 
                details: data.description // This is the crucial part
            });
        }
    } catch (error) {
        console.error("Error in /create-invoice endpoint:", error);
        res.status(500).json({ error: 'Internal server error occurred.' });
    }
});

app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
