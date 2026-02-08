const mongoose = require('mongoose');

const ItemSchema = new mongoose.Schema({
    userId: { type: String, required: true, ref: 'User' },
    filename: String,
    url: String, // Discord CDN URL
    messageId: String, // Original message ID for URL refresh
    channelId: String, // Original channel ID
    localPath: String, // Deprecated, kept for migration
    content: String,
    sender: String,
    timestamp: { type: Date, default: Date.now },
    quantity: { type: Number, default: 1 },
    notes: { type: String, default: '' }
});

module.exports = mongoose.model('Item', ItemSchema);
