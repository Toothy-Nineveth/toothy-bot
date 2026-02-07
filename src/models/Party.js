const mongoose = require('mongoose');

const PartySchema = new mongoose.Schema({
    name: { type: String, default: 'The Party' },
    xp: { type: Number, default: 0 }
});

module.exports = mongoose.model('Party', PartySchema);
