const express = require('express');
const TelegramBot = require('node-telegram-bot-api');

// --- CONFIGURATION ---
// These will be set in your hosting environment (Render)
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SERVER_URL = process.env.PUBLIC_URL;

// IMPORTANT: Paste the URL of your game on Blogger here
const BLOGGER_URL = 'https://starfallgalaxy.blogspot.com';

const BOT_USERNAME = 'starfallgalaxy_bot'; // Your bot's username

// --- SERVER & BOT INITIALIZATION ---
const bot = new TelegramBot(TOKEN);
const app = express();

// This is the webhook endpoint that Telegram will send updates to
app.use(express.json());
app.post(`/bot${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// --- BOT LOGIC ---

// Create the button that opens your game
const gameKeyboard = {
    reply_markup: {
        inline_keyboard: [
            [{ text: '🌟 Play Starfall Galaxy 🌟', web_app: { url: BLOGGER_URL } }]
        ]
    }
};

// Command: /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const welcomeMessage = "Welcome to Starfall Galaxy! ✨\n\nCatch falling stars, avoid bombs, and earn rewards. Click the button below to start playing!";
    bot.sendMessage(chatId, welcomeMessage, gameKeyboard);
});

// Command: /play
bot.onText(/\/play/, (msg) => {
    bot.sendMessage(msg.chat.id, "Click below to jump into the action!", gameKeyboard);
});

// Command: /invite
bot.onText(/\/invite/, (msg) => {
    const chatId = msg.chat.id;
    // This creates the link a user can share. Example: https://t.me/starfallgalaxy_bot?start=SFG1a2b3c
    // The user's unique referral ID is generated and stored inside the game on Blogger.
    // This command just provides the bot link for convenience.
    const message = `To invite friends, open the game, go to the "Friends" screen, and share your personal link!`;
    bot.sendMessage(chatId, message, gameKeyboard);
});


// --- START THE SERVER ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`Server is running on port ${PORT}`);
    // Set the webhook. This tells Telegram where to send messages.
    try {
        const webhookUrl = `${SERVER_URL}/bot${TOKEN}`;
        await bot.setWebHook(webhookUrl);
        console.log(`Webhook set to ${webhookUrl}`);
    } catch (error) {
        console.error('Error setting webhook:', error.message);
    }
});
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
    const { referrerId, newUserId } = req.body;

    if (!referrerId || !newUserId || referrerId === newUserId) {
        return res.status(400).json({ message: 'Invalid referral data' });
    }
    
    const db = readDb();

    if (!db.users[referrerId]) return res.status(404).json({ message: 'Referrer not found' });
    if (!db.users[newUserId]) db.users[newUserId] = getInitialUserState();
    if (db.users[newUserId].referredBy) return res.status(409).json({ message: 'User has already been referred' });

    db.users[newUserId].referredBy = referrerId;
    db.users[referrerId].telegramStars = (db.users[referrerId].telegramStars || 0) + 1;
    
    writeDb(db);

    bot.sendMessage(referrerId, `🎉 A friend has joined using your link! You've earned 1 ⭐️!`).catch(err => {
        console.log(`Could not send message to referrer ${referrerId}:`, err.message);
    });

    res.status(200).json({ message: 'Referral processed successfully' });
});

// --- NEW API ENDPOINT ---
// GET the number of friends a user has referred
app.get('/api/user/:userId/referrals', validationMiddleware, (req, res) => {
    const { userId } = req.params;
    const db = readDb();
    
    const referredUsers = Object.values(db.users).filter(user => user.referredBy === userId);
    
    res.status(200).json({ count: referredUsers.length });
});


// --- START SERVER ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});            ]
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
