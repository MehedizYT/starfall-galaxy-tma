// -------------------------------------------------------------------
// STARFALL GALAXY - BACKEND SERVER
// -------------------------------------------------------------------

// --- 1. IMPORTS ---
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Telegraf, Markup } = require('telegraf');
const crypto = require('crypto');
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');

// --- 2. CONFIGURATION ---
// IMPORTANT: Replace these with your actual bot token and web app URL
const BOT_TOKEN = process.env.BOT_TOKEN || '8325959442:AAH_12MHRzxemyQLc6XTkoBjm9ei5lZlIr4';
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://starfallgalaxy.blogspot.com'; // The URL where you host the HTML game

const REFERRAL_BONUS = 1.0; // The bonus (in Telegram Stars ⭐️) the referrer receives
const PORT = process.env.PORT || 3000;

// --- 3. DATABASE SETUP (using lowdb for a simple JSON file database) ---
const adapter = new JSONFile('db.json');
const defaultData = { users: {} };
const db = new Low(adapter, defaultData);

// Helper function to get or create a user
async function getOrCreateUser(userId) {
    if (!db.data.users[userId]) {
        db.data.users[userId] = {
            id: userId,
            stars: 0.0, // This is the balance the BACKEND manages
            unclaimedRewards: 0.0,
            registered: false,
            referrer: null,
            referrals: [],
            createdAt: new Date().toISOString(),
        };
        await db.write();
    }
    return db.data.users[userId];
}

// --- 4. TELEGRAM BOT SETUP ---
const bot = new Telegraf(BOT_TOKEN);

// '/start' command handler
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const startPayload = ctx.startPayload;
    const user = await getOrCreateUser(userId);

    // Handle referral logic
    if (startPayload && startPayload.startsWith('ref_')) {
        const referrerId = startPayload.substring(4);
        if (referrerId && Number(referrerId) !== userId && !user.referrer) {
            const referrer = await getOrCreateUser(referrerId);
            if (referrer) {
                user.referrer = referrerId;
                referrer.referrals.push(userId);
                await db.write();
                console.log(`User ${userId} was referred by ${referrerId}`);
            }
        }
    }

    // Send welcome message with a button to open the Web App
    await ctx.reply(
        "🚀 Welcome to Starfall Galaxy!\n\nCatch falling stars, avoid bombs, and earn real rewards. Click the button below to start your adventure!",
        Markup.inlineKeyboard([
            Markup.button.webApp('🌟 Play Now! 🌟', WEB_APP_URL)
        ])
    );
});

// '/stats' command handler (example of another useful command)
bot.command('stats', async (ctx) => {
    const userId = ctx.from.id;
    const user = db.data.users[userId];

    if (!user) {
        return ctx.reply("You haven't played yet! Type /start to begin.");
    }
    
    // The frontend game saves its own data (crystals, lives etc) in browser storage.
    // The backend only knows about stars and referrals.
    const statsMessage = `
📊 *Your Starfall Stats* 📊

⭐️ *Telegram Stars:* ${user.stars.toFixed(4)}
👥 *Friends Invited:* ${user.referrals.length}

To see your Crystal balance, lives, and skins, please open the game!
    `;
    
    return ctx.replyWithMarkdown(statsMessage);
});


// --- 5. EXPRESS API SERVER SETUP ---
const app = express();
app.use(cors()); // Allow requests from your web app
app.use(bodyParser.json());

// Helper function to validate Telegram's initData
function isInitDataValid(initData) {
    const data = new URLSearchParams(initData);
    const hash = data.get('hash');
    data.delete('hash');

    // Sort keys alphabetically for consistent hash calculation
    const sortedKeys = Array.from(data.keys()).sort();
    let dataCheckString = sortedKeys.map(key => `${key}=${data.get(key)}`).join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    
    return calculatedHash === hash;
}

// API Endpoint: /register
// The game calls this when a new user starts.
app.post('/register', async (req, res) => {
    const { initData } = req.body;

    if (!initData || !isInitDataValid(initData)) {
        return res.status(401).json({ error: 'Invalid authentication data' });
    }

    const data = new URLSearchParams(initData);
    const userObject = JSON.parse(data.get('user'));
    const userId = userObject.id;

    const user = await getOrCreateUser(userId);

    // If the user is new and has a referrer, credit the referrer
    if (!user.registered && user.referrer) {
        const referrer = db.data.users[user.referrer];
        if (referrer) {
            referrer.unclaimedRewards = (referrer.unclaimedRewards || 0) + REFERRAL_BONUS;
            console.log(`Credited ${REFERRAL_BONUS} stars to referrer ${user.referrer} for user ${userId} joining.`);
        }
    }
    
    user.registered = true;
    await db.write();

    console.log(`User ${userId} registered or logged in.`);
    res.status(200).json({ message: 'User registered successfully' });
});

// API Endpoint: /claim-rewards
// The game calls this to get referral bonuses for the player.
app.post('/claim-rewards', async (req, res) => {
    const { initData } = req.body;

    if (!initData || !isInitDataValid(initData)) {
        return res.status(401).json({ error: 'Invalid authentication data' });
    }

    const data = new URLSearchParams(initData);
    const userObject = JSON.parse(data.get('user'));
    const userId = userObject.id;

    const user = await getOrCreateUser(userId);
    
    const rewardsToClaim = user.unclaimedRewards || 0;
    if (rewardsToClaim > 0) {
        user.stars += rewardsToClaim;
        user.unclaimedRewards = 0;
        await db.write();
        console.log(`User ${userId} claimed ${rewardsToClaim} stars.`);
        return res.status(200).json({ rewards: rewardsToClaim });
    }

    res.status(200).json({ rewards: 0 });
});


// --- 6. START EVERYTHING ---
async function startServer() {
    await db.read(); // Load the database
    
    app.listen(PORT, () => {
        console.log(`✅ API Server is running on port ${PORT}`);
    });
    
    bot.launch(() => {
        console.log('✅ Telegram Bot is running');
    });
}

startServer();

// Graceful shutdown
process.once('SIGINT', () => {
    bot.stop('SIGINT');
    process.exit();
});
process.once('SIGTERM', () => {
    bot.stop('SIGTERM');
    process.exit();
});
