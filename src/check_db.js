require('dotenv').config();
const db = require('./db');
const User = require('./models/User');

async function check() {
    await db.connect();

    console.log("Checking Users...");
    const users = await User.find({});
    console.log("Users found:", users.length);
    console.log(JSON.stringify(users, null, 2));

    process.exit(0);
}

check();
