// --- ADD THIS CODE TO YOUR server.js FILE ---

// Securely store item prices on the server, not the client
const ITEM_PRICES = {
    'crate': 150,
    'golden': 250,
    'rainbow': 400,
    'tech': 500,
    'claw': 750,
    'crown': 1000
};

// Endpoint to create a Telegram Stars invoice link
app.post('/create-invoice', async (req, res) => {
    const { initData, itemId } = req.body;

    if (!initData || !validateInitData(initData)) {
        return res.status(403).json({ error: 'Invalid Telegram data' });
    }

    const price = ITEM_PRICES[itemId];
    if (!price) {
        return res.status(404).json({ error: 'Item not found or not for sale' });
    }

    try {
        const telegramApiUrl = `https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`;

        const invoicePayload = {
            title: `Starfall Galaxy Item`,
            description: `Purchase of ${itemId} bucket for ${price} Stars.`,
            payload: `purchase_${itemId}_${new Date().getTime()}`, // Unique payload
            provider_token: '', // Leave empty for Telegram Stars
            currency: 'XTR', // Special currency code for Telegram Stars
            prices: [{ label: 'Total Price', amount: price }]
        };

        const response = await fetch(telegramApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(invoicePayload)
        });

        const data = await response.json();

        if (data.ok) {
            res.json({ invoiceUrl: data.result });
        } else {
            console.error("Telegram API Error:", data.description);
            res.status(500).json({ error: 'Failed to create invoice link' });
        }

    } catch (error) {
        console.error("Error in /create-invoice:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
