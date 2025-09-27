// server.js
const express = require('express');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors()); // Allow requests from your game's domain

// !!! IMPORTANT: Replace with your bot token
const BOT_TOKEN = process.env.BOT_TOKEN || '8325959442:AAH_12MHRzxemyQLc6XTkoBjm9ei5lZlIr4';
const PORT = process.env.PORT || 3000;

// In-memory "database" for demonstration purposes.
// In a real application, use a persistent database like MongoDB or PostgreSQL.
const users = {}; 
// e.g., users['12345'] = { id: 12345, username: 'test', referredBy: '67890', pendingReferralRewards: 2 }

/**
 * Validates the initData string from Telegram.
 * @param {string} initData The initData string from Telegram Web App.
 * @returns {URLSearchParams | null} Parsed data if valid, null otherwise.
 */
function validateTelegramAuth(initData) {
    if (!initData) return null;

    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    params.delete('hash');

    // Sort keys alphabetically for hash calculation
    const keys = Array.from(params.keys()).sort();
    const dataCheckString = keys.map(key => `${key}=${params.get(key)}`).join('\n');
    
    try {
        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
        const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
        
        return calculatedHash === hash ? params : null;
    } catch (error) {
        console.error("Auth validation error:", error);
        return null;
    }
}

// Endpoint for new users to register and process referrals
app.post('/register', (req, res) => {
    const { initData } = req.body;
    const validatedData = validateTelegramAuth(initData);

    if (!validatedData) {
        return res.status(403).json({ error: 'Invalid authentication data' });
    }

    try {
        const user = JSON.parse(validatedData.get('user'));
        const startParam = validatedData.get('start_param');
        
        // If the user is new
        if (!users[user.id]) {
            console.log(`Registering new user: ${user.id} (${user.username})`);
            users[user.id] = {
                id: user.id,
                username: user.username || user.first_name,
                referredBy: null,
                pendingReferralRewards: 0
            };

            // If the user was referred by someone
            if (startParam && startParam.startsWith('ref_')) {
                const referrerId = startParam.split('_')[1];
                if (users[referrerId] && referrerId != user.id) {
                    console.log(`User ${user.id} was referred by ${referrerId}`);
                    users[user.id].referredBy = referrerId;
                    
                    // Credit the referrer
                    users[referrerId].pendingReferralRewards += 1;
                    console.log(`User ${referrerId} now has ${users[referrerId].pendingReferralRewards} pending rewards.`);
                }
            }
        }
        
        res.status(200).json({ message: 'User processed successfully' });
    } catch(e) {
        console.error("Error parsing user data:", e);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// Endpoint for referrers to claim their rewards
app.post('/claim-rewards', (req, res) => {
    const { initData } = req.body;
    const validatedData = validateTelegramAuth(initData);

    if (!validatedData) {
        return res.status(403).json({ error: 'Invalid authentication data' });
    }
    
    try {
        const user = JSON.parse(validatedData.get('user'));

        if (!users[user.id]) {
            // This case shouldn't happen if they call /register first, but good to handle.
            return res.status(404).json({ error: 'User not found' });
        }

        const rewardsToClaim = users[user.id].pendingReferralRewards;
        if (rewardsToClaim > 0) {
            console.log(`User ${user.id} is claiming ${rewardsToClaim} rewards.`);
            // Reset pending rewards after claiming
            users[user.id].pendingReferralRewards = 0;
            res.status(200).json({ rewards: rewardsToClaim });
        } else {
            res.status(200).json({ rewards: 0 });
        }
    } catch(e) {
        console.error("Error parsing user data:", e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/', (req, res) => {
    res.send('Starfall Galaxy Referral Server is running!');
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
