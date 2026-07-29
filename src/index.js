/**
 * Main entry point for Discord CS:GO Server Bot
 * Initializes and starts the bot
 */

import { initBot } from "./bot.js";
import { mainLogger } from "./utils/logger.js";

// Start the bot
initBot().catch(err => {
    mainLogger.fatal({ err }, "Failed to initialize bot");
    process.exit(1);
});
