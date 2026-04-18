const mongoose = require('mongoose');
const User = require('./models/User');
const Item = require('./models/Item');
const Party = require('./models/Party');

// Fail fast instead of buffering commands when disconnected (saves Railway compute)
mongoose.set('bufferCommands', false);

// Connect to MongoDB
async function connect() {
    if (!process.env.MONGODB_URI) {
        console.error("Missing MONGODB_URI in .env");
        return;
    }
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            heartbeatFrequencyMS: 30000, // Reduce heartbeat frequency to save bandwidth
        });
        console.log("Connected to MongoDB via Mongoose");

        mongoose.connection.on('error', err => {
            console.error('Mongoose connection error:', err);
        });
        mongoose.connection.on('disconnected', () => {
            console.warn('Mongoose disconnected. Will auto-reconnect...');
        });
        mongoose.connection.on('reconnected', () => {
            console.log('Mongoose reconnected successfully.');
        });
    } catch (e) {
        console.error("MongoDB Connection Error:", e);
    }
}

// Graceful disconnect
async function disconnect() {
    try {
        await mongoose.connection.close();
        console.log('MongoDB connection closed gracefully.');
    } catch (e) {
        console.error('Error closing MongoDB connection:', e);
    }
}

// User Methods
async function upsertUser(discordId, name) {
    let user = await User.findById(discordId);
    if (!user) {
        user = new User({ _id: discordId, name, slots: {} });
    } else {
        user.name = name; // Update name
    }
    await user.save();
    return user;
}

async function getUser(discordId) {
    return await User.findById(discordId);
}

async function updateUser(discordId, updates) {
    return await User.findByIdAndUpdate(discordId, updates, { new: true });
}

async function listUsers() {
    return await User.find({});
}

async function deleteUser(discordId) {
    const user = await User.findByIdAndDelete(discordId);
    if (user) {
        await Item.deleteMany({ userId: discordId }); // Delete items too!
        return true;
    }
    return false;
}

// Item Methods
async function addItem(userId, itemData) {
    const newItem = new Item({
        userId,
        ...itemData
    });
    await newItem.save();
    return newItem;
}

async function getInventory(userId) {
    return await Item.find({ userId }).sort({ timestamp: -1 });
}

async function getItem(itemId) {
    return await Item.findById(itemId);
}

async function updateItem(itemId, updates) {
    return await Item.findByIdAndUpdate(itemId, updates, { new: true });
}

async function deleteItem(itemId) {
    const res = await Item.deleteOne({ _id: itemId });
    return res.deletedCount > 0;
}

async function deleteAllUserItems(userId) {
    const res = await Item.deleteMany({ userId });
    return res.deletedCount;
}

// Search items by name (case-insensitive, partial match)
async function searchItems(userId, query) {
    const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    return await Item.find({ userId, filename: regex }).sort({ timestamp: -1 });
}

// Party Methods
async function getParty() {
    let party = await Party.findOne();
    if (!party) {
        party = new Party({ xp: 0 });
        await party.save();
    }
    return party;
}

async function updatePartyXP(amount) {
    const party = await getParty();
    party.xp += amount;
    await party.save();
    return party;
}

module.exports = {
    connect,
    disconnect,
    upsertUser,
    getUser,
    updateUser,
    listUsers,
    deleteUser,
    addItem,
    getInventory,
    getItem,
    updateItem,
    deleteItem,
    deleteAllUserItems,
    searchItems,
    getParty,
    updatePartyXP,
    clearAllItems: async function () {
        const res = await Item.deleteMany({});
        return res.deletedCount;
    }
};
