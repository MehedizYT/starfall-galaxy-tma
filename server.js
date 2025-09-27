const express = require('express');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const { JSONFilePreset } = require('lowdb/node');
const crypto = require('crypto');

// --- CONFIGURATION ---
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN'; // Set in your environment variables
const SERVER_URL = process.env.SERVER_URL; // e.g., 'https://starfall-galaxy-full-server.onrender.com'
const BOT_USERNAME = process.env.BOT_USERNAME || 'starfallgalaxy_bot';
const SECRET_TOKEN = crypto.createHash('sha256').update(BOT_TOKEN).digest('hex');

const app = express();
app.use(express.json());
app.use(cors());

// --- DATABASE SETUP (using lowdb) ---
const defaultData = { users: {} };
const db = await JSONFilePreset('db.json', defaultData);

// --- TELEGRAM BOT SETUP ---
const bot = new TelegramBot(BOT_TOKEN);
const WEBHOOK_URL = `${SERVER_URL}/bot${BOT_TOKEN}`;
bot.setWebHook(WEBHOOK_URL, {
    secret_token: SECRET_TOKEN,
});

app.post(`/bot${BOT_TOKEN}`, (req, res) => {
    if (req.header('x-telegram-bot-api-secret-token') === SECRET_TOKEN) {
        bot.processUpdate(req.body);
        res.sendStatus(200);
    } else {
        res.sendStatus(403);
    }
});


// --- HELPER FUNCTIONS ---
function validateInitData(initDataString) {
    const urlParams = new URLSearchParams(initDataString);
    const hash = urlParams.get('hash');
    const dataToCheck = [];
    urlParams.sort();
    urlParams.forEach((val, key) => {
        if (key !== 'hash') {
            dataToCheck.push(`${key}=${val}`);
        }
    });

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN);
    const calculatedHash = crypto.createHmac('sha256', secretKey.digest()).update(dataToCheck.join('\n')).digest('hex');

    return calculatedHash === hash;
}

function getUserFromInitData(initData) {
    return JSON.parse(new URLSearchParams(initData).get('user'));
}

async function getOrCreateUser(userId, username, referrerId = null) {
    await db.read();
    let user = db.data.users[userId];
    let message = null;
    let isNewUser = false;

    if (!user) {
        isNewUser = true;
        user = {
            id: userId,
            username: username,
            starCrystals: 0,
            telegramStars: 1, // Welcome bonus
            ownedSkins: ['default'],
            equippedSkin: 'default',
            settings: { isSoundEnabled: true, isGamingFontEnabled: true },
            progress: { hasSeenTutorial: false },
            playerLives: 5,
            lastLifeRegenTimestamp: Date.now(),
            lastBonusClaimTimestamp: 0,
            bonusStreak: 0,
            lastConversionTimestamp: Date.now(),
            referredBy: null,
            referrals: [],
        };
        db.data.users[userId] = user;
        message = "Welcome to Starfall Galaxy! You've received 1 ⭐️ as a welcome bonus!";
        
        // Handle referral if present
        if (referrerId && db.data.users[referrerId] && referrerId != userId) {
            user.referredBy = referrerId;
            user.telegramStars += 0.5; // New user bonus
            message += "\nYou also got 0.5 ⭐️ for joining from a friend's invite!";

            // Reward the referrer
            db.data.users[referrerId].telegramStars += 1;
            db.data.users[referrerId].referrals.push(userId);
            console.log(`User ${referrerId} referred ${userId}. Awarding bonuses.`);
        }
    }

    await db.write();
    return { user, message, isNewUser };
}


// --- BOT COMMANDS ---
bot.onText(/\/start(?: ref_(\d+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const username = msg.from.username || msg.from.first_name;
    const referrerId = match[1];

    await getOrCreateUser(userId, username, referrerId);

    const welcomeText = `Welcome to Starfall Galaxy, ${username}!\n\nCatch falling stars, customize your ship, and earn rewards. Use the commands below or tap the button to play!`;
    const gameUrl = `https://t.me/${BOT_USERNAME}/play`;

    bot.sendMessage(chatId, welcomeText, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🚀 Play Now!', web_app: { url: gameUrl } }]
            ]
        }
    });
});

bot.onText(/\/invite/, async (msg) => {
    const userId = msg.from.id.toString();
    const referralLink = `https://t.me/${BOT_USERNAME}/play?startapp=ref_${userId}`;
    const inviteText = `Here is your personal invite link! Share it with friends.\n\nThey get 0.5 ⭐️ and you get 1 ⭐️ when they join!\n\n${referralLink}`;
    bot.sendMessage(msg.chat.id, inviteText);
});

bot.onText(/\/balance/, async (msg) => {
    const userId = msg.from.id.toString();
    await db.read();
    const user = db.data.users[userId];

    if (user) {
        const balanceText = `Your Balances:\n\n✨ Star Crystals: ${user.starCrystals}\n⭐️ Telegram Stars: ${user.telegramStars.toFixed(4)}`;
        bot.sendMessage(msg.chat.id, balanceText);
    } else {
        bot.sendMessage(msg.chat.id, "I couldn't find your data. Try starting the game first by typing /start.");
    }
});

bot.onText(/\/help/, (msg) => {
    const helpText = `Available Commands:\n\n/start - Start the bot and get the play button.\n/invite - Get your personal referral link.\n/balance - Check your current currency balances.`;
    bot.sendMessage(msg.chat.id, helpText);
});

// --- API ENDPOINTS FOR THE WEB APP ---
app.post('/get-data', async (req, res) => {
    const { initData } = req.body;
    if (!initData || !validateInitData(initData)) {
        return res.status(403).json({ error: 'Invalid initData' });
    }

    try {
        const tgUser = getUserFromInitData(initData);
        const { user, message } = await getOrCreateUser(tgUser.id.toString(), tgUser.username);
        res.json({ ...user, message });
    } catch (e) {
        console.error('Error in /get-data:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/save-data', async (req, res) => {
    const { initData, data } = req.body;
    if (!initData || !validateInitData(initData)) {
        return res.status(403).json({ error: 'Invalid initData' });
    }

    try {
        const tgUser = getUserFromInitData(initData);
        const userId = tgUser.id.toString();

        await db.read();
        if (db.data.users[userId]) {
            // Merge only the fields the client is allowed to change
            db.data.users[userId] = {
                ...db.data.users[userId], // Keep server-authoritative data
                starCrystals: data.starCrystals,
                telegramStars: data.telegramStars,
                ownedSkins: data.ownedSkins,
                equippedSkin: data.equippedSkin,
                settings: data.settings,
                progress: data.progress,
                playerLives: data.playerLives,
                lastLifeRegenTimestamp: data.lastLifeRegenTimestamp,
                lastBonusClaimTimestamp: data.lastBonusClaimTimestamp,
                bonusStreak: data.bonusStreak,
                lastConversionTimestamp: data.lastConversionTimestamp,
            };
            await db.write();
            res.json(db.data.users[userId]);
        } else {
            res.status(404).json({ error: 'User not found' });
        }
    } catch (e) {
        console.error('Error in /save-data:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/', (req, res) => {
    res.send('Starfall Galaxy server is running!');
});


app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
