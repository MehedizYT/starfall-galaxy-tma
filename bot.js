// bot.js
const { Telegraf } = require('telegraf');

// !!! IMPORTANT: Replace with your bot token from BotFather
const BOT_TOKEN = process.env.BOT_TOKEN || '8325959442:AAH_12MHRzxemyQLc6XTkoBjm9ei5lZlIr4';
// !!! IMPORTANT: Replace with your bot's username
const BOT_USERNAME = 'starfallgalaxy_bot'; 

const bot = new Telegraf(BOT_TOKEN);

// The URL to your Web App
const WEB_APP_URL = `https://t.me/${BOT_USERNAME}/play`;

// Handle the /start command
bot.start((ctx) => {
    ctx.reply('Welcome to Starfall Galaxy! 🚀', {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Launch Game ✨', web_app: { url: WEB_APP_URL } }]
            ]
        }
    });
});

// Handle the /invite command
bot.command('invite', (ctx) => {
    const userId = ctx.from.id;
    const referralLink = `${WEB_APP_URL}?startapp=ref_${userId}`;
    const inviteMessage = `Here is your personal invite link!\n\nShare it with your friends. When they join, they get 0.5⭐️ and you get 1⭐️!\n\n${referralLink}`;
    
    ctx.reply(inviteMessage, {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Share with a Friend', switch_inline_query: `Come play Starfall Galaxy with me! ${referralLink}` }]
            ]
        }
    });
});


bot.launch().then(() => {
    console.log('Telegram bot started successfully!');
}).catch(err => {
    console.error('Failed to start bot:', err);
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
