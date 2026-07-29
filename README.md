# Discord CS:GO Server Bot

A Discord bot that monitors Counter-Strike: Global Offensive (and other supported) servers, provides real-time server status updates, and notifies users when specific maps appear on followed servers.

![Version](https://img.shields.io/badge/version-7.0.0-blue)
![Node](https://img.shields.io/badge/node-%3E%3D24-blue)
![Docker](https://img.shields.io/badge/docker-ready-blue)

## Features

### Core Features

- **Real-time Server Monitoring**: Automatically queries game servers at a configurable interval to update server status
- **Embed Channel**: Automatically updates a channel message with rich embed of all configured servers and their status
- **Map Notifications**: Receive DM alerts when followed maps appear on monitored servers
- **Slash Commands**: Modern Discord interaction using slash commands with autocomplete support
- **Rate Limiting**: Built-in rate limiting to prevent abuse (configurable per command)
- **Automatic Cleanup**: Automatically removes user follows when they leave the server
- **Retry Logic**: Exponential backoff for failed server queries

### Public Commands

| Command | Description |
|---------|-------------|
| `/players` | Display currently connected players on a specified server |
| `/keywords` | List all available server keywords for searching |
| `/follow` | Follow a map to receive DM notifications when it appears on a server |
| `/unfollow` | Stop following a specific map or all maps |
| `/listfollows` | Display all maps you are currently following |
| `/help` | Show a list of all available commands |
| `/ping` | Check bot latency |

### Administrator Commands

| Command | Description |
|---------|-------------|
| `/check <server>` | Check server status by IP address (admin only) |
| `/mem` | Display current memory usage statistics (admin only) |
| `/listallfollows` | List all users and their followed maps (admin only) |
| `/testnotify <map>` | Test map notification system (admin only) |
| `/removeuser <userID>` | Remove all map follows for a specific user (admin only) |

## Configuration

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
   - Copy the example environment file:

     ```bash
     cp .env.example .env
     ```

   - Edit `.env` with your settings (see [Environment Variables](#environment-variables-1) below)

4. **Configure servers**
   - Edit `servers.json` with your game server details (see [Server Configuration](#server-configuration) below)

5. **Run the bot**

   ```bash
   npm start
   ```

### Environment Variables

All configuration is done via environment variables. Copy `.env.example` to `.env` and configure as needed.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DISCORD_TOKEN` | Yes | - | Your Discord bot token |
| `ADMIN_ROLE_ID` | Recommended | - | Discord role ID with admin access |
| `LOGGING_ENABLED` | No | `true` | Enable/disable logging |
| `LOG_LEVEL` | No | `info` | Console verbosity: `trace`, `debug`, `info`, `warn`, `error`, `fatal`, `silent`. |
| `LOG_GUILD_ID` | No | - | Guild ID for logging bot activities |
| `LOG_CHANNEL_ID` | No | - | Channel ID for logging bot activities |
| `FALLBACK_GUILD_ID` | No | - | Fallback guild ID for DM failures |
| `FALLBACK_CHANNEL_ID` | No | - | Fallback channel ID for DM failures |
| `EMBEDS` | No | `[]` | JSON array of embed configs: `[{"channelID":"xxx","messageID":"yyy"}]` |
| `EMBED_COLOR` | No | `7980240` | Embed color in decimal |
| `SERVER_UPDATE_INTERVAL` | No | `90` | Server status update interval (seconds) |
| `MAP_CHECK_INTERVAL` | No | `91` | Map change check interval (seconds) |
| `MAX_CONCURRENT_QUERIES` | No | `10` | Maximum concurrent server queries |
| `FOLLOW_TIMEOUT` | No | `30` | Timeout for follow/unfollow actions (seconds) |
| `USER_CACHE_TTL` | No | `300` | User cache TTL (seconds) |
| `RETRY_MAX_RETRIES` | No | `3` | Maximum retry attempts for failed operations |
| `RETRY_BASE_DELAY` | No | `1` | Base delay for exponential backoff (seconds) |
| `GAMEDIG_MAX_RETRIES` | No | `4` | Maximum retries for GameDig queries |
| `FALLBACK_AVATAR_URL` | No | `https://i.imgur.com/cBiDnMi.png` | Fallback avatar URL |
| `OFFLINE_SERVER_IMAGE` | No | `https://i.imgur.com/WnS0Biz.png` | Offline server image URL |
| `MAP_IMAGE_BASE_URL` | No | `https://bans.snksrv.com/images/maps/` | Base URL for map images (`<base><mapname>.jpg`); leave blank to disable |
| `RATE_LIMIT_FOLLOW_PER_MINUTE` | No | `5` | Max follow commands per minute per user |
| `RATE_LIMIT_UNFOLLOW_PER_MINUTE` | No | `5` | Max unfollow commands per minute per user |
| `RATE_LIMIT_IP_CHECK_PER_MINUTE` | No | `10` | Max IP check commands per minute per user |

## Map Images

Embeds and notifications show a map thumbnail pulled from `MAP_IMAGE_BASE_URL` as
`<MAP_IMAGE_BASE_URL><mapname>.jpg` for every map. If the configured host has no
image for a given map, the embed simply renders without one. Set `MAP_IMAGE_BASE_URL`
to your own image host, or leave it blank to disable map images entirely.

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
| `ip` | string | Yes | Server IP/FQDN and port (e.g., `127.0.0.1:27015`) |
| `nick` | string | Yes | Display name shown in embeds |
| `show` | boolean | Yes | Whether to display server in public commands |
| `protocol` | string | No | Game protocol (default: `csgo`) - see list [here](https://github.com/gamedig/node-gamedig/blob/master/GAMES_LIST.md)|
| `keywords` | array | Yes | Search keywords for the server |

## Minimum Requirements

### System Requirements

- **Node.js** v24.x or higher
- **Docker** (optional, for containerized deployment)

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

## Docker Deployment

The bot can be run in a Docker container for easy deployment. The Docker image uses a multi-stage build with `node:24-alpine` for a minimal footprint (~100MB).

### Quick Start with Docker Compose

1. **Clone and configure**

   ```bash
   git clone https://github.com/Sneaks-Community/discordCSGOServerBot.git
   cd discordCSGOServerBot
   ```

2. **Create environment file**

   ```bash
   cp .env.example .env
   nano .env  # Edit with your Discord token and settings
   ```

3. **Configure servers**

   Edit `servers.json` with your game server details.

4. **Build and run**

   ```bash
   docker-compose up -d
   ```

5. **View logs**

   ```bash
   docker-compose logs -f
   ```

### Manual Docker Build

```bash
# Build the image
docker build -t discord-csgo-bot .

# Run the container
docker run -d \
  --name csgo-server-bot \
  --env-file .env \
  -v $(pwd)/servers.json:/app/servers.json:ro \
  -v bot-data:/app/data \
  discord-csgo-bot
```

### Environment Variables

All configuration options can be set via environment variables. See `.env.example` for the full list.

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_TOKEN` | Yes | Your Discord bot token |
| `ADMIN_ROLE_ID` | No | Discord role ID with admin access |
| `LOG_GUILD_ID` | No | Guild ID for logging |
| `LOG_CHANNEL_ID` | No | Channel ID for logging |
| `FALLBACK_GUILD_ID` | No | Fallback guild for DMs |
| `FALLBACK_CHANNEL_ID` | No | Fallback channel for DMs |
| `EMBEDS` | No | JSON array of embed configs |
| `SERVER_UPDATE_INTERVAL` | No | Server update interval (seconds) |
| `MAP_CHECK_INTERVAL` | No | Map check interval (seconds) |

### Data Persistence

The Docker compose setup uses named volumes:
- `bot-data` - SQLite database storage

### Updating

```bash
# Pull latest changes
git pull

# Rebuild and restart
docker-compose up -d --build
```
