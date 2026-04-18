/**
 * Force re-register all slash commands with Discord
 * Run this locally to immediately update commands without waiting for global propagation
 */

require('dotenv').config();
const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
// Intelligently get CLIENT_ID from Env, or extract from the first part of the token (Base64)
let CLIENT_ID = process.env.CLIENT_ID;
if (!CLIENT_ID || CLIENT_ID.includes('REPLACE')) {
    try {
        const parts = TOKEN.split('.');
        CLIENT_ID = Buffer.from(parts[0], 'base64').toString('utf-8');
        console.log(`Detected Client ID from token: ${CLIENT_ID}`);
    } catch (e) {
        CLIENT_ID = '1468962514367676575'; // Hard fallback to previously seen ID
    }
}

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
        .setDescription('Get a suggestion for your Bonus Action'),
    new SlashCommandBuilder()
        .setName('recheck')
        .setDescription('Admin: Wipe and re-check inventory for a user (or yourself)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to recheck (defaults to you)')
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

(async () => {
    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);

        // Register globally (takes up to 1 hour to propagate)
        const data = await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commands },
        );

        console.log(`✅ Successfully reloaded ${data.length} application (/) commands globally!`);
        console.log('Commands registered:');
        data.forEach(cmd => console.log(`  - /${cmd.name}`));

        console.log('\n⚠️ Note: Global commands can take up to 1 hour to appear in Discord.');
        console.log('If you need immediate updates, consider guild-specific commands instead.');

    } catch (error) {
        console.error('❌ Error registering commands:', error);
    }
})();
