const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const crypto = require('crypto');

// --- CONFIGURATION ---
// IMPORTANT: In a real production environment, use environment variables for sensitive data.
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN'; // Replace with your bot token
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://your-username.github.io/your-repo-name/'; // Replace with your game's URL
const DB_PATH = './database.json';

// --- INITIALIZATION ---
const app = express();
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
app.use(bodyParser.json());

// --- DATABASE HELPERS ---
const readDb = () => {
    if (!fs.existsSync(DB_PATH)) {
        return { users: {} };
    }
    return JSON.parse(fs.readFileSync(DB_PATH));
};

const writeDb = (data) => {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
};

const getInitialUserState = () => ({
    starCrystals: 0,
    telegramStars: 0,
    ownedSkins: ['default'],
    equippedSkin: 'default',
    settings: { isSoundEnabled: true, isGamingFontEnabled: true },
    progress: { hasSeenTutorial: false },
    playerLives: 5,
    lastLifeRegenTimestamp: Date.now(),
    lastBonusClaimTimestamp: 0,
    bonusStreak: 0,
    lastConversionTimestamp: Date.now(),
    crateAdWatchCount: 0,
    referredBy: null, // Track who referred this user
});

// --- TELEGRAM WEB APP VALIDATION ---
const validateInitData = (initData) => {
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
};


// --- BOT COMMANDS ---
bot.onText(/\/start(?: (.+))?/, (msg, match) => {
    const chatId = msg.chat.id;
    const referrerId = match[1]; // Captured from the regex

    const db = readDb();
    if (!db.users[chatId]) {
        db.users[chatId] = getInitialUserState();
        if(referrerId) {
            db.users[chatId].referredBy = referrerId;
        }
        writeDb(db);
    }
    
    bot.sendMessage(chatId, "🚀 Welcome to Starfall Galaxy! 🚀", {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Launch Game', web_app: { url: WEB_APP_URL } }]
            ]
        }
    });
});

bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "Welcome to Starfall Galaxy!\n\nUse /start to launch the game.\n\nCatch stars, avoid bombs, and upgrade your gear!");
});


// --- API ENDPOINTS ---

// Middleware for validation
const validationMiddleware = (req, res, next) => {
    const initData = req.query.initData || req.body.initData;
    if (!initData || !validateInitData(initData)) {
        return res.status(403).json({ message: 'Forbidden: Invalid Telegram data' });
    }
    next();
};

// GET user data
app.get('/api/user/:userId', validationMiddleware, (req, res) => {
    const { userId } = req.params;
    const db = readDb();
    const user = db.users[userId];

    if (user) {
        res.status(200).json(user);
    } else {
        res.status(404).json({ message: 'User not found' });
    }
});

// POST (save) user data
app.post('/api/user/:userId', validationMiddleware, (req, res) => {
    const { userId } = req.params;
    const { state } = req.body;
    const db = readDb();

    if (!db.users[userId]) {
        db.users[userId] = getInitialUserState();
    }
    // Merge the new state with the existing state to not lose referral data
    db.users[userId] = { ...db.users[userId], ...state };

    writeDb(db);
    res.status(200).json({ message: 'Data saved successfully' });
});

// POST to process a new referral
app.post('/api/referral', validationMiddleware, (req, res) => {
    const { referrerId, newUserId } = req.body;

    if (!referrerId || !newUserId || referrerId === newUserId) {
        return res.status(400).json({ message: 'Invalid referral data' });
    }
    
    const db = readDb();

    // Ensure both users exist
    if (!db.users[referrerId]) {
        return res.status(404).json({ message: 'Referrer not found' });
    }
    if (!db.users[newUserId]) {
        db.users[newUserId] = getInitialUserState();
    }
    
    // Check if the new user was already referred by someone
    if (db.users[newUserId].referredBy) {
        return res.status(409).json({ message: 'User has already been referred' });
    }

    // Process the reward
    db.users[newUserId].referredBy = referrerId;
    db.users[referrerId].telegramStars = (db.users[referrerId].telegramStars || 0) + 1; // Add 1 Telegram Star
    
    writeDb(db);

    // Notify the referrer via bot if you want (optional)
    bot.sendMessage(referrerId, `🎉 A friend has joined using your link! You've earned 1 ⭐️!`).catch(err => {
        console.log(`Could not send message to referrer ${referrerId}:`, err.message);
    });

    res.status(200).json({ message: 'Referral processed successfully' });
});

// --- START SERVER ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
