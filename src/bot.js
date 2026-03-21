/**
 * Discord bot client setup and event handlers
 * Main bot module that initializes and runs the Discord client
 */

import Discord, { GatewayIntentBits } from "discord.js";

import { config, CONFIG_VALUES, validateConfig } from "./config/index.js";
import { initDB, closeDB, unfollowAll } from "./db/index.js";
import { registerSlashCommands, handleInteraction } from "./commands/index.js";
import { setFollowLogChannel } from "./commands/followCommands.js";
import { refresh, getServerData, updateServerData } from "./services/serverService.js";
import { startCleanupIntervals } from "./services/cacheService.js";
import { notifyUsers, initNotificationService } from "./services/notificationService.js";
import { makeEmbed } from "./embeds/serverEmbeds.js";
import { validateChannelForEdit, validateChannelForSend } from "./utils/permissions.js";
import { withRetry } from "./utils/retry.js";

// Create bot client with v14 intents
const bot = new Discord.Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions
    ]
});

// Log channel for notifications
let logChannel = null;

/**
 * Initialize the bot and start all services
 */
export async function initBot() {
    // Validate configuration before starting
    validateConfig();

    // Initialize database before logging in
    await initDB();

    // Initialize notification service with bot instance
    initNotificationService(bot);

    // Get token after validation
    const token = config.discord.token.trim();

    // Login to Discord
    bot.login(token).catch(err => {
        console.error("Failed to login to Discord:", err.message);
        process.exit(1);
    });
}

/**
 * Bot ready event handler
 */
bot.on("ready", async () => {
    console.log("Started as " + bot.user.tag);
    bot.user.setActivity("/follow <map> in #bot-commands");

    // Initialize logChannel with config values
    const guild = bot.guilds.cache.get(config.logging?.guildID);
    if (guild) {
        logChannel = guild.channels.cache.get(config.logging?.channelID);
        if (!logChannel) {
            console.warn(`Log channel ${config.logging?.channelID} not found in guild ${config.logging?.guildID}`);
        } else {
            // Validate bot has required permissions in log channel
            const permCheck = validateChannelForSend(logChannel);
            if (!permCheck.valid) {
                console.warn(`Log channel ${config.logging?.channelID} permission issue: ${permCheck.error}`);
                logChannel = null; // Disable logging if permissions are missing
            }
        }
    } else {
        console.warn(`Guild ${config.logging?.guildID} not found`);
    }

    // Set log channel for follow commands
    setFollowLogChannel(logChannel);

    // Register slash commands
    await registerSlashCommands(bot);

    // Start the interval function
    await intervalFunction();

    // Start embed update loop
    setInterval(intervalFunction, CONFIG_VALUES.EMBED_UPDATE_INTERVAL_MS);

    // Start map change notification loop
    setInterval(() => updateServerData(notifyUsers), CONFIG_VALUES.MAP_CHECK_INTERVAL_MS);

    // Start cleanup intervals for cache and rate limits
    startCleanupIntervals();
});

/**
 * Interval function to refresh server data and update embeds
 */
async function intervalFunction() {
    try {
        await refresh();
    } catch (error) {
        console.error("Failed to refresh server data:", error);
        return; // Skip embed update if refresh fails
    }
    
    const serverData = getServerData();
    const embed = makeEmbed(serverData);

    // Process embeds in parallel with retry logic for faster updates
    await Promise.all(
        config.embeds.map(async (e) => {
            try {
                await withRetry(async () => {
                    const channel = await bot.channels.fetch(e.channelID);
                    
                    // Validate permissions before editing
                    const permCheck = validateChannelForEdit(channel);
                    if (!permCheck.valid) {
                        throw new Error(`Permission check failed for channel ${e.channelID}: ${permCheck.error}`);
                    }
                    
                    const message = await channel.messages.fetch(e.messageID);
                    await message.edit({ content: "‎", embeds: [embed] });
                });
            } catch (error) {
                console.error(`Failed to update embed in channel ${e.channelID} after retries:`, error);
            }
        })
    );
}

/**
 * Handle guild member remove event - clean up follows when member leaves
 */
bot.on("guildMemberRemove", async (member) => {
    await unfollowAll(member.id);
});

/**
 * Handle slash command interactions
 */
bot.on("interactionCreate", async (interaction) => {
    await handleInteraction(interaction, bot, Discord, logChannel);
});

/**
 * Graceful shutdown handling
 */
process.on("SIGINT", async () => {
    console.log("Received SIGINT, shutting down...");
    try {
        closeDB();
        process.exit(0);
    } catch (error) {
        console.error("Shutdown error:", error);
        process.exit(1);
    }
});

process.on("SIGTERM", async () => {
    console.log("Received SIGTERM, shutting down...");
    try {
        closeDB();
        process.exit(0);
    } catch (error) {
        console.error("Shutdown error:", error);
        process.exit(1);
    }
});

export { bot, logChannel };