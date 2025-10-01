const express = require('express');
const TelegramBot = require('node-telegram-bot-api');

// --- CONFIGURATION ---
// These will be set in your hosting environment (Render)
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SERVER_URL = process.env.PUBLIC_URL;

// IMPORTANT: Paste the URL of your game on Blogger here
const BLOGGER_URL = 'https://starfallgalaxy.blogspot.com';

// Your bot's username without the '@'
const BOT_USERNAME = 'starfallgalaxy_bot'; 

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
            [{ text: '🚀 Play Starfall Galaxy 🚀', web_app: { url: BLOGGER_URL } }]
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
