const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    _id: { type: String, required: true }, // Discord ID
    name: String,
    gold: { type: Number, default: 0 },
    soulCoins: { type: Number, default: 0 },
    slots: { type: Map, of: String } // Map of SlotName -> ItemID
});

module.exports = mongoose.model('User', UserSchema);
