const mongoose = require('mongoose');
const User = require('./models/User');
const Item = require('./models/Item');
const Party = require('./models/Party');

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
        });
        console.log("Connected to MongoDB via Mongoose");

        mongoose.connection.on('error', err => {
            console.error('Mongoose connection error:', err);
        });
        mongoose.connection.on('disconnected', () => {
            console.warn('Mongoose disconnected');
        });
    } catch (e) {
        console.error("MongoDB Connection Error:", e);
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
    getParty,
    updatePartyXP
};
