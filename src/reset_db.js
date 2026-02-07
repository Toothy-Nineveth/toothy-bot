require('dotenv').config();
const db = require('./db');
const User = require('./models/User');
const Item = require('./models/Item');
const Party = require('./models/Party');

async function reset() {
    console.log("⚠️ STARTING DATABASE RESET ⚠️");
    await db.connect();

    try {
        console.log("Deleting all Users...");
        await User.deleteMany({});

        console.log("Deleting all Items...");
        await Item.deleteMany({});

        // Optional: Reset Party XP? User said "clear user data", usually Party XP is separate but often linked.
        // I'll leave Party XP for now unless specified, or maybe reset it to 0. 
        // User said "clear user data", implies characters. 
        // I will NOT Reset Party XP to be safe, or maybe I should? 
        // "Clear user data" -> Users and Items. 

        console.log("✅ Database Reset Complete.");
    } catch (error) {
        console.error("Reset Failed:", error);
    }

    process.exit(0);
}

reset();
