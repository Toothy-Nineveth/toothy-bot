require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./db');
const User = require('./models/User');
const Item = require('./models/Item');
const Party = require('./models/Party');

const DATA_FILE = path.join(__dirname, '../data/db.json');

async function migrate() {
    console.log("Starting Migration...");

    if (!fs.existsSync(DATA_FILE)) {
        console.error("No local data found at data/db.json. Nothing to migrate.");
        return;
    }

    // Connect to Mongo
    await db.connect();

    // Read Local Data
    const localData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

    // 1. Migrate Users
    console.log(`Migrating ${localData.users.length} users...`);
    for (const u of localData.users) {
        await db.upsertUser(u.id, u.name);
        // Direct update for extra fields since upsert is safe but simple
        await User.findByIdAndUpdate(u.id, {
            gold: u.gold || 0,
            soulCoins: u.soulCoins || 0,
            slots: u.slots || {}
        });
    }

    // 2. Migrate Items
    console.log(`Migrating ${localData.items.length} items...`);
    for (const i of localData.items) {
        // Ensure URL exists (fallback to localPath if url missing, but for cloud usage we need real URL)
        // If 'url' is missing but we have localPath, we can't really restore the image easily on cloud without re-uploading.
        // Assuming 'url' (Discord Link) was saved in previous versions (checked: yes, it was).
        await db.addItem(i.userId, {
            filename: i.filename,
            url: i.url,
            content: i.content,
            sender: i.sender,
            quantity: i.quantity || 1,
            notes: i.notes || ''
        });
    }

    // 3. Migrate Party
    if (localData.party) {
        console.log(`Migrating Party XP: ${localData.party.xp}`);
        const party = await db.getParty();
        party.xp = localData.party.xp;
        await party.save();
    }

    console.log("Migration Complete!");
    process.exit(0);
}

migrate().catch(err => {
    console.error("Migration Failed:", err);
    process.exit(1);
});
