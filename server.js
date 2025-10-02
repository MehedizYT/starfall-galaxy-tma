const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const crypto = require('crypto');

// --- CONFIGURATION ---
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SERVER_URL = process.env.PUBLIC_URL;
// IMPORTANT: Paste your game's URL from Blogger here.
const BLOGGER_URL = 'https://starfallgalaxy.blogspot.com'; 
const BOT_USERNAME = 'starfallgalaxy_bot'; // Your bot's username

// --- DATABASE SETUP ---
const adapter = new FileSync('db.json');
const db = low(adapter);
db.defaults({ users: {} }).write();

// --- SERVER & BOT INITIALIZATION ---
const bot = new TelegramBot(TOKEN);
const app = express();
app.use(bodyParser.json());

// Webhook for Telegram to send updates
app.post(`/bot${TOKEN}`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});


// --- SECURITY FUNCTION ---
// This function checks if data is really from Telegram, preventing cheating.
function isValidTelegramData(initData) {
    const data = new URLSearchParams(initData);
    const hash = data.get('hash');
    data.delete('hash');
    const dataCheckString = Array.from(data.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(TOKEN).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    return calculatedHash === hash;
}


// --- API ENDPOINTS FOR YOUR GAME ---

// Endpoint for the game to get player data
app.post('/get-data', (req, res) => {
    const { initData } = req.body;

    if (!isValidTelegramData(initData)) {
        return res.status(403).json({ error: "Invalid data" });
    }

    const params = new URLSearchParams(initData);
    const user = JSON.parse(params.get('user'));
    const userId = user.id;

    let playerData = db.get(`users.${userId}`).value();
    if (!playerData) {
        // Create a new player with default values
        playerData = { id: userId, username: user.username, telegramStars: 0, starCrystals: 100, referrals: 0 };
        db.set(`users.${userId}`, playerData).write();
    }
    res.json(playerData);
});

// Endpoint for the game to save player data
app.post('/save-data', (req, res) => {
    const { initData, starCrystals, telegramStars } = req.body;
    
    if (!isValidTelegramData(initData)) {
        return res.status(403).json({ error: "Invalid data" });
    }

    const params = new URLSearchParams(initData);
    const user = JSON.parse(params.get('user'));
    const userId = user.id;
    
    db.get('users').get(userId).assign({ starCrystals, telegramStars }).write();
    res.json({ success: true });
});


// --- BOT COMMANDS LOGIC ---

// Helper function to get or create a user
function getOrCreateUser(user) {
    let userData = db.get(`users.${user.id}`).value();
    if (!userData) {
        userData = { id: user.id, username: user.username, telegramStars: 0, starCrystals: 100, referrals: 0, referredBy: null };
        db.set(`users.${user.id}`, userData).write();
    }
    return userData;
}

const gameKeyboard = {
    reply_markup: { inline_keyboard: [[{ text: '🚀 Play Starfall Galaxy 🚀', web_app: { url: BLOGGER_URL } }]] }
};

// Command: /start (handles referrals)
bot.onText(/\/start(?: (.*))?/, (msg, match) => {
    const chatId = msg.chat.id;
    const user = getOrCreateUser(msg.from);
    const referrerId = match[1];

    // Referral logic
    if (referrerId && referrerId != user.id && user.referredBy === null) {
        const referrer = db.get(`users.${referrerId}`).value();
        if (referrer) {
            // Award the referrer
            db.get(`users.${referrerId}`).assign({ 
                telegramStars: (referrer.telegramStars || 0) + 1.0,
                referrals: (referrer.referrals || 0) + 1
            }).write();

            // Mark the new user as referred
            db.set(`users.${user.id}.referredBy`, referrerId).write();
            
            // Notify the referrer
            bot.sendMessage(referrerId, `🎉 A new player, ${msg.from.first_name}, joined using your link! You've earned 1 ⭐️.`).catch(err => console.log('Could not notify referrer.'));
        }
    }
    
    bot.sendMessage(chatId, "Welcome to Starfall Galaxy! ✨ Click the button below to start playing!", gameKeyboard);
});

// Command: /invite
bot.onText(/\/invite/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const inviteLink = `https://t.me/${BOT_USERNAME}?start=${userId}`;
    const message = `Here is your personal invite link! Share it with friends. You get 1 ⭐️ for every new player who joins.\n\n${inviteLink}`;
    bot.sendMessage(chatId, message);
});

// Command: /play
bot.onText(/\/play/, (msg) => {
    bot.sendMessage(msg.chat.id, "Click below to jump into the action!", gameKeyboard);
});


// --- START THE SERVER AND SET WEBHOOK ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`Server is running on port ${PORT}`);
    try {
        const webhookUrl = `${SERVER_URL}/bot${TOKEN}`;
        await bot.setWebHook(webhookUrl);
        console.log(`Webhook successfully set to ${webhookUrl}`);
    } catch (error) {
        console.error('Error setting webhook:', error.message);
    }
});
