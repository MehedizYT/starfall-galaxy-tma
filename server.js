// -------------------------------------------------------------------
// STARFALL GALAXY - BACKEND SERVER (v2.1 - Corrected for Debugging)
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
// ========================================================================
// !! IMPORTANT !! FILL THESE THREE VALUES IN CORRECTLY.
// You can set them here or as Environment Variables on Render.com.
// ========================================================================

// Your Telegram Bot Token from @BotFather
const BOT_TOKEN = process.env.BOT_TOKEN || '8325959442:AAH_12MHRzxemyQLc6XTkoBjm9ei5lZlIr4';

// The public URL where your index.html game is hosted (e.g., from Netlify/Vercel)
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://starfallgalaxy.blogspot.com';

// Your bot's exact username from Telegram (e.g., 'StarfallGalaxy_bot')
const BOT_USERNAME = process.env.BOT_USERNAME || 'starfallgalaxy_bot'; 

// ========================================================================

const REFERRER_BONUS = 1.0;
const REFEREE_BONUS = 0.5;
const PORT = process.env.PORT || 3000;

// --- 3. DATABASE SETUP ---
const adapter = new JSONFile('db.json');
const defaultData = { users: {} };
const db = new Low(adapter, defaultData);

async function getOrCreateUser(userId) {
    if (!db.data.users[userId]) {
        db.data.users[userId] = { id: userId, is_bot: false, first_name: '', username: '', stars: 0.0, unclaimedRewards: 0.0, registeredInGame: false, referrer: null, referrals: [], createdAt: new Date().toISOString() };
        await db.write();
    }
    return db.data.users[userId];
}

// --- 4. TELEGRAM BOT SETUP ---
const bot = new Telegraf(BOT_TOKEN);

bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const startPayload = ctx.startPayload;
    const user = await getOrCreateUser(userId);
    user.first_name = ctx.from.first_name;
    user.username = ctx.from.username;
    user.is_bot = ctx.from.is_bot;
    if (startPayload && startPayload.startsWith('ref_')) {
        const referrerId = startPayload.substring(4);
        if (referrerId && Number(referrerId) !== userId && !user.referrer) {
            const referrer = await getOrCreateUser(referrerId);
            if (referrer) { user.referrer = referrerId; console.log(`User ${userId} was referred by ${referrerId}. This will be processed upon game registration.`); }
        }
    }
    await db.write();
    await ctx.reply("🚀 Welcome to Starfall Galaxy!\n\nClick the button below to start your adventure!", Markup.inlineKeyboard([Markup.button.webApp('🌟 Play Now! 🌟', WEB_APP_URL)]));
});

bot.command('invite', async (ctx) => {
    const userId = ctx.from.id;
    // The link is constructed here. If BOT_USERNAME is wrong, the link will be broken.
    const referralLink = `https://t.me/${BOT_USERNAME}?start=ref_${userId}`;
    const inviteMessage = `🎉 *Invite Your Friends to Starfall Galaxy!* 🎉\n\nShare your personal link with your friends.\n\n*Your Invite Link:*\n${referralLink}\n\n*How it works:*\n- Your friend gets *${REFEREE_BONUS} ⭐️* for joining.\n- You get *${REFERRER_BONUS} ⭐️* after they play the game for the first time!`;
    try { await ctx.replyWithMarkdown(inviteMessage, { disable_web_page_preview: true }); } catch (error) { console.error(`Failed to send invite message to ${userId}:`, error); }
});

bot.command('stats', async (ctx) => {
    const userId = ctx.from.id; const user = db.data.users[userId];
    if (!user) { return ctx.reply("You haven't played yet! Type /start and launch the game to begin."); }
    const statsMessage = `📊 *Your Starfall Stats* 📊\n\n⭐️ *Total Stars Earned:* ${user.stars.toFixed(4)}\n💰 *Unclaimed Referral Rewards:* ${user.unclaimedRewards.toFixed(4)}\n👥 *Friends Invited:* ${user.referrals.length}`;
    return ctx.replyWithMarkdown(statsMessage);
});

// --- 5. EXPRESS API SERVER SETUP ---
const app = express(); app.use(cors()); app.use(bodyParser.json());
function isInitDataValid(initData) { const data = new URLSearchParams(initData); const hash = data.get('hash'); data.delete('hash'); const sortedKeys = Array.from(data.keys()).sort(); let dataCheckString = sortedKeys.map(key => `${key}=${data.get(key)}`).join('\n'); const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest(); const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex'); return calculatedHash === hash; }

app.post('/register', async (req, res) => {
    const { initData } = req.body;
    if (!initData || !isInitDataValid(initData)) { return res.status(401).json({ error: 'Invalid authentication data' }); }
    const userObject = JSON.parse(new URLSearchParams(initData).get('user')); const userId = userObject.id; const user = await getOrCreateUser(userId);
    if (!user.registeredInGame && user.referrer) {
        const referrer = db.data.users[user.referrer];
        if (referrer) {
            referrer.unclaimedRewards = (referrer.unclaimedRewards || 0) + REFERRER_BONUS; referrer.referrals.push(userId); console.log(`Referrer ${user.referrer} credited ${REFERRER_BONUS} stars for new player ${userId}.`);
            bot.telegram.sendMessage(user.referrer, `🎉 Congratulations! Your friend ${user.first_name || 'Anonymous'} has joined Starfall Galaxy. You've earned ${REFERRER_BONUS} ⭐️! Claim it in the game.`).catch(err => console.log(`Could not notify referrer ${user.referrer}: ${err.message}`));
        }
    }
    user.registeredInGame = true; await db.write();
    res.status(200).json({ message: 'User registration processed successfully' });
});

app.post('/claim-rewards', async (req, res) => {
    const { initData } = req.body;
    if (!initData || !isInitDataValid(initData)) { return res.status(401).json({ error: 'Invalid authentication data' }); }
    const userObject = JSON.parse(new URLSearchParams(initData).get('user')); const userId = userObject.id; const user = await getOrCreateUser(userId);
    const rewardsToClaim = user.unclaimedRewards || 0;
    if (rewardsToClaim > 0) {
        user.unclaimedRewards = 0; await db.write(); console.log(`User ${userId} claimed ${rewardsToClaim} stars from referrals.`); return res.status(200).json({ rewards: rewardsToClaim });
    }
    res.status(200).json({ rewards: 0 });
});

// --- 6. START EVERYTHING ---
async function startServer() { await db.read(); app.listen(PORT, () => console.log(`✅ API Server is running on port ${PORT}`)); bot.launch(() => console.log('✅ Telegram Bot is running')); }
startServer();
process.once('SIGINT', () => bot.stop('SIGINT')); process.once('SIGTERM', () => bot.stop('SIGTERM'));
