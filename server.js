const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const crypto = require('crypto');

// --- CONFIGURATION ---
const BOT_TOKEN = process.env.BOT_TOKEN || '8325959442:AAH_12MHRzxemyQLc6XTkoBjm9ei5lZlIr4';
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://starfallgalaxy.blogspot.com';
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
    try {
        return JSON.parse(fs.readFileSync(DB_PATH));
    } catch (e) {
        console.error("Error reading or parsing DB file, returning empty DB", e);
        return { users: {} };
    }
};

const writeDb = (data) => {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
};

const getInitialUserState = () => ({
    starCrystals: 0,
    telegramStars: 0,
    ownedSkins: ['default'],
    equippedSkin: 'default',
    ownedBoosts: {},
    settings: { isSoundEnabled: true, isGamingFontEnabled: true },
    progress: { hasSeenTutorial: false },
    playerLives: 5,
    lastLifeRegenTimestamp: Date.now(),
    lastBonusClaimTimestamp: 0,
    bonusStreak: 0,
    lastConversionTimestamp: Date.now(),
    crateAdWatchCount: 0,
    referredBy: null,
    referrals: [], // List of user IDs this user has referred
    userInfo: {}, // Store user's first/last name
});

// --- TELEGRAM WEB APP VALIDATION ---
const validateInitData = (initData) => {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    if (!hash) return false;
    urlParams.delete('hash');
    const dataCheckString = Array.from(urlParams.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
    
    const secretKey = crypto.createHmac('sha266', 'WebAppData').update(BOT_TOKEN).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    
    return calculatedHash === hash;
};

// Middleware for validation
const validationMiddleware = (req, res, next) => {
    const initData = req.query.initData || req.body.initData;
    if (!initData || !validateInitData(initData)) {
        return res.status(403).json({ message: 'Forbidden: Invalid Telegram data' });
    }
    next();
};

// --- BOT COMMANDS ---
bot.onText(/\/start(?: (.+))?/, (msg, match) => {
    const chatId = msg.chat.id;
    const referrerId = match[1]; 
    
    const db = readDb();
    if (!db.users[chatId]) {
        db.users[chatId] = getInitialUserState();
        if(referrerId && referrerId != chatId) { // Ensure user isn't referring themselves
            db.users[chatId].referredBy = referrerId;
        }
    }
    // Always update user info on start, as names can change
    db.users[chatId].userInfo = {
        firstName: msg.from.first_name,
        lastName: msg.from.last_name || ''
    };
    writeDb(db);
    
    bot.sendMessage(chatId, "🚀 Welcome to Starfall Galaxy! 🚀\n\nClick the button below to start your adventure!", {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Launch Game', web_app: { url: WEB_APP_URL } }]
            ]
        }
    });
});

bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "Welcome to Starfall Galaxy!\n\nUse /start to launch the game.\n\nCatch stars, avoid bombs, and climb the leaderboard!");
});

// --- API ENDPOINTS ---

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
    db.users[userId] = { ...db.users[userId], ...state };
    writeDb(db);
    res.status(200).json({ message: 'Data saved successfully' });
});

// POST to process a new referral
app.post('/api/referral', validationMiddleware, (req, res) => {
    const { referrerId, newUser } = req.body;
    const newUserId = newUser.id;

    if (!referrerId || !newUserId || referrerId == newUserId) {
        return res.status(400).json({ message: 'Invalid referral data' });
    }
    
    const db = readDb();

    if (!db.users[referrerId]) return res.status(404).json({ message: 'Referrer not found' });
    if (!db.users[newUserId]) db.users[newUserId] = getInitialUserState();
    if (db.users[newUserId].referredBy) return res.status(409).json({ message: 'User has already been referred' });

    db.users[newUserId].referredBy = referrerId;
    db.users[newUserId].userInfo = { firstName: newUser.first_name, lastName: newUser.last_name || '' };
    
    db.users[referrerId].telegramStars = (db.users[referrerId].telegramStars || 0) + 1;
    if (!db.users[referrerId].referrals) db.users[referrerId].referrals = [];
    db.users[referrerId].referrals.push(newUserId);
    
    writeDb(db);

    bot.sendMessage(referrerId, `🎉 Your friend ${newUser.first_name} has joined using your link! You've earned 1 ⭐️!`).catch(err => {
        console.log(`Could not send message to referrer ${referrerId}:`, err.message);
    });

    res.status(200).json({ message: 'Referral processed successfully' });
});

// GET list of a user's referrals
app.get('/api/referrals/:userId', validationMiddleware, (req, res) => {
    const { userId } = req.params;
    const db = readDb();
    const user = db.users[userId];

    if (!user || !user.referrals) {
        return res.status(200).json([]);
    }

    const referralData = user.referrals.map(refId => {
        const referredUser = db.users[refId];
        return {
            firstName: referredUser?.userInfo?.firstName || 'A friend',
            lastName: referredUser?.userInfo?.lastName || ''
        };
    });
    res.status(200).json(referralData);
});

// GET the global leaderboard
app.get('/api/leaderboard', validationMiddleware, (req, res) => {
    const db = readDb();
    const players = Object.values(db.users)
        .filter(u => u.userInfo && u.userInfo.firstName) // Only include users with info
        .map(u => ({
            firstName: u.userInfo.firstName,
            lastName: u.userInfo.lastName,
            telegramStars: u.telegramStars || 0
        }));
    
    players.sort((a, b) => b.telegramStars - a.telegramStars);
    
    res.status(200).json(players.slice(0, 100)); // Return top 100 players
});


// --- START SERVER ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
