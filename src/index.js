require('dotenv').config();
const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first'); // Force IPv4 to prevent Render/Discord connection hangs
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, Partials } = require('discord.js');
const { startServer } = require('./server');
const db = require('./db');

// Connect to DB
// Database connection managed in init()

// Config
const CHANNEL_ID = process.env.CHANNEL_ID;
const BASE_URL = process.env.BASE_URL || 'https://toothy-bot-production.up.railway.app';

// Helper: Clean Token (Strict Whitelist)
let TOKEN = process.env.DISCORD_TOKEN;
if (TOKEN) {
    // Keep only alphanumeric, dots, underscores, dashes. Remove EVERYTHING else (spaces, quotes, invisible chars).
    TOKEN = TOKEN.replace(/[^a-zA-Z0-9._-]/g, '');
}

// Prevent crash on unhandled errors (like Mongoose timeouts)
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Initialize Client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// START SERVER
// START SERVER (Managed in init)

client.on('debug', info => {
    // Filter out heartbeat messages to keep logs clean
    if (!info.includes('Heartbeat')) console.log(`[DEBUG] ${info}`);
});

client.on('error', error => {
    console.error('[CLIENT ERROR]', error);
});

// COMMANDS REGISTRATION
const commands = [
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show how to use Toothy Bot'),
    new SlashCommandBuilder()
        .setName('setup_profile')
        .setDescription('Create or update your adventurer profile')
        .addStringOption(option =>
            option.setName('name').setDescription('Your character name').setRequired(true)),
    new SlashCommandBuilder()
        .setName('inventory')
        .setDescription('Get a link to your inventory'),
    new SlashCommandBuilder()
        .setName('users')
        .setDescription('List all registered adventurers'),
    new SlashCommandBuilder()
        .setName('admin_view')
        .setDescription('View another user\'s inventory (Admin)')
        .addUserOption(option =>
            option.setName('user').setDescription('The user to view').setRequired(true)),
    new SlashCommandBuilder()
        .setName('xp')
        .setDescription('Manage Party XP')
        .addSubcommand(sub =>
            sub.setName('check').setDescription('Check current Party XP'))
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('Add XP to the party')
                .addIntegerOption(opt => opt.setName('amount').setDescription('Amount to add').setRequired(true)))
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Remove XP from the party')
                .addIntegerOption(opt => opt.setName('amount').setDescription('Amount to remove').setRequired(true))),
    new SlashCommandBuilder()
        .setName('bonus_action')
        .setDescription('Get a suggestion for your Bonus Action')
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

rest.on('rateLimited', (info) => {
    console.warn(`[RATE LIMIT] Hit limit on ${info.route}. Retry in ${info.timeToReset}ms.`);
});

// SETUP ON READY
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    console.log(`Watching channel: ${CHANNEL_ID}`);

    // Register Commands
    try {
        console.log('Started refreshing application (/) commands.');
        // Use application commands (global)
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
});

// INTERACTION HANDLER
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    // --- HELP ---
    if (interaction.commandName === 'help') {
        await interaction.deferReply({ ephemeral: true });
        const helpMessage = `
**🦷 Toothy Bot - How to Use**

**Getting Started:**
\`/setup_profile <name>\` - Create your character profile

**Managing Inventory:**
• React with ✅ to images posted in <#${CHANNEL_ID || 'the designated channel'}> to add items
• \`/inventory\` - Get a link to your web inventory
• Use the web interface to:
  - Equip/unequip items to armor slots
  - Update Gold and Soul Coins
  - Add notes to items
  - Delete items

**Party Management:**
\`/users\` - View all registered adventurers
\`/xp check\` - View party XP
\`/xp add <amount>\` - Add XP to the party
\`/xp remove <amount>\` - Remove XP from the party

**DM Tools:**
\`/admin_view @user\` - View another player's inventory
\`/bonus_action\` - Get a random bonus action suggestion

**Need more help?** Contact your DM!
        `;
        await interaction.editReply({ content: helpMessage });
    }

    // --- PROFILE ---
    else if (interaction.commandName === 'setup_profile') {
        await interaction.deferReply({ ephemeral: true });
        const name = interaction.options.getString('name');
        await db.upsertUser(interaction.user.id, name);
        await interaction.editReply({ content: `✅ Profile updated! You are now known as **${name}**.` });
    }

    // --- INVENTORY ---
    else if (interaction.commandName === 'inventory') {
        await interaction.deferReply({ ephemeral: true });
        const user = await db.getUser(interaction.user.id);
        if (!user) {
            return await interaction.editReply({ content: `❌ You don't have a profile yet! Use \`/setup_profile <name>\` first.` });
        }
        await interaction.editReply({ content: `🎒 **${user.name}'s Inventory**: ${BASE_URL}/index.html?userId=${interaction.user.id}` });
    }

    // --- USERS ---
    else if (interaction.commandName === 'users') {
        await interaction.deferReply({ ephemeral: true });
        const users = await db.listUsers();
        if (users.length === 0) return await interaction.editReply('No users registered yet.');
        const list = users.map(u => `• **${u.name}** (<@${u.id}>)`).join('\n');
        await interaction.editReply({ content: `**Registered Adventurers:**\n${list}` });
    }

    // --- ADMIN VIEW ---
    else if (interaction.commandName === 'admin_view') {
        await interaction.deferReply({ ephemeral: true });
        const targetUser = interaction.options.getUser('user');
        const user = await db.getUser(targetUser.id);
        if (!user) {
            return await interaction.editReply({ content: `❌ That user has not set up a profile.` });
        }
        await interaction.editReply({ content: `🔍 **${user.name}'s Inventory**: ${BASE_URL}/index.html?userId=${targetUser.id}` });
    }

    // --- XP ---
    else if (interaction.commandName === 'xp') {
        await interaction.deferReply();
        const sub = interaction.options.getSubcommand();

        if (sub === 'check') {
            const party = await db.getParty();
            await interaction.editReply(`🌟 **Party XP**: ${party.xp}`);
        }
        else if (sub === 'add') {
            const amount = interaction.options.getInteger('amount');
            const newParty = await db.updatePartyXP(amount);
            await interaction.editReply(`📈 Added **${amount} XP**! Total Party XP: **${newParty.xp}**`);
        }
        else if (sub === 'remove') {
            const amount = interaction.options.getInteger('amount');
            const newParty = await db.updatePartyXP(-amount);
            await interaction.editReply(`📉 Removed **${amount} XP**. Total Party XP: **${newParty.xp}**`);
        }
    }

    // --- BONUS ACTION ---
    else if (interaction.commandName === 'bonus_action') {
        const actions = [
            "**Drink a Potion**: Consume a healing potion or elixir yourself.",
            "**Shove**: Try to push a creature away or off a ledge. Make an Athletics check.\n> DC = 10 + target’s higher mod (Athletics/Acrobatics).\n> Success: Push 5 ft + 5 ft for every 2 points over DC.",
            "**Throw**: Throw an item upwards to 15 ft + 5 for every STR modifier.",
            "**Jump**: Move a distance based on your Strength.\n> Base range 15 ft + 5 ft for every 2 points of STR above 10.",
            "**Dip**: Coat your weapon in a nearby surface (fire, poison, etc.) for extra damage.\n> Typically +1d6 unless otherwise stated.",
            "**Off-hand Attack**: Make a secondary attack if you are dual-wielding.\n> Only deals base die unless you have the Dual Wielder feat."
        ];
        const randomAction = actions[Math.floor(Math.random() * actions.length)];
        await interaction.reply(`🎲 **Random Bonus Action suggestion:**\n${randomAction}`);
    }
});

// REACTION HANDLER (ADD ITEM)
client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;

    // Fetch if partial
    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (error) {
            console.error('Something went wrong when fetching the message:', error);
            return;
        }
    }

    // Check Channel & Emoji
    if (reaction.message.channelId !== CHANNEL_ID) return;
    if (reaction.emoji.name !== '✅') return;

    // Check User Profile
    const reactorProfile = await db.getUser(user.id);
    if (!reactorProfile) {
        console.log(`User ${user.tag} tried to add item but has no profile.`);
        return;
    }

    const message = reaction.message;
    if (message.attachments.size > 0) {
        for (const [key, attachment] of message.attachments) {
            if (!attachment.contentType?.startsWith('image/')) continue;

            console.log(`User ${reactorProfile.name} claiming ${attachment.name}...`);

            try {
                // Add to DB (Stateless: Use URL directly)
                await db.addItem(user.id, {
                    filename: attachment.name,
                    url: attachment.url,
                    // localPath: localPath, // Deprecated
                    sender: message.author.username,
                    content: message.content
                });
                await message.react('✅');
            } catch (e) {
                console.error("Failed to add item:", e);
            }
        }
    }
});

// STARTUP WRAPPER
async function init() {
    console.log("Starting Bot Initialization...");

    // Check Token
    if (!TOKEN) {
        console.error("❌ CRITICAL ERROR: DISCORD_TOKEN is missing from Environment Variables!");
        return;
    }
    console.log(`Token Loaded. Raw Length: ${process.env.DISCORD_TOKEN.length}, Cleaned Length: ${TOKEN.length}`);
    if (Math.abs(TOKEN.length - 70) > 5) {
        // Only warn if drastically different (e.g. <65 or >75)
        console.warn(`⚠️ Note: Token length is ${TOKEN.length}. This is usually fine if between 70-72.`);
    }
    if (process.env.DISCORD_TOKEN.length !== TOKEN.length) {
        console.warn("⚠️ Note: Trimming extra spaces/quotes from token.");
    }

    try {
        // 1. Connect to DB
        await db.connect();

        // 2. Start Server
        startServer();

        // 2.5 Connectivity Check
        try {
            console.log("Testing connection to Discord API...");
            const response = await fetch('https://discord.com/api/v10/gateway');
            console.log(`Gateway API Status: ${response.status} ${response.statusText}`);
            const data = await response.json();
            console.log(`Gateway URL: ${data.url}`);
        } catch (netErr) {
            console.error("❌ COMBAT LOG: Connectivity Check Failed!", netErr);
        }

        // 3. Login with Retry Pattern
        await loginWithRetry(TOKEN);

    } catch (error) {
        console.error("Critical Startup Error:", error);
    }
}

async function loginWithRetry(token) {
    let attempts = 0;
    while (true) {
        try {
            console.log(`📡 Attempting Discord Login (Attempt ${attempts + 1})...`);

            // Race login against 20s timeout to prevent hanging
            const loginPromise = client.login(token);
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Login timeout after 20s")), 20000)
            );

            await Promise.race([loginPromise, timeoutPromise]);
            console.log("✅ Discord Login Successful!");
            break; // Exit loop on success
        } catch (error) {
            attempts++;
            console.error(`❌ Login Failed: ${error.message}`);

            // Wait 60 seconds before retrying
            console.log("⏳ Retrying in 60 seconds...");
            await new Promise(resolve => setTimeout(resolve, 60000));
        }
    }
}


init();
