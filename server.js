// -------------------------------------------------------------------
// STARFALL GALAXY - BACKEND SERVER (v2 with Referral System)
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
const BOT_TOKEN = process.env.BOT_TOKEN || '8325959442:AAH_12MHRzxemyQLc6XTkoBjm9ei5lZlIr4';
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://starfallgalaxy.blogspot.com';
// --- NEW: Add your bot's username (without the '@') ---
const BOT_USERNAME = process.env.BOT_USERNAME || 'starfallgalaxy_bot'; // e.g., 'StarfallGalaxyBot'

const REFERRER_BONUS = 1.0;  // Bonus for the person who invites
const REFEREE_BONUS = 0.5;   // Bonus for the new player who joins (handled by frontend)
const PORT = process.env.PORT || 3000;

// --- 3. DATABASE SETUP ---
const adapter = new JSONFile('db.json');
const defaultData = { users: {} };
const db = new Low(adapter, defaultData);

async function getOrCreateUser(userId) {
    if (!db.data.users[userId]) {
        db.data.users[userId] = {
            id: userId,
            is_bot: false, // You can get this from the user object
            first_name: '', // You can get this from the user object
            username: '', // You can get this from the user object
            stars: 0.0,
            unclaimedRewards: 0.0,
            registeredInGame: false,
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

// --- MODIFIED: '/start' command handler to process referrals ---
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const startPayload = ctx.startPayload;
    
    // Get or create user and update their details from Telegram
    const user = await getOrCreateUser(userId);
    user.first_name = ctx.from.first_name;
    user.username = ctx.from.username;
    user.is_bot = ctx.from.is_bot;

    // Handle referral logic
    if (startPayload && startPayload.startsWith('ref_')) {
        const referrerId = startPayload.substring(4);
        // A user cannot refer themselves, and can only have one referrer
        if (referrerId && Number(referrerId) !== userId && !user.referrer) {
            const referrer = await getOrCreateUser(referrerId);
            if (referrer) {
                user.referrer = referrerId;
                console.log(`User ${userId} was referred by ${referrerId}. This will be processed upon game registration.`);
            }
        }
    }

    await db.write();

    await ctx.reply(
        "🚀 Welcome to Starfall Galaxy!\n\nCatch falling stars, avoid bombs, and earn real rewards. Click the button below to start your adventure!",
        Markup.inlineKeyboard([
            Markup.button.webApp('🌟 Play Now! 🌟', WEB_APP_URL)
        ])
    );
});

// --- NEW: '/invite' command to get referral link ---
bot.command('invite', async (ctx) => {
    const userId = ctx.from.id;
    const referralLink = `https://t.me/${BOT_USERNAME}?start=ref_${userId}`;

    const inviteMessage = `
🎉 *Invite Your Friends to Starfall Galaxy!* 🎉

Share your personal link with your friends.

*Your Invite Link:*
${referralLink}

*How it works:*
- Your friend gets *${REFEREE_BONUS} ⭐️* for joining.
- You get *${REFERRER_BONUS} ⭐️* after they play the game for the first time!

Share the fun and earn rewards together! 🚀
    `;

    try {
        await ctx.replyWithMarkdown(inviteMessage, { disable_web_page_preview: true });
    } catch (error) {
        console.error(`Failed to send invite message to ${userId}:`, error);
    }
});


bot.command('stats', async (ctx) => {
    const userId = ctx.from.id;
    const user = db.data.users[userId];

    if (!user) {
        return ctx.reply("You haven't played yet! Type /start and launch the game to begin.");
    }
    
    const statsMessage = `
📊 *Your Starfall Stats* 📊

⭐️ *Total Stars Earned:* ${user.stars.toFixed(4)}
💰 *Unclaimed Referral Rewards:* ${user.unclaimedRewards.toFixed(4)}
👥 *Friends Invited:* ${user.referrals.length}

*Note:* Total stars reflects your balance on our server. Your in-game balance may differ until the next automatic sync.
    `;
    
    return ctx.replyWithMarkdown(statsMessage);
});


// --- 5. EXPRESS API SERVER SETUP ---
const app = express();
app.use(cors());
app.use(bodyParser.json());

function isInitDataValid(initData) {
    // [This function remains unchanged, keeping it for brevity]
    const data = new URLSearchParams(initData); const hash = data.get('hash'); data.delete('hash'); const sortedKeys = Array.from(data.keys()).sort(); let dataCheckString = sortedKeys.map(key => `${key}=${data.get(key)}`).join('\n'); const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest(); const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex'); return calculatedHash === hash;
}

// --- MODIFIED: /register endpoint to process referral bonus ---
app.post('/register', async (req, res) => {
    const { initData } = req.body;

    if (!initData || !isInitDataValid(initData)) {
        return res.status(401).json({ error: 'Invalid authentication data' });
    }

    const data = new URLSearchParams(initData);
    const userObject = JSON.parse(data.get('user'));
    const userId = userObject.id;

    const user = await getOrCreateUser(userId);

    // If user is new to the game, has a referrer, and we haven't processed this before
    if (!user.registeredInGame && user.referrer) {
        const referrer = db.data.users[user.referrer];
        if (referrer) {
            referrer.unclaimedRewards = (referrer.unclaimedRewards || 0) + REFERRER_BONUS;
            referrer.referrals.push(userId); // Add to the list of successful referrals
            
            console.log(`Referrer ${user.referrer} credited ${REFERRER_BONUS} stars for new player ${userId}.`);
            
            // Send a notification to the referrer via the bot
            bot.telegram.sendMessage(
                user.referrer,
                `🎉 Congratulations! Your friend ${user.first_name} has joined Starfall Galaxy. You've earned ${REFERRER_BONUS} ⭐️! You can claim it the next time you open the game.`
            ).catch(err => console.log(`Could not notify referrer ${user.referrer}: ${err.message}`));
        }
    }
    
    user.registeredInGame = true;
    await db.write();

    console.log(`User ${userId} registered or logged in via the game.`);
    res.status(200).json({ message: 'User registration processed successfully' });
});


// --- /claim-rewards endpoint (remains the same, but is now more important) ---
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
        // Here you would normally add to the main star balance.
        // Since the frontend manages the star balance, we just return the reward.
        // The frontend will add this to its local `telegramStars` count.
        user.unclaimedRewards = 0;
        await db.write();
        console.log(`User ${userId} claimed ${rewardsToClaim} stars from referrals.`);
        return res.status(200).json({ rewards: rewardsToClaim });
    }

    res.status(200).json({ rewards: 0 });
});


// --- 6. START EVERYTHING ---
async function startServer() {
    await db.read();
    
    app.listen(PORT, () => {
        console.log(`✅ API Server is running on port ${PORT}`);
    });
    
    bot.launch(() => {
        console.log('✅ Telegram Bot is running');
    });
}

startServer();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
