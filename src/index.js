/**
 * Main entry point for Discord CS:GO Server Bot
 * Initializes and starts the bot
 *
 * The only place that ends the process over a startup failure. initBot rejects
 * instead of exiting, so every failure class (bad configuration, a failed login,
 * anything else) is logged and exited here rather than in three places.
 */

import { initBot } from "./bot.js";
import { ConfigError } from "./config/index.js";
import { closeDB } from "./db/index.js";
import { flushLogs, mainLogger } from "./utils/logger.js";

// Start the bot
initBot().catch(async err => {
    if (err instanceof ConfigError) {
        // A stack trace says nothing useful about a mistyped variable; the
        // collected messages are the whole diagnostic.
        mainLogger.fatal({ errors: err.errors }, err.message);
    } else {
        mainLogger.fatal({ err }, "Failed to initialize bot");
    }

    // initDB may already have run, and a connection left open skips SQLite's WAL
    // checkpoint. A no-op when the failure came before initDB.
    try {
        closeDB();
    } catch (dbError) {
        mainLogger.error({ err: dbError }, "Failed to close the database during startup exit");
    }

    // The configuration errors above are the whole point of this path, so drain them
    // before exiting rather than discarding them with the transport worker.
    await flushLogs();

    process.exit(1);
});
