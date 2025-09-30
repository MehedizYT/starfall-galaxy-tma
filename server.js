const express = require('express');
const crypto = require('crypto');
const cors = require('cors');
const Database = require('better-sqlite3');

const app = express();
const port = process.env.PORT || 3000;

// IMPORTANT: Set this in your Render Environment Variables
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
    console.error("FATAL ERROR: BOT_TOKEN environment variable is not set.");
    process.exit(1);
}

// Database setup (Render will create this file in its persistent storage)
const db = new Database('starfall.db');

// Create table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT,
    is_bot BOOLEAN,
    first_name TEXT,
    last_name TEXT,
    language_code TEXT,
    starCrystals REAL DEFAULT 0,
    telegramStars REAL DEFAULT 0,
    ownedSkins TEXT DEFAULT '["default"]',
    equippedSkin TEXT DEFAULT 'default',
    isSoundEnabled BOOLEAN DEFAULT 1,
    isGamingFontEnabled BOOLEAN DEFAULT 1,
    hasSeenTutorial BOOLEAN DEFAULT 0,
    playerLives INTEGER DEFAULT 5,
    lastLifeRegenTimestamp INTEGER DEFAULT 0,
    lastBonusClaimTimestamp INTEGER DEFAULT 0,
    bonusStreak INTEGER DEFAULT 0,
    lastConversionTimestamp INTEGER DEFAULT 0,
    crateAdWatchCount INTEGER DEFAULT 0,
    createdAt INTEGER,
    lastLoginAt INTEGER
  )
`);

app.use(cors());
app.use(express.json());

// --- UTILITY: TELEGRAM INITDATA VALIDATION ---
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


// --- API ENDPOINTS ---

// GET / : Basic health check
app.get('/', (req, res) => {
    res.send('Starfall Galaxy Backend is running!');
});

// POST /api/login : Load user data or create a new user
app.post('/api/login', (req, res) => {
    const { initData } = req.body;
    if (!initData || !validateInitData(initData)) {
        return res.status(403).json({ error: 'Invalid initData' });
    }

    const params = new URLSearchParams(initData);
    const user = JSON.parse(params.get('user'));
    
    let isNewUser = false;
    let stmt = db.prepare('SELECT * FROM users WHERE id = ?');
    let userData = stmt.get(user.id);

    if (!userData) {
        isNewUser = true;
        const now = Date.now();
        stmt = db.prepare(`
            INSERT INTO users (id, username, first_name, last_name, language_code, lastLifeRegenTimestamp, lastConversionTimestamp, createdAt, lastLoginAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(user.id, user.username, user.first_name, user.last_name, user.language_code, now, now, now, now);
        
        // Re-fetch to get default values
        stmt = db.prepare('SELECT * FROM users WHERE id = ?');
        userData = stmt.get(user.id);
    } else {
        stmt = db.prepare('UPDATE users SET lastLoginAt = ? WHERE id = ?');
        stmt.run(Date.now(), user.id);
    }

    res.json({
        ...userData,
        ownedSkins: JSON.parse(userData.ownedSkins),
        settings: {
            isSoundEnabled: !!userData.isSoundEnabled,
            isGamingFontEnabled: !!userData.isGamingFontEnabled
        },
        progress: {
            hasSeenTutorial: !!userData.hasSeenTutorial
        },
        isNewUser: isNewUser
    });
});

// POST /api/save : Save user's game state
app.post('/api/save', (req, res) => {
    const { initData, gameState } = req.body;
    if (!initData || !validateInitData(initData)) {
        return res.status(403).json({ error: 'Invalid initData' });
    }
    const user = JSON.parse(new URLSearchParams(initData).get('user'));

    const stmt = db.prepare(`
        UPDATE users SET
            starCrystals = ?, telegramStars = ?, ownedSkins = ?, equippedSkin = ?,
            isSoundEnabled = ?, isGamingFontEnabled = ?, hasSeenTutorial = ?,
            playerLives = ?, lastLifeRegenTimestamp = ?, lastBonusClaimTimestamp = ?,
            bonusStreak = ?, lastConversionTimestamp = ?, crateAdWatchCount = ?
        WHERE id = ?
    `);
    
    stmt.run(
        gameState.starCrystals, gameState.telegramStars, JSON.stringify(gameState.ownedSkins), gameState.equippedSkin,
        gameState.settings.isSoundEnabled ? 1 : 0, gameState.settings.isGamingFontEnabled ? 1 : 0, gameState.progress.hasSeenTutorial ? 1 : 0,
        gameState.playerLives, gameState.lastLifeRegenTimestamp, gameState.lastBonusClaimTimestamp,
        gameState.bonusStreak, gameState.lastConversionTimestamp, gameState.crateAdWatchCount,
        user.id
    );

    res.status(200).json({ success: true });
});

// POST /api/referral : Credit the inviter
app.post('/api/referral', (req, res) => {
    const { initData, startParam } = req.body;
    if (!initData || !validateInitData(initData) || !startParam) {
        return res.status(403).json({ error: 'Invalid request' });
    }

    const inviterId = startParam.split('_')[1];
    if (!inviterId || isNaN(inviterId)) {
        return res.status(400).json({ error: 'Invalid referral code' });
    }

    // Add 1 Telegram Star to the inviter's account
    const stmt = db.prepare('UPDATE users SET telegramStars = telegramStars + 1 WHERE id = ?');
    const result = stmt.run(parseInt(inviterId, 10));

    if (result.changes > 0) {
        console.log(`Credited 1 star to inviter ID: ${inviterId}`);
        res.status(200).json({ success: true });
    } else {
        console.log(`Inviter ID not found: ${inviterId}`);
        res.status(404).json({ error: 'Inviter not found' });
    }
});


app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
