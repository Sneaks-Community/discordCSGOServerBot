# Discord CS:GO Server Bot

A Discord bot that monitors Counter-Strike: Global Offensive (and other supported) servers,
keeps a channel message in sync with their status, and DMs users when a followed map appears.

![Version](https://img.shields.io/badge/version-7.0.0-blue)
![Node](https://img.shields.io/badge/node-%3E%3D24-blue)
![Docker](https://img.shields.io/badge/docker-ready-blue)

## Features

- **Server monitoring**: queries every configured server on one interval and keeps a channel
  message updated with a rich embed of their status
- **Map notifications**: DMs everyone following a map when it appears on a server, falling back
  to a configured channel for recipients whose DMs are closed
- **Slash commands**: all interaction is through slash commands, rate limited per user
- **Automatic cleanup**: a member's follows are removed when they leave the guild (needs the
  privileged Server Members Intent, see [Discord Application](#discord-application))
- **Resilient**: game-server queries and Discord calls retry with exponential backoff and
  jitter, while permanent failures are reported once with a remediation hint instead of being
  retried forever

## Commands

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
| `/listallfollows` | List all users and their followed maps |
| `/testnotify <map>` | Test the map notification system |
| `/removeuser <userID>` | Remove all map follows for a specific user |

Discord hides these behind the **Administrator** permission while the bot authorizes on
`ADMIN_ROLE_ID`. Both apply, so a role holder who is not a Discord Administrator will not see
the commands in the picker even though the bot would accept them: give the role Administrator,
or add a channel permission override that reveals them. All replies are ephemeral.

## Requirements

- **Node.js** v24 or newer, or **Docker**
- A **Discord application** with the `bot` and `applications.commands` OAuth2 scopes

### Discord Application

- **Permissions**, in every channel listed in `EMBEDS` and in the fallback channel:
  - View Channel and Embed Links, in both
  - Read Message History, in the `EMBEDS` channels, to fetch the message being edited
  - Send Messages, in the fallback channel

  DMs to followers need no permission.

- **Intents**: Guilds, plus GuildMembers, which is privileged. Enable **Server Members Intent**
  under Bot → Privileged Gateway Intents in the
  [Discord Developer Portal](https://discord.com/developers/applications) before starting the
  bot, otherwise login fails with `Used disallowed intents`. It powers the follow cleanup
  above, which is scoped to `DISCORD_GUILD_ID` when that is set, so a user leaving another
  guild the bot shares keeps their follows; with it unset, leaving any shared guild clears them.

## Setup

Both ways to run the bot use the same two configuration files, neither of which is tracked in
git.

1. **Clone the repository**

   ```bash
   git clone https://github.com/Sneaks-Community/discordCSGOServerBot.git
   cd discordCSGOServerBot
   ```

2. **Create the configuration files from their examples**

   ```bash
   cp .env.example .env
   cp servers.json.example servers.json
   ```

3. **Edit both.** `.env` needs at least `DISCORD_TOKEN` (see
   [Environment Variables](#environment-variables)), and `servers.json` needs your game servers
   (see [Server Configuration](#server-configuration)).

### Run with Node

```bash
npm install
npm start
```

### Run with Docker

`docker-compose.yml` bind-mounts `servers.json` and keeps the database in a named volume, so
both files from [Setup](#setup) must exist before the container starts.

```bash
docker compose up -d      # build and start
docker compose logs -f    # follow the logs
```

The image is a multi-stage `node:24-alpine` build, roughly 100MB. To run it without Compose:

```bash
docker build -t discord-csgo-bot .

docker run -d \
  --name csgo-server-bot \
  --env-file .env \
  -e DATABASE_PATH=/app/data/db.sqlite \
  -v $(pwd)/servers.json:/app/servers.json:ro \
  -v bot-data:/app/data \
  discord-csgo-bot
```

Follows are the only state on disk, and they live in the SQLite file at `DATABASE_PATH`, so it
has to resolve inside the `bot-data` volume mounted at `/app/data`. Anywhere else is the
container's writable layer, which is discarded whenever the container is recreated. The image
and `docker-compose.yml` both default it correctly, but an uncommented `DATABASE_PATH` in
`.env` would override that through `--env-file`, which is why the `docker run` above passes it
explicitly: an explicit `-e` wins.

`docker-compose.yml` also sets `NODE_ENV=production`, which selects JSON logging.

### Updating

```bash
git pull
npm install                    # Node
docker compose up -d --build   # Docker
```

## Environment Variables

Every value is validated at startup. A malformed or out-of-range one aborts startup with a
message naming the variable and its accepted range rather than being silently corrected, so the
bot never runs half configured. Leaving a variable unset, or setting it to an empty string,
selects its default.

| Variable | Required | Default | Valid range | Description |
|----------|----------|---------|-------------|-------------|
| `DISCORD_TOKEN` | Yes | - | non-empty | Your Discord bot token |
| `DISCORD_GUILD_ID` | Recommended | - | snowflake or empty | Guild to register slash commands in. Empty registers them globally, which propagates slowly and exposes them in every guild the bot joins. `ADMIN_ROLE_ID` only ever resolves in the guild the command was run in |
| `ADMIN_ROLE_ID` | Recommended | - | snowflake or empty | Role granting access to the [admin commands](#administrator-commands). Empty makes them inaccessible |
| `LOG_LEVEL` | No | `info` | `trace`, `debug`, `info`, `warn`, `error`, `fatal`, `silent` | stdout verbosity. An unrecognized value falls back to `info` with a warning rather than aborting, since logging is how problems get reported |
| `FALLBACK_GUILD_ID` | No | - | snowflake or empty | Guild holding the fallback channel. Empty disables fallback notifications |
| `FALLBACK_CHANNEL_ID` | No | - | snowflake or empty | Channel used when a DM cannot be delivered. Must be in `FALLBACK_GUILD_ID`. Empty disables fallback notifications |
| `EMBEDS` | No | `[]` | JSON array of `{channelID, messageID}` | Messages the bot keeps the server list in: `[{"channelID":"xxx","messageID":"yyy"}]`. Each message **must have been posted by the bot itself**, since Discord forbids editing anyone else's. Empty disables embed updates; malformed JSON is a startup error |
| `EMBED_COLOR` | No | `7980240` | 0 to 16777215 | Embed color as a 24-bit decimal |
| `DATABASE_PATH` | No | `db.sqlite` | non-empty | SQLite file path. In Docker it must stay on the mounted volume (`/app/data/db.sqlite`, the image default) |
| `SERVER_UPDATE_INTERVAL` | No | `90` | 30 to 86400 | How often the bot queries the servers, updates the embeds and checks for map changes, in that order, on one timer (seconds). The embed states this interval in its description |
| `MAX_CONCURRENT_QUERIES` | No | `10` | 1 to 100 | Maximum concurrent server queries |
| `USER_CACHE_TTL` | No | `300` | 1 to 86400 | User cache TTL (seconds) |
| `RETRY_MAX_RETRIES` | No | `3` | 1 to 10 | Attempts for a retried Discord operation. At least 1, since 0 would mean never attempting it |
| `RETRY_BASE_DELAY` | No | `1` | 0 to 60 | Base delay for exponential backoff (seconds) |
| `GAMEDIG_MAX_RETRIES` | No | `4` | 0 to 10 | Maximum retries for GameDig queries |
| `FALLBACK_AVATAR_URL` | No | `https://i.imgur.com/cBiDnMi.png` | http(s) URL | Icon used in embed footers |
| `OFFLINE_SERVER_IMAGE` | No | `https://i.imgur.com/WnS0Biz.png` | http(s) URL | Image used for an offline server |
| `MAP_IMAGE_BASE_URL` | No | `https://bans.snksrv.com/images/maps/` | http(s) URL ending in `/`, or empty | Map thumbnails are requested as `<base><mapname>.jpg`. A map the host has no image for simply renders without one. Empty disables map images |
| `RATE_LIMIT_FOLLOW_PER_MINUTE` | No | `5` | 1 to 1000 | Max follow commands per minute per user |
| `RATE_LIMIT_UNFOLLOW_PER_MINUTE` | No | `5` | 1 to 1000 | Max unfollow commands per minute per user |
| `RATE_LIMIT_NOTIFICATION_PER_MINUTE` | No | `10` | 1 to 1000 | Max map-change DMs per minute per user. Repeats of the same map (for example one map live on two servers) are always collapsed to one DM and do not count against this |
| `MAX_FOLLOWS_PER_USER` | No | `50` | 1 to 10000 | Maximum maps a single user may follow at once |
| `MAX_NOTIFICATION_RECIPIENTS` | No | `200` | 1 to 10000 | Maximum users DMed for a single map change; a truncated fanout is logged |

Rate limits, the user cache and the per-map notification history are all held in memory, so a
restart clears every rate limit currently in effect.

## Server Configuration

Add your servers to `servers.json`:

```json
{
  "ServerName": {
    "ip": "IP_ADDRESS:PORT",
    "nick": "Display Name",
    "protocol": "csgo",
    "keywords": ["keyword1", "keyword2"]
  }
}
```

**Maximum of 25 servers**, because the embed adds one field per server and Discord caps an
embed at 25 fields.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ip` | string | Yes | Server IP/FQDN, optionally with a port (e.g., `127.0.0.1:27015`). The port defaults to `27015` when omitted. IPv6 is not supported |
| `nick` | string | Yes | Display name shown in embeds (max 100 characters) |
| `protocol` | string | No | Game protocol (default: `csgo`), from the [supported games list](https://github.com/gamedig/node-gamedig/blob/master/GAMES_LIST.md) |
| `keywords` | array | Yes | Search keywords, at least one. Each must be lowercase, free of leading and trailing whitespace, at most 32 characters, and unique across all servers, since a lookup returns the first match |
