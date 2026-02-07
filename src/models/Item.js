const mongoose = require('mongoose');

const ItemSchema = new mongoose.Schema({
    userId: { type: String, required: true, ref: 'User' },
    filename: String,
    url: String, // Discord CDN URL
    localPath: String, // Deprecated, kept for migration
    content: String,
    sender: String,
    timestamp: { type: Date, default: Date.now },
    quantity: { type: Number, default: 1 },
    notes: { type: String, default: '' }
});

module.exports = mongoose.model('Item', ItemSchema);
