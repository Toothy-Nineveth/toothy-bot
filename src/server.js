const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../public')));

// API: Get Party Info (XP)
app.get('/api/party', async (req, res) => {
    res.json(await db.getParty());
});

// API: Get User Inventory (Updated to include User details like Slots/Gold)
app.get('/api/inventory/:userId', async (req, res) => {
    const userId = req.params.userId;
    const items = await db.getInventory(userId);
    const user = await db.getUser(userId);

    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user, items });
});

// API: Update User Details (Gold, Slots)
app.post('/api/user/:userId', async (req, res) => {
    const userId = req.params.userId;
    const updates = req.body; // { gold, soulCoins, slots }

    const updatedUser = await db.updateUser(userId, updates);
    if (!updatedUser) {
        return res.status(404).json({ error: 'User not found' });
    }
    res.json(updatedUser);
});

// API: Get All Users
app.get('/api/users', async (req, res) => {
    const users = await db.listUsers();
    res.json(users);
});

// API: Delete User
app.delete('/api/users/:userId', async (req, res) => {
    const userId = req.params.userId;
    const deleted = await db.deleteUser(userId);
    res.json({ success: deleted });
});

// API: Update Item
app.post('/api/items/:itemId', async (req, res) => {
    const itemId = req.params.itemId;
    const updates = req.body;

    const updated = await db.updateItem(itemId, updates);
    if (!updated) {
        return res.status(404).json({ error: 'Item not found' });
    }

    res.json(updated);
});

// API: Delete Item
app.delete('/api/items/:itemId', async (req, res) => {
    const itemId = req.params.itemId;
    const deleted = await db.deleteItem(itemId);

    if (!deleted) {
        return res.status(404).json({ error: 'Item not found' });
    }

    res.json({ success: true });
});

function startServer() {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

module.exports = { startServer };
