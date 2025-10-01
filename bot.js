// bot.js

// IMPORTANT: In a real project, use environment variables for your token
// For example, by using a .env file and the `dotenv` package.
const BOT_TOKEN = '8325959442:AAH_12MHRzxemyQLc6XTkoBjm9ei5lZlIr4'; // <-- PASTE YOUR TOKEN HERE
const WEB_APP_URL = 'https://starfallgalaxy.blogspot.com/'; // <-- PASTE YOUR GITHUB PAGES URL HERE

const TelegramBot = require('node-telegram-bot-api');
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// A simple in-memory database (for demonstration).
// In a real app, use a proper database like PostgreSQL, MongoDB, or Redis.
const userDatabase = {};

console.log('Bot has been started...');

// Handler for the /start command
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    // Initialize user data if they don't exist
    if (!userDatabase[userId]) {
        userDatabase[userId] = {
            stars: 0,
            invitedFriends: 0,
        };
    }
    
    const welcomeText = "Welcome to Starfall Galaxy! 🚀\n\nClick the button below to start playing.";
    
    // Create the inline keyboard with the "Play Game" button
    const options = {
        reply_markup: JSON.stringify({
            inline_keyboard: [
                [{ text: 'Launch Starfall Galaxy ✨', web_app: { url: WEB_APP_URL } }]
            ]
        })
    };

    bot.sendMessage(chatId, welcomeText, options);
});

// Handler for the /balance command
bot.onText(/\/balance/, (msg) => {
    const userId = msg.from.id;

    // Check if user exists in our simple database
    const userData = userDatabase[userId];
    if (userData) {
        bot.sendMessage(msg.chat.id, `Your current balance is: ${userData.stars} ⭐️`);
    } else {
        bot.sendMessage(msg.chat.id, "You haven't played yet! Start a game to get a balance.");
    }
});

// Handler for the /invite command (sends the user their invite link)
bot.onText(/\/invite/, (msg) => {
    const userId = msg.from.id;
    const botInfo = bot.getMe().then(info => {
        const botUsername = info.username;
        const inviteLink = `https://t.me/${botUsername}?startapp=ref_${userId}`;
        const inviteText = `Here is your personal invite link! Share it with friends. You'll get 1 ⭐️ for each new player who joins through it.\n\n${inviteLink}`;
        bot.sendMessage(msg.chat.id, inviteText);
    });
});


// THIS IS A SIMULATED ENDPOINT for the frontend to call.
// In a real app, you would build a proper API with Express.js or a similar framework.
// For now, this demonstrates how the referral logic would work if you had an API.
function confirmReferral(inviterId) {
    console.log(`Attempting to credit inviter: ${inviterId}`);
    if (userDatabase[inviterId]) {
        userDatabase[inviterId].stars += 1; // Award 1 star
        userDatabase[inviterId].invitedFriends += 1;
        console.log(`SUCCESS: User ${inviterId} now has ${userDatabase[inviterId].stars} stars.`);

        // Notify the inviter that they got a reward!
        bot.sendMessage(inviterId, "🎉 Congratulations! A friend joined using your link. You've been awarded 1 ⭐️!").catch(err => {
            console.error("Could not send reward notification to inviter:", err.message);
        });

    } else {
        console.log(`FAILED: Inviter with ID ${inviterId} not found in the database.`);
    }
}

// Example of how you would use it (this is for demonstration)
// In a real API, you would call confirmReferral(inviterId) when the frontend hits your endpoint.
// setTimeout(() => confirmReferral('SOME_USER_ID'), 5000);
