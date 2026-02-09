/**
 * Force re-register all slash commands with Discord
 * Run this locally to immediately update commands without waiting for global propagation
 */

require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID || '1468962514367676575'; // Your bot's client ID

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
        .setName('refresh_items')
        .setDescription('Refresh all broken Discord image URLs from original messages')
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
