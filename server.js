const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { JsonDB, Config } = require('node-json-db');
const fetch = require('node-fetch');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const PORT = process.env.PORT || 3000;

// --- IMPORTANT: SET THESE IN YOUR RENDER ENVIRONMENT VARIABLES ---
const BOT_TOKEN = process.env.BOT_TOKEN;
const PAYMENT_PROVIDER_TOKEN = process.env.PAYMENT_PROVIDER_TOKEN;
const SERVER_URL = process.env.RENDER_EXTERNAL_URL; // Render provides this automatically

if (!BOT_TOKEN || !PAYMENT_PROVIDER_TOKEN || !SERVER_URL) {
    console.error("FATAL ERROR: A required environment variable is missing.");
    process.exit(1);
}

// --- DATABASE AND CONFIG ---
const db = new JsonDB(new Config("starfallDB", true, true, '/'));
const SKIN_CATALOG_SERVER = { /* ... your skin prices ... */ };
const GAME_SHORT_NAME = "play"; // Corresponds to the button you will create in BotFather

// --- EXPRESS APP SETUP ---
app.use(cors());
app.use(express.json());

// --- TELEGRAM BOT SETUP (WEBHOOK MODE) ---
const bot = new TelegramBot(BOT_TOKEN);
const webhookPath = `/bot${BOT_TOKEN}`;
bot.setWebHook(`${SERVER_URL}${webhookPath}`);

// Process webhook updates from Telegram
app.post(webhookPath, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});


// --- BOT COMMAND LOGIC ---

// /start command
bot.onText(/\/start(?: (.+))?/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const userPath = `/users/${userId}`;

    // The game's URL for the Web App button
    const gameUrl = `https://t.me/${(await bot.getMe()).username}/${GAME_SHORT_NAME}`;

    // Ensure user is in the database.
    // The main referral crediting happens when they first open the game via the /register endpoint.
    if (!(await db.exists(userPath))) {
        await db.push(userPath, { id: userId, username: msg.from.username, rewardsToClaim: 0 });
    }

    const welcomeText = `Welcome to Starfall Galaxy, ${msg.from.first_name}! 🚀\n\nClick the button below to start catching stars and earning rewards.`;
    const options = {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Launch Game ✨', web_app: { url: gameUrl } }]
            ]
        }
    };
    bot.sendMessage(chatId, welcomeText, options);
});

// /balance command
bot.onText(/\/balance/, async (msg) => {
    const userId = msg.from.id;
    const userPath = `/users/${userId}`;

    if (!(await db.exists(userPath))) {
        return bot.sendMessage(msg.chat.id, "I don't have any data for you yet. Please start the game first by using the /start command!");
    }

    const userData = await db.getData(userPath);
    const rewardsToClaim = userData.rewardsToClaim || 0;

    // NOTE: The bot can only see data stored on the server.
    // The primary balances (Star Crystals, Telegram Stars) are in the user's browser localStorage.
    // This command accurately reports on pending referral rewards.
    let balanceText = `Hi ${msg.from.first_name}!\n\n`;
    balanceText += `You have **${rewardsToClaim}** unclaimed referral reward(s).\n\n`;
    balanceText += `To see your full Star Crystal (✨) and Telegram Stars (⭐️) balance, please open the game.`;

    bot.sendMessage(msg.chat.id, balanceText, { parse_mode: 'Markdown' });
});

// /help command
bot.onText(/\/help/, (msg) => {
    const helpText = "Welcome to the Starfall Galaxy bot!\n\n" +
                     "Here are the available commands:\n" +
                     "/start - Launch the game and see the main menu.\n" +
                     "/balance - Check your pending referral rewards.\n" +
                     "/help - Show this help message.\n\n" +
                     "You can play the game by clicking the 'Play Game' button below or using the /start command.";
    bot.sendMessage(msg.chat.id, helpText);
});


// --- WEB APP API ENDPOINTS (from previous steps) ---

// Helper function (no changes)
function validateInitData(initData) { /* ... same as before ... */ }

// Health check (no changes)
app.get('/', (req, res) => res.send('Starfall Galaxy Server is running!'));

// Referrals and Payments (no changes to these endpoints)
app.post('/register', async (req, res) => { /* ... same as before ... */ });
app.post('/claim-rewards', async (req, res) => { /* ... same as before ... */ });
app.post('/create-invoice', async (req, res) => { /* ... same as before ... */ });

// Start the Express server
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});


// --- Full code for unchanged helper functions and endpoints ---

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

app.post('/register', async (req, res) => {
    const { initData } = req.body;
    if (!initData || !validateInitData(initData)) { return res.status(403).json({ error: 'Invalid Telegram data' }); }
    const params = new URLSearchParams(initData);
    const user = JSON.parse(params.get('user'));
    const startParam = params.get('start_param');
    try {
        const userPath = `/users/${user.id}`;
        if (await db.exists(userPath)) { return res.json({ status: 'already_registered' }); }
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
    if (!initData || !validateInitData(initData)) { return res.status(403).json({ error: 'Invalid Telegram data' }); }
    const params = new URLSearchParams(initData);
    const user = JSON.parse(params.get('user'));
    try {
        const userPath = `/users/${user.id}`;
        if (!(await db.exists(userPath))) { return res.json({ rewards: 0 }); }
        const rewards = await db.getData(`${userPath}/rewardsToClaim`);
        if (rewards > 0) { await db.push(`${userPath}/rewardsToClaim`, 0); }
        res.json({ rewards: rewards });
    } catch (error) {
        console.error("Error in /claim-rewards:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/create-invoice', async (req, res) => {
    const { initData, itemId } = req.body;
    if (!initData || !validateInitData(initData) || !itemId) { return res.status(403).json({ error: 'Invalid data' }); }
    const item = SKIN_CATALOG_SERVER[itemId];
    if (!item) { return res.status(404).json({ error: 'Item not found' }); }
    const params = new URLSearchParams(initData);
    const user = JSON.parse(params.get('user'));
    try {
        const invoicePayload = { title: item.name, description: `Purchase of the ${item.name} skin.`, payload: `purchase_${user.id}_${itemId}_${Date.now()}`, provider_token: PAYMENT_PROVIDER_TOKEN, currency: 'XTR', prices: [{ label: `${item.name} Skin`, amount: item.price }] };
        const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(invoicePayload) });
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
