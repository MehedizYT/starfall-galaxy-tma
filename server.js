const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { JsonDB, Config } = require('node-json-db');

const app = express();
const PORT = process.env.PORT || 3000;

// --- IMPORTANT: SET THIS IN YOUR RENDER ENVIRONMENT VARIABLES ---
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
    console.error("FATAL ERROR: BOT_TOKEN is not set. Please set it in your environment variables.");
    process.exit(1);
}

// Simple file-based database
const db = new JsonDB(new Config("referralDB", true, true, '/'));

app.use(cors());
app.use(express.json());

// Function to validate the initData string from Telegram
function validateInitData(initData) {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    urlParams.delete('hash');

    const dataCheckString = Array.from(urlParams.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    return calculatedHash === hash;
}


// Endpoint for a user to register and process a potential referral
app.post('/register', async (req, res) => {
    const { initData } = req.body;

    if (!initData || !validateInitData(initData)) {
        return res.status(403).json({ error: 'Invalid Telegram data' });
    }

    const params = new URLSearchParams(initData);
    const user = JSON.parse(params.get('user'));
    const startParam = params.get('start_param');

    try {
        const userPath = `/users/${user.id}`;
        const userExists = await db.exists(userPath);

        if (userExists) {
            return res.json({ status: 'already_registered' });
        }

        // User is new, register them
        await db.push(userPath, { id: user.id, username: user.username, rewardsToClaim: 0 });

        // If they were referred, credit the inviter
        if (startParam && startParam.startsWith('ref_')) {
            const inviterId = startParam.split('_')[1];
            if (inviterId && inviterId != user.id) {
                const inviterPath = `/users/${inviterId}`;
                const inviterExists = await db.exists(inviterPath);
                
                // Make sure the inviter is also a user in our system
                if (inviterExists) {
                    await db.push(`${inviterPath}/rewardsToClaim`, (await db.getData(`${inviterPath}/rewardsToClaim`)) + 1);
                }
            }
        }
        
        res.json({ status: 'registered_successfully' });

    } catch (error) {
        console.error("Error in /register:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// Endpoint for an existing user to claim their accumulated rewards
app.post('/claim-rewards', async (req, res) => {
    const { initData } = req.body;

    if (!initData || !validateInitData(initData)) {
        return res.status(403).json({ error: 'Invalid Telegram data' });
    }

    const params = new URLSearchParams(initData);
    const user = JSON.parse(params.get('user'));

    try {
        const userPath = `/users/${user.id}`;
        const userExists = await db.exists(userPath);

        if (!userExists) {
            return res.json({ rewards: 0 }); // Should not happen if they registered, but handle it
        }

        const rewards = await db.getData(`${userPath}/rewardsToClaim`);

        if (rewards > 0) {
            // Reset rewards to 0 after claiming
            await db.push(`${userPath}/rewardsToClaim`, 0);
        }

        res.json({ rewards: rewards });

    } catch (error) {
        console.error("Error in /claim-rewards:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Health check endpoint for Render
app.get('/', (req, res) => {
    res.send('Starfall Galaxy Server is running!');
});

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
