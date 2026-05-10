/**
 * Main entry point for Discord CS:GO Server Bot
 * Initializes and starts the bot
 */

import { initBot } from "./bot.js";
import { error } from "./utils/logger.js";

// Start the bot
initBot().catch(err => {
    error("Failed to initialize bot:", err);
    process.exit(1);
});
