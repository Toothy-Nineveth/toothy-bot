require('dotenv').config();
const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first'); // Force IPv4 to prevent Render/Discord connection hangs
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, Partials, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { startServer } = require('./server');
const db = require('./db');
const { scheduleHoroscope, sendHoroscope } = require('./horoscope');
const { uploadToCloudinary } = require('./cloudinary');

// Connect to DB
// Database connection managed in init()

// Config
const CHANNEL_IDS = process.env.CHANNEL_ID ? process.env.CHANNEL_ID.split(',').map(id => id.trim()) : [];
const BASE_URL = process.env.BASE_URL || 'https://toothy-bot-production.up.railway.app';
const MAX_LOGIN_RETRIES = 5;

// Channel-to-Category mapping
const CHANNEL_CATEGORY_MAP = {
    '1390916912355217500': 'items',
    '1227605665300611092': 'items',
    '1401886530292940840': 'skills'
};

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

// Graceful shutdown handler (Railway sends SIGTERM)
async function gracefulShutdown(signal) {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    try {
        client.destroy();
        console.log('Discord client destroyed.');
    } catch (e) { /* ignore */ }
    try {
        await db.disconnect();
    } catch (e) { /* ignore */ }
    process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

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

// Debug logging — opt-in only (set DEBUG=true in env to enable)
if (process.env.DEBUG === 'true') {
    client.on('debug', info => {
        if (!info.includes('Heartbeat')) console.log(`[DEBUG] ${info}`);
    });
}

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
        .setDescription('List all registered adventurers')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    new SlashCommandBuilder()
        .setName('admin_view')
        .setDescription('View another user\'s inventory (Admin)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
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
        .setDescription('Get a suggestion for your Bonus Action'),
    new SlashCommandBuilder()
        .setName('recheck')
        .setDescription('Admin: Wipe and re-check inventory for a user (or yourself)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addUserOption(option =>
            option.setName('user')
                .setDescription(' The user to recheck (defaults to you)')
                .setRequired(false)),
    new SlashCommandBuilder()
        .setName('nuke')
        .setDescription('Admin: NUKE EVERYTHING and rescan ALL channels for ALL users (Fast)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    new SlashCommandBuilder()
        .setName('horoscope')
        .setDescription('Trigger the daily horoscope now (Admin)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    new SlashCommandBuilder()
        .setName('fake_horoscope')
        .setDescription('Send a custom horoscope (Indistinguishable from real one)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption(option =>
            option.setName('message').setDescription('The horoscope message to send').setRequired(true)),
    new SlashCommandBuilder()
        .setName('condition')
        .setDescription('Look up a specific condition')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Name of the condition to look up')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('toothytorial')
        .setDescription('Send a tutorial message (Admin Only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption(option =>
            option.setName('text').setDescription('The tutorial text to send').setRequired(true)),
    new SlashCommandBuilder()
        .setName('item')
        .setDescription('Search for an item by name and display its image')
        .addStringOption(option =>
            option.setName('name').setDescription('Item name to search for').setRequired(true))
        .addUserOption(option =>
            option.setName('user').setDescription('User whose inventory to search (defaults to you)').setRequired(false)),
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

rest.on('rateLimited', (info) => {
    console.warn(`[RATE LIMIT] Hit limit on ${info.route}. Retry in ${info.timeToReset}ms.`);
});

// SETUP ON READY
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    console.log(`Watching channels: ${CHANNEL_IDS.join(', ')}`);

    // Register Commands
    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);
        // Use application commands (global)
        const data = await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log(`Successfully reloaded ${data.length} application (/) commands.`);
        data.forEach(cmd => console.log(`  - /${cmd.name}`));
    } catch (error) {
        console.error('Failed to register commands:', error);
    }

    // Start daily horoscope scheduler
    scheduleHoroscope(client);
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
• React with ✅ to images posted in designated channels to add items
• \`/inventory\` - Get a link to your web inventory
• \`/item <name>\` - Search for an item and display its image
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
\`/recheck\` - Force re-scan inventory from channels

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

    // --- ITEM SEARCH ---
    else if (interaction.commandName === 'item') {
        await interaction.deferReply();
        const searchName = interaction.options.getString('name');
        const targetUser = interaction.options.getUser('user') || interaction.user;

        // Check if target user has a profile
        const profile = await db.getUser(targetUser.id);
        if (!profile) {
            return await interaction.editReply({
                content: targetUser.id === interaction.user.id
                    ? `❌ You don't have a profile yet! Use \`/setup_profile <name>\` first.`
                    : `❌ That user has not set up a profile.`
            });
        }

        // Search for items
        const items = await db.searchItems(targetUser.id, searchName);

        if (items.length === 0) {
            return await interaction.editReply({
                content: `❌ No items matching "**${searchName}**" found in **${profile.name}**'s inventory.`
            });
        }

        // Best match: exact > starts-with > contains
        const lowerSearch = searchName.toLowerCase();
        let bestMatch = items[0];
        for (const item of items) {
            const lowerName = item.filename.toLowerCase();
            if (lowerName === lowerSearch) {
                bestMatch = item;
                break;
            } else if (lowerName.startsWith(lowerSearch) && !bestMatch.filename.toLowerCase().startsWith(lowerSearch)) {
                bestMatch = item;
            }
        }

        // Build embed
        const embed = new EmbedBuilder()
            .setTitle(`📦 ${bestMatch.filename}`)
            .setColor(0xD4A017) // Gold color
            .setImage(bestMatch.url)
            .setFooter({ text: `${profile.name}'s Inventory • Toothy Bot` })
            .setTimestamp(bestMatch.timestamp);

        // Add fields
        if (bestMatch.quantity > 1) {
            embed.addFields({ name: 'Quantity', value: `${bestMatch.quantity}`, inline: true });
        }
        if (bestMatch.notes) {
            embed.addFields({ name: 'Notes', value: bestMatch.notes, inline: true });
        }
        if (bestMatch.sender) {
            embed.addFields({ name: 'Dropped by', value: bestMatch.sender, inline: true });
        }
        if (bestMatch.category) {
            embed.addFields({ name: 'Category', value: bestMatch.category === 'skills' ? '📜 Skill' : '🎒 Item', inline: true });
        }

        // Add link to web inventory
        embed.addFields({
            name: '🔗 Web Inventory',
            value: `[View Full Inventory](${BASE_URL}/index.html?userId=${targetUser.id})`,
            inline: false
        });

        // If multiple matches, note that
        const replyContent = items.length > 1
            ? `Found **${items.length}** items matching "**${searchName}**". Showing best match:`
            : null;

        await interaction.editReply({
            content: replyContent,
            embeds: [embed]
        });
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
            "**Shove**: Try to push a creature away or off a ledge. Make an Athletics check.\n> DC = 10 + target's higher mod (Athletics/Acrobatics).\n> Success: Push 5 ft + 5 ft for every 2 points over DC.",
            "**Throw**: Throw an item upwards to 15 ft + 5 for every STR modifier.",
            "**Jump**: Move a distance based on your Strength.\n> Base range 15 ft + 5 ft for every 2 points of STR above 10.",
            "**Dip**: Coat your weapon in a nearby surface (fire, poison, etc.) for extra damage.\n> Typically +1d6 unless otherwise stated.",
            "**Off-hand Attack**: Make a secondary attack if you are dual-wielding.\n> Only deals base die unless you have the Dual Wielder feat."
        ];
        const randomAction = actions[Math.floor(Math.random() * actions.length)];
        await interaction.reply(`🎲 **Random Bonus Action suggestion:**\n${randomAction}`);
    }

    // --- HOROSCOPE (ADMIN) ---
    else if (interaction.commandName === 'horoscope') {
        await interaction.deferReply({ ephemeral: true });
        await sendHoroscope(client);
        await interaction.editReply({ content: '🔮 Horoscope sent!' });
    }

    // --- FAKE HOROSCOPE (ADMIN) ---
    else if (interaction.commandName === 'fake_horoscope') {
        await interaction.deferReply({ ephemeral: true });
        const message = interaction.options.getString('message');
        const { sendCustomHoroscope } = require('./horoscope');
        await sendCustomHoroscope(client, message);
        await interaction.editReply({ content: '🔮 Secret horoscope sent!' });
    }

    // --- TOOTHYTORIAL (ADMIN) ---
    else if (interaction.commandName === 'toothytorial') {
        await interaction.deferReply({ ephemeral: true });
        const text = interaction.options.getString('text');
        const targetChannelId = '1408049997500387329';
        
        try {
            const channel = await client.channels.fetch(targetChannelId);
            if (channel && channel.isTextBased()) {
                await channel.send(`**Toothy-Toothtorial**\n${text}`);
                await interaction.editReply({ content: `✅ Tutorial sent to <#${targetChannelId}>!` });
            } else {
                await interaction.editReply({ content: `❌ Could not find target text channel.` });
            }
        } catch (error) {
            console.error('Error sending tutorial:', error);
            await interaction.editReply({ content: `❌ Error sending tutorial: ${error.message}` });
        }
    }

    // --- CONDITION ---
    else if (interaction.commandName === 'condition') {
        const queryName = interaction.options.getString('name').toLowerCase().trim();
        const conditions = require('./conditions');

        let conditionData = conditions[queryName.replace(/\s+/g, '_')];

        if (!conditionData) {
            conditionData = Object.values(conditions).find(c => c.name.toLowerCase() === queryName);
        }

        if (!conditionData) {
            conditionData = Object.values(conditions).find(c => c.name.toLowerCase().includes(queryName));
        }

        if (!conditionData) {
            await interaction.reply({ content: `❌ Condition **${interaction.options.getString('name')}** not found.`, ephemeral: true });
            return;
        }

        let replyText = `**${conditionData.name}**\n${conditionData.description}`;
        if (conditionData.recovery) {
            replyText += `\n> **Recovery/Fix:** ${conditionData.recovery}`;
        }
        await interaction.reply(replyText);
    }

    // --- RECHECK (Force Re-scan) ---
    else if (interaction.commandName === 'recheck') {
        // Step 1: Show warning with confirmation buttons
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('recheck_confirm')
                .setLabel('⚠️ Yes, wipe and re-scan')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('recheck_cancel')
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary)
        );

        const targetUser = interaction.options.getUser('user') || interaction.user;
        const targetName = targetUser.id === interaction.user.id ? 'your' : `**${targetUser.username}**'s`;

        await interaction.reply({
            content: `⚠️ **WARNING: Force Recheck**\n\nThis will:\n1. **DELETE** all items in ${targetName} inventory\n2. Re-scan all channels for images ${targetName === 'your' ? 'you' : targetUser.username} reacted ✅ to\n3. Re-add those items with fresh URLs\n\n**Notes, quantity changes, and equipment will be lost!**\n\nAre you sure?`,
            components: [row],
            ephemeral: true
        });

        // Wait for button click (60 second timeout)
        try {
            const buttonInteraction = await interaction.channel.awaitMessageComponent({
                filter: (i) => i.user.id === interaction.user.id && (i.customId === 'recheck_confirm' || i.customId === 'recheck_cancel'),
                time: 60000
            });

            if (buttonInteraction.customId === 'recheck_cancel') {
                await buttonInteraction.update({ content: '❌ Recheck cancelled.', components: [] });
                return;
            }

            // Step 2: User confirmed — start the recheck
            await buttonInteraction.update({ content: '🔄 Wiping inventory and scanning channels... This may take a moment.', components: [] });

            const userId = targetUser.id;

            // Delete all items for this user
            const deletedCount = await db.deleteAllUserItems(userId);
            console.log(`[RECHECK] Deleted ${deletedCount} items for user ${userId}`);

            // Also clear equipment slots
            await db.updateUser(userId, { slots: {} });

            // Step 3: Scan channels for messages with ✅ reaction from this user
            let scanned = 0;
            const tasks = [];

            for (const channelId of CHANNEL_IDS) {
                try {
                    const channel = await client.channels.fetch(channelId);
                    if (!channel) continue;

                    let lastId = null;
                    let fetchedAll = false;
                    let batchCount = 0;
                    const MAX_BATCHES = 5; // 500 messages per channel

                    while (!fetchedAll && batchCount < MAX_BATCHES) {
                        const options = { limit: 100 };
                        if (lastId) options.before = lastId;

                        const messages = await channel.messages.fetch(options);
                        if (messages.size === 0) break;

                        for (const [msgId, message] of messages) {
                            scanned++;
                            if (message.attachments.size === 0) continue;

                            // Check if this user reacted with ✅ to this message
                            const checkReaction = message.reactions.cache.find(r => r.emoji.name === '✅');
                            if (!checkReaction) continue;

                            try {
                                const reactors = await checkReaction.users.fetch();
                                if (!reactors.has(userId)) continue;
                            } catch (e) {
                                continue;
                            }

                            // This user reacted ✅ — queue all image attachments
                            const category = CHANNEL_CATEGORY_MAP[channelId] || 'items';
                            for (const [attKey, attachment] of message.attachments) {
                                if (!attachment.contentType?.startsWith('image/')) continue;

                                tasks.push({
                                    attachment,
                                    msgId,
                                    channelId,
                                    category,
                                    sender: message.author.username,
                                    content: message.content
                                });
                            }
                        }

                        lastId = messages.last().id;
                        batchCount++;
                        if (messages.size < 100) fetchedAll = true;
                    }
                } catch (error) {
                    console.error(`[RECHECK] Failed to scan channel ${channelId}:`, error);
                }
            }

            // Step 4: Process tasks in parallel chunks
            let added = 0;
            let failed = 0;
            const CHUNK_SIZE = 5;

            if (tasks.length > 0) {
                await buttonInteraction.editReply({
                    content: `🔄 Scanned ${scanned} messages. Found ${tasks.length} items.\n🚀 Uploading to ImgBB (this may take a minute)...`,
                    components: []
                });

                for (let i = 0; i < tasks.length; i += CHUNK_SIZE) {
                    const chunk = tasks.slice(i, i + CHUNK_SIZE);
                    await Promise.all(chunk.map(async (task) => {
                        try {
                            // Upload to Cloudinary (if configured)
                            const hostedUrl = await uploadToCloudinary(task.attachment.url);

                            await db.addItem(userId, {
                                filename: task.attachment.filename,
                                url: hostedUrl || task.attachment.url, // Fallback to Discord URL
                                messageId: task.msgId,
                                channelId: task.channelId,
                                category: task.category,
                                sender: task.sender,
                                content: task.content
                            });
                            added++;
                        } catch (e) {
                            console.error(`[RECHECK] Failed to add item:`, e);
                            failed++;
                        }
                    }));
                }
            }

            await buttonInteraction.editReply({
                content: `✅ **Recheck Complete!**\n🗑️ Deleted: ${deletedCount} old items\n📦 Re-added: ${added} items\n🔍 Messages scanned: ${scanned}`,
                components: []
            });
            console.log(`[RECHECK] User ${userId}: deleted ${deletedCount}, re-added ${added}, scanned ${scanned} messages`);

        } catch (error) {
            // Timeout or error
            await interaction.editReply({ content: '⏰ Recheck timed out. No changes were made.', components: [] });
        }
    }

    // --- NUKE --- (Fixed: was `if` instead of `else if`)
    else if (interaction.commandName === 'nuke') {
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('confirm_nuke')
                    .setLabel('☢️ CONFIRM NUKE ALL ☢️')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('cancel_nuke')
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Secondary)
            );

        await interaction.reply({
            content: '⚠️ **WARNING: NUKE DETECTED** ⚠️\n\nThis will **DELETE ALL ITEMS** for **EVERYONE** and rescan all channels from scratch.\nThis handles everyone at once and is faster than individual rechecks.\n\nAre you sure?',
            components: [row],
            ephemeral: true
        });
    }
});

// BUTTON HANDLER (Nuke)
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    if (!['confirm_nuke', 'cancel_nuke'].includes(interaction.customId)) return;

    if (interaction.customId === 'cancel_nuke') {
        await interaction.update({ content: 'Nuke cancelled. Phew! 😅', components: [] });
        return;
    }

    if (interaction.customId === 'confirm_nuke') {
        const start = Date.now();
        await interaction.update({ content: '☢️ **INITIATING NUKE...**\n🗑️ Wiping database...', components: [] });

        try {
            // 1. Wipe everything
            const deletedCount = await db.clearAllItems();

            // 2. Scan all channels
            const tasks = [];
            let scanned = 0;
            const uniqueUsers = new Set();
            const channels = process.env.CHANNEL_ID ? process.env.CHANNEL_ID.split(',').map(id => id.trim()) : [];

            await interaction.editReply({ content: `🗑️ Wiped ${deletedCount} items.\n🔍 Scanning ${channels.length} channels...` });

            for (const channelId of channels) {
                try {
                    const channel = await client.channels.fetch(channelId);
                    if (!channel) continue;

                    let lastId = null;
                    let fetchedAll = false;
                    let batchCount = 0;
                    const MAX_BATCHES = 7; // Reduced from 10 to save API calls

                    while (!fetchedAll && batchCount < MAX_BATCHES) {
                        const options = { limit: 100 };
                        if (lastId) options.before = lastId;

                        const messages = await channel.messages.fetch(options);
                        if (messages.size === 0) break;

                        for (const [msgId, message] of messages) {
                            scanned++;
                            if (message.attachments.size === 0) continue;

                            // Find valid reactions
                            const checkReaction = message.reactions.cache.find(r => r.emoji.name === '✅');
                            if (!checkReaction) continue;

                            try {
                                const reactors = await checkReaction.users.fetch();
                                const category = CHANNEL_CATEGORY_MAP[channelId] || 'items';

                                for (const [reactorId, user] of reactors) {
                                    if (user.bot) continue;
                                    uniqueUsers.add(user.username);

                                    for (const [attKey, attachment] of message.attachments) {
                                        if (!attachment.contentType?.startsWith('image/')) continue;

                                        tasks.push({
                                            userId: reactorId,
                                            attachment,
                                            msgId,
                                            channelId,
                                            category,
                                            sender: message.author.username,
                                            content: message.content
                                        });
                                    }
                                }
                            } catch (e) {
                                continue;
                            }
                        }
                        lastId = messages.last().id;
                        batchCount++;
                        if (messages.size < 100) fetchedAll = true;
                    }
                } catch (e) {
                    console.error(`Failed to scan channel ${channelId}`, e);
                }
            }

            // 3. Process uploads
            const totalTasks = tasks.length;
            await interaction.editReply({ content: `found ${totalTasks} items for ${uniqueUsers.size} users: ${Array.from(uniqueUsers).join(', ')}.\n🚀 Starting upload batch process...` });

            let completed = 0;
            let errors = 0;
            const CHUNK_SIZE = 10;

            for (let i = 0; i < tasks.length; i += CHUNK_SIZE) {
                const chunk = tasks.slice(i, i + CHUNK_SIZE);
                await Promise.all(chunk.map(async (task) => {
                    try {
                        const hostedUrl = await uploadToCloudinary(task.attachment.url);
                        await db.addItem(task.userId, {
                            filename: task.attachment.filename || task.attachment.name,
                            url: hostedUrl || task.attachment.url,
                            messageId: task.msgId,
                            channelId: task.channelId,
                            category: task.category,
                            sender: task.sender,
                            content: task.content
                        });
                        completed++;
                    } catch (e) {
                        console.error(e);
                        errors++;
                    }
                }));
            }

            const duration = ((Date.now() - start) / 1000).toFixed(1);
            await interaction.editReply({
                content: `✅ **NUKE COMPLETE!**\n⏱️ Time: ${duration}s\n🗑️ Deleted old: ${deletedCount}\n📦 Re-added: ${completed}\n❌ Errors: ${errors}\n👥 Users processed: ${uniqueUsers.size}`
            });

        } catch (error) {
            console.error('Nuke failed:', error);
            await interaction.editReply({ content: `❌ **Nuke Failed:** ${error.message}` });
        }
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
    if (!CHANNEL_IDS.includes(reaction.message.channelId)) return;
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
                // Determine category based on channel
                const category = CHANNEL_CATEGORY_MAP[message.channelId] || 'items';

                // Upload to Cloudinary (if configured)
                const hostedUrl = await uploadToCloudinary(attachment.url);

                // Add to DB (Stateless: Use URL directly)
                await db.addItem(user.id, {
                    filename: attachment.name,
                    url: hostedUrl || attachment.url, // Fallback to Discord URL
                    messageId: message.id,
                    channelId: message.channelId,
                    category: category,
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

        // 3. Login with Retry Pattern (capped at MAX_LOGIN_RETRIES)
        await loginWithRetry(TOKEN);

    } catch (error) {
        console.error("Critical Startup Error:", error);
    }
}

async function loginWithRetry(token) {
    let attempts = 0;
    while (attempts < MAX_LOGIN_RETRIES) {
        try {
            console.log(`📡 Attempting Discord Login (Attempt ${attempts + 1}/${MAX_LOGIN_RETRIES})...`);

            // Race login against 20s timeout to prevent hanging
            const loginPromise = client.login(token);
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Login timeout after 20s")), 20000)
            );

            await Promise.race([loginPromise, timeoutPromise]);
            console.log("✅ Discord Login Successful!");
            return; // Exit on success
        } catch (error) {
            attempts++;
            console.error(`❌ Login Failed (${attempts}/${MAX_LOGIN_RETRIES}): ${error.message}`);

            if (attempts >= MAX_LOGIN_RETRIES) {
                console.error(`❌ CRITICAL: Max login retries (${MAX_LOGIN_RETRIES}) exceeded. Exiting process to let Railway restart with backoff.`);
                process.exit(1);
            }

            // Wait 30 seconds before retrying (reduced from 60s to fail faster)
            console.log("⏳ Retrying in 30 seconds...");
            await new Promise(resolve => setTimeout(resolve, 30000));
        }
    }
}


init();
