# Discord CS:GO Server Bot

A Discord bot that monitors Counter-Strike: Global Offensive (and other supported) servers, provides real-time server status updates, and notifies users when specific maps appear on followed servers.

![Version](https://img.shields.io/badge/version-7.0.0-blue)
![Node](https://img.shields.io/badge/node-%3E%3D20-blue)

## Features

### Core Features

- **Real-time Server Monitoring**: Automatically queries game servers at a configurable interval to update server status
- **Embed Channel**: Automatically updates a channel message with rich embed of all configured servers and their status
- **Map Notifications**: Receive DM alerts when followed maps appear on monitored servers
- **Multi-Game Mode Support**: Supports Surf, KZ (kreedz climb), and Bhop map prefixes
- **Slash Commands**: Modern Discord interaction using slash commands with autocomplete support
- **Rate Limiting**: Built-in rate limiting to prevent abuse (configurable per command)
- **IP Validation**: Secure IP address/FQDN validation with private IP blocking
- **Automatic Cleanup**: Automatically removes user follows when they leave the server
- **Caching System**: User and map image caching to reduce API calls
- **Retry Logic**: Exponential backoff for failed server queries

### Public Commands

| Command | Description |
|---------|-------------|
| `/players` | Display currently connected players on a specified server |
| `/map` | Show the current map on a server or display map statistics |
| `/keywords` | List all available server keywords for searching |
| `/follow` | Follow a map to receive DM notifications when it appears on a server |
| `/unfollow` | Stop following a specific map or all maps |
| `/listfollows` | Display all maps you are currently following |
| `/help` | Show a list of all available commands |
| `/ping` | Check bot latency |
| `/version` | Display the bot version |

### Administrator Commands

| Command | Description |
|---------|-------------|
| `/check <server>` | Check server status by IP address (admin only) |
| `/mem` | Display current memory usage statistics (admin only) |
| `/listallfollows` | List all users and their followed maps (admin only) |
| `/testnotify <map>` | Test map notification system (admin only) |
| `/removeuser <userID>` | Remove all map follows for a specific user (admin only) |

## Configuration

### Prerequisites

- **Node.js**: Version 20 or higher
- **Discord Bot Token**: Create a bot application at [Discord Developer Portal](https://discord.com/developers/applications)
- **SQLite**: Required for map follow data persistence (handled by `better-sqlite3` package)

### Setup Instructions

1. **Clone the repository**

   ```bash
   git clone https://github.com/Sneaks-Community/discordCSGOServerBot.git
   cd discordCSGOServerBot
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure the bot**
   - Copy the example configuration file:

     ```bash
     cp config.json.example config.json
     ```

   - Edit `config.json` with your settings (see [Configuration Fields](#configuration-fields) below)

4. **Run the bot**

   ```bash
   npm start
   ```

### Configuration Fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `discord.token` | string | Yes | - | Your Discord bot token |
| `discord.intents` | array | Yes | - | Discord gateway intents required for bot functionality |
| `security.adminUserIds` | array | Yes | - | Discord user IDs with access to admin commands |
| `logging.guildID` | string | Yes | - | Guild ID for logging bot activities |
| `logging.channelID` | string | Yes | - | Channel ID for logging bot activities |
| `embeds` | array | Yes | - | Array of channel/message pairs for embed updates |
| `serverUpdate.intervalSeconds` | number | No | `90` | How often to update server status (seconds) |
| `serverUpdate.mapCheckIntervalSeconds` | number | No | `91` | How often to check for map changes (seconds) |
| `serverUpdate.maxConcurrentQueries` | number | No | `10` | Maximum concurrent server queries |
| `follow.timeoutSeconds` | number | No | `30` | Timeout for reaction collectors (seconds) |
| `cache.userCacheTTLSeconds` | number | No | `300` | User cache TTL (seconds) |
| `cache.mapImageCacheTTLSeconds` | number | No | `86400` | Map image cache TTL (seconds) |
| `retry.maxRetries` | number | No | `3` | Maximum retry attempts for failed operations |
| `retry.baseDelaySeconds` | number | No | `1` | Base delay for retry exponential backoff (seconds) |
| `gamedig.defaultMaxRetries` | number | No | `4` | Default retry attempts for server queries |

## Supported Game Modes

The bot supports the following CS:GO game modes with automatic map detection:

### Surf Maps

- **Prefix**: `surf_`
- **Default Stats URL**: [snksrv.com/surfstats](https://snksrv.com/surfstats/)
- **Example**: `surf_beginner`

### KZ (Climb) Maps

- **Prefixes**: `kz_`, `bkz_`, `kzpro_`, `skz_`, `vnl_`, `xc_`
- **Default Stats URL**: [snksrv.com/kzstats](https://snksrv.com/kzstats/)
- **Example**: `kz_asylum`

### Bhop (Bunnyhop) Maps

- **Prefix**: `bhop`
- **Default Stats URL**: [snksrv.com/bhopstats](https://snksrv.com/bhopstats/)
- **Example**: `bhop_strix`

## Server Configuration

Add your CS:GO servers to `servers.json`:

```json
{
  "ServerName": {
    "ip": "IP_ADDRESS:PORT",
    "nick": "Display Name",
    "show": true,
    "protocol": "csgo",
    "keywords": ["keyword1", "keyword2"]
  }
}
```

### Server Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ip` | string | Yes | Server IP and port (e.g., `127.0.0.1:27015`) |
| `nick` | string | Yes | Display name shown in embeds |
| `show` | boolean | Yes | Whether to display server in public commands |
| `protocol` | string | No | Game protocol (default: `csgo`) - see list [here](https://github.com/gamedig/node-gamedig/blob/master/GAMES_LIST.md)|
| `keywords` | array | Yes | Search keywords for the server |

## Minimum Requirements

### System Requirements

**Node.js** v20.x

### Discord Bot Requirements

- **Bot Permissions**:
  - Send Messages
  - Embed Links
  - Read Message History
  - Add Reactions
  - Send Messages in Threads
  - Use External Emojis
  - Use Application Commands

- **Required Intents**:
  - Guilds
  - GuildMessages
  - GuildMessageReactions
  - DirectMessages
  - DirectMessageReactions

## Troubleshooting

### Bot won't start

First and foremost, **review all logs**.

- Verify your Discord token is correct and has proper permissions
- Check that `config.json` exists and is valid JSON
- Ensure all required configuration fields are present

### Commands not appearing

- The bot uses slash commands - type `/` in any channel the bot has access to
- The bot must be invited to your server with proper permissions
- Slash commands may take a few minutes to propagate after the bot starts
- Try using `/help` to see available commands

### Map notifications not working

- Verify `follow.timeoutSeconds` is set appropriately
- Check that the bot can send DMs to users
- Ensure map names match the expected format (alphanumeric, underscores, hyphens)
- Make sure you have `/follow` set for the maps you want notifications for

### Server status not updating

- Check server IP and port in `servers.json`
- Verify the server is accessible from your network
- Review logs for GameDig query errors

## Author

**Frumpy7**

## Support

For issues and feature requests, please visit the [GitHub Issues](https://github.com/Sneaks-Community/discordCSGOServerBot/issues) page.
