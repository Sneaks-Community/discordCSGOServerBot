/**
 * Main entry point for Discord CS:GO Server Bot
 * Initializes and starts the bot
 */

import { initBot } from "./bot.js";

// Start the bot
initBot().catch(err => {
    console.error("Failed to initialize bot:", err);
    process.exit(1);
});