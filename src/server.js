const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

// Static files with Cache-Control headers to reduce bandwidth
app.use(express.static(path.join(__dirname, '../public'), {
    maxAge: '1h', // Cache static assets for 1 hour
    etag: true,
}));

// Request timeout middleware (30s max per request)
app.use((req, res, next) => {
    req.setTimeout(30000);
    res.setTimeout(30000);
    next();
});

// Lightweight Health Check for UptimeRobot / Railway
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// API: Get Party Info (XP)
app.get('/api/party', async (req, res) => {
    try {
        res.json(await db.getParty());
    } catch (err) {
        console.error('Error fetching party:', err);
        res.status(500).json({ error: 'Failed to fetch party data' });
    }
});

// API: Get User Inventory (Updated to include User details like Slots/Gold)
app.get('/api/inventory/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const items = await db.getInventory(userId);
        const user = await db.getUser(userId);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Transform MongoDB _id to id for frontend
        const transformedItems = items.map(item => ({
            ...item.toObject(),
            id: item._id.toString()
        }));

        // Also transform user _id to id
        const transformedUser = {
            ...user.toObject(),
            id: user._id.toString()
        };

        res.json({ user: transformedUser, items: transformedItems });
    } catch (err) {
        console.error('Error fetching inventory:', err);
        res.status(500).json({ error: 'Failed to fetch inventory' });
    }
});

// API: Search items in a user's inventory by name
app.get('/api/inventory/:userId/search', async (req, res) => {
    try {
        const userId = req.params.userId;
        const query = req.query.q;

        if (!query || query.trim().length === 0) {
            return res.status(400).json({ error: 'Search query (q) is required' });
        }

        const items = await db.searchItems(userId, query.trim());
        const transformedItems = items.map(item => ({
            ...item.toObject(),
            id: item._id.toString()
        }));

        res.json({ items: transformedItems });
    } catch (err) {
        console.error('Error searching inventory:', err);
        res.status(500).json({ error: 'Failed to search inventory' });
    }
});

// API: Update User Details (Gold, Slots)
app.post('/api/user/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const updates = req.body; // { gold, soulCoins, slots }

        const updatedUser = await db.updateUser(userId, updates);
        if (!updatedUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(updatedUser);
    } catch (err) {
        console.error('Error updating user:', err);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// API: Get All Users
app.get('/api/users', async (req, res) => {
    try {
        const users = await db.listUsers();
        res.json(users);
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// API: Delete User
app.delete('/api/users/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const deleted = await db.deleteUser(userId);
        res.json({ success: deleted });
    } catch (err) {
        console.error('Error deleting user:', err);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// API: Update Item
app.post('/api/items/:itemId', async (req, res) => {
    try {
        const itemId = req.params.itemId;
        const updates = req.body;

        const updated = await db.updateItem(itemId, updates);
        if (!updated) {
            return res.status(404).json({ error: 'Item not found' });
        }

        res.json(updated);
    } catch (err) {
        console.error('Error updating item:', err);
        res.status(500).json({ error: 'Failed to update item' });
    }
});

// API: Delete Item
app.delete('/api/items/:itemId', async (req, res) => {
    try {
        const itemId = req.params.itemId;
        const deleted = await db.deleteItem(itemId);

        if (!deleted) {
            return res.status(404).json({ error: 'Item not found' });
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting item:', err);
        res.status(500).json({ error: 'Failed to delete item' });
    }
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

function startServer() {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

module.exports = { startServer };
