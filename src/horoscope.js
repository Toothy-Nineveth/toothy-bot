/**
 * Daily Horoscope Feature
 * Sends a random horoscope to a specific channel at 5:30 AM UTC+8 daily
 */

const HOROSCOPE_CHANNEL_ID = '1471113961159004260';

// 5:30 AM UTC+8 = 21:30 UTC (previous day)
const TARGET_HOUR_UTC = 21;
const TARGET_MINUTE_UTC = 30;

const HOROSCOPE_MESSAGES = [
    "I'm not telling!",
    "I'll tell you later.",
    "Smile wide~!",
    "Busy!",
    "Deja vu.",
    "Mr. Osyluth won't give me any treats!",
    "Snake eyes!",
    "Seven minutes, is all I can spare to play with you...",
    "Ingeloakastimizilian.",
    "Invincible killer.",
    "Warlord!",
    "An excellent time to owe nothing.",
    "Three of them are watching.",
    "Thranduil, King of the Elves.",
    "The wolf is full.",
    "Freedom.",
    "Partner.",
    "Great mage...",
    "What's behind door number three?",
    "What's the harm?",
    "A crow disagrees.",
    "You have been here before.",
    "Check your pockets.",
    "What I just said was a lie.",
    "A Mimic wrote this.",
    "Silver for monsters, gold for the tavern bill.",
    "The Lich is actually a pretty decent gardener.",
    "Blue is your unlucky color for the next six seconds.",
    "The ceiling is getting lower, isn't it?",
    "It’s right behind you. Don't look.",
    "You’re being watched, but not by anyone in this room.",
    "RANDOM_PLAYER", // Special: will mention a random player
    "Suspiciously warm chair.",
];

/**
 * Get a random member with a specific role from the guild
 */
async function getRandomPlayerMember(guild) {
    try {
        // Fetch all members (needed for role checking)
        await guild.members.fetch();

        // Look for a role named "player" (case-insensitive)
        const playerRole = guild.roles.cache.find(
            r => r.name.toLowerCase() === 'player'
        );

        if (!playerRole) {
            console.log('[HOROSCOPE] No "player" role found in guild');
            return null;
        }

        const members = playerRole.members.filter(m => !m.user.bot);
        if (members.size === 0) return null;

        const randomIndex = Math.floor(Math.random() * members.size);
        return Array.from(members.values())[randomIndex];
    } catch (error) {
        console.error('[HOROSCOPE] Failed to fetch random player:', error);
        return null;
    }
}

/**
 * Send the daily horoscope message
 */
async function sendHoroscope(client) {
    try {
        const channel = await client.channels.fetch(HOROSCOPE_CHANNEL_ID);
        if (!channel) {
            console.error('[HOROSCOPE] Channel not found:', HOROSCOPE_CHANNEL_ID);
            return;
        }

        // Pick a random horoscope
        const randomIndex = Math.floor(Math.random() * HOROSCOPE_MESSAGES.length);
        let message = HOROSCOPE_MESSAGES[randomIndex];

        // Handle special "random player" message
        if (message === 'RANDOM_PLAYER') {
            const guild = channel.guild;
            const randomMember = await getRandomPlayerMember(guild);
            if (randomMember) {
                message = `I know your secret ${randomMember}`;
            } else {
                message = "Output01_Leak. This horoscope means I'm having memory issues, please check it DM!";
            }
        }

        await channel.send(`🔮 **Today's horoscope:**\n${message}`);
        console.log(`[HOROSCOPE] Sent: "${message}"`);
    } catch (error) {
        console.error('[HOROSCOPE] Failed to send horoscope:', error);
    }
}

/**
 * Schedule the daily horoscope
 * Uses setTimeout to wait until the next 5:30 AM UTC+8, then repeats every 24h
 */
function scheduleHoroscope(client) {
    function getMillisUntilTarget() {
        const now = new Date();
        const target = new Date(now);
        target.setUTCHours(TARGET_HOUR_UTC, TARGET_MINUTE_UTC, 0, 0);

        // If we've already passed today's target time, schedule for tomorrow
        if (now >= target) {
            target.setUTCDate(target.getUTCDate() + 1);
        }

        return target.getTime() - now.getTime();
    }

    function scheduleNext() {
        const msUntilTarget = getMillisUntilTarget();
        const hoursUntil = (msUntilTarget / 1000 / 60 / 60).toFixed(1);
        console.log(`[HOROSCOPE] Next horoscope in ${hoursUntil} hours`);

        setTimeout(async () => {
            await sendHoroscope(client);
            // Schedule the next one (will be ~24h from now)
            scheduleNext();
        }, msUntilTarget);
    }

    scheduleNext();
    console.log('[HOROSCOPE] Daily horoscope scheduler started (5:30 AM UTC+8)');
}

/**
 * Send the "I know your secret" horoscope specifically (for testing)
 */
async function sendSecretHoroscope(client) {
    try {
        const channel = await client.channels.fetch(HOROSCOPE_CHANNEL_ID);
        if (!channel) {
            console.error('[HOROSCOPE] Channel not found:', HOROSCOPE_CHANNEL_ID);
            return;
        }

        const guild = channel.guild;
        const randomMember = await getRandomPlayerMember(guild);
        let message;
        if (randomMember) {
            message = `I know your secret ${randomMember}`;
        } else {
            message = "I know your secret... but who?";
        }

        await channel.send(`🔮 **Today's horoscope:**\n${message}`);
        console.log(`[HOROSCOPE] Sent secret horoscope: "${message}"`);
    } catch (error) {
        console.error('[HOROSCOPE] Failed to send secret horoscope:', error);
    }
}

async function sendCustomHoroscope(client, message) {
    try {
        const channel = await client.channels.fetch(HOROSCOPE_CHANNEL_ID);
        if (!channel) {
            console.error('[HOROSCOPE] Channel not found:', HOROSCOPE_CHANNEL_ID);
            return;
        }

        await channel.send(`🔮 **Today's horoscope:**\n${message}`);
        console.log(`[HOROSCOPE] Sent custom: "${message}"`);
    } catch (error) {
        console.error('[HOROSCOPE] Failed to send custom horoscope:', error);
    }
}

module.exports = { scheduleHoroscope, sendHoroscope, sendSecretHoroscope, sendCustomHoroscope };
