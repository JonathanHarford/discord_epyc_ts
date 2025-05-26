# Guild Command Registration

This document explains how to register commands to a specific guild (server) instead of globally.

## Benefits of Guild Commands

There are several benefits to registering commands to a specific guild instead of globally:

1. **Faster updates** - Guild commands update almost instantly (a few seconds), while global commands can take up to an hour to propagate.
2. **Better for development** - Perfect for testing new commands without affecting all servers.
3. **Server-specific features** - Allows for commands that only make sense in certain servers.

## Setup

### 1. Add your guild ID to the environment

Add your Discord guild (server) ID to the `.env` file:

```
DISCORD_GUILD_ID=YOUR_GUILD_ID_HERE
```

Replace `YOUR_GUILD_ID_HERE` with your actual guild ID.

### 2. How to find your guild ID

To find your guild ID:
1. Enable Developer Mode in Discord (User Settings > App Settings > Advanced > Developer Mode)
2. Right-click on your server name and select "Copy ID"

## Usage

### Using npm Scripts

The following npm scripts are available for guild command management:

```bash
# Register commands to guild (uses DISCORD_GUILD_ID from .env)
npm run commands:register:guild

# Register commands globally
npm run commands:register:global

# Clear all commands from guild
npm run commands:clear:guild

# Clear all global commands
npm run commands:clear:global
```

### Automatic Guild Registration

With the `DISCORD_GUILD_ID` set in your `.env` file, commands will automatically register to that guild when you run the standard registration command:

```bash
npm run commands:register
```

### Manual Command Line Arguments

You can also manually specify whether to use guild or global registration by adding parameters:

```bash
# For guild registration
npm run commands:register guild

# For global registration
npm run commands:register global
```

### Switching Between Guild and Global

During development, you'll typically want to use guild registration for faster updates. When you're ready to release your changes, you can switch to global registration.

## Command Management

The following commands work for both guild and global registrations:

```bash
# View all commands
npm run commands:view

# Register commands
npm run commands:register

# Delete a command
npm run commands:delete COMMAND_NAME

# Rename a command
npm run commands:rename OLD_NAME NEW_NAME

# Clear all commands
npm run commands:clear
```

## Current Command Structure

The bot implements the following command hierarchy:

### `/admin` - Administrative Commands
Administrative commands for managing the bot (requires appropriate permissions).

#### Player Management (`/admin player`)
- `/admin player list [season] [banned]` - List all players
  - `season` (optional): Filter players by season ID
  - `banned` (optional): Show only banned players
- `/admin player show user` - Show player details
  - `user` (required): The user to show details for
- `/admin player ban user [reason]` - Ban a player from participating
  - `user` (required): The user to ban
  - `reason` (optional): Reason for the ban
- `/admin player unban user` - Unban a player
  - `user` (required): The user to unban

#### Season Management (`/admin season`)
- `/admin season list [status]` - List all seasons
  - `status` (optional): Filter by status (Setup|Pending Start|Open|Active|Completed|Terminated)
- `/admin season show season` - Show season details
  - `season` (required): The ID of the season to show details for
- `/admin season config [options]` - View or update default season configuration
  - `turn_pattern` (optional): Turn pattern (e.g., "writing,drawing")
  - `claim_timeout` (optional): Time limit for claiming turns (e.g., "1d", "2h")
  - `writing_timeout` (optional): Time limit for writing turns (e.g., "1d", "2h")
  - `writing_warning` (optional): Warning time before writing timeout (e.g., "1h", "30m")
  - `drawing_timeout` (optional): Time limit for drawing turns (e.g., "1d", "2h")
  - `drawing_warning` (optional): Warning time before drawing timeout (e.g., "10m", "5m")
  - `open_duration` (optional): How long seasons stay open for joining (e.g., "7d", "3d")
  - `min_players` (optional): Minimum number of players required
  - `max_players` (optional): Maximum number of players allowed
- `/admin season kill id` - Terminate a season
  - `id` (required): The ID of the season to terminate

#### Game Management (`/admin game`)
- `/admin game list [status]` - List all on-demand games
  - `status` (optional): Filter by status (Open|Active|Completed|Terminated)
- `/admin game show id` - Show game details
  - `id` (required): The ID of the game to show details for
- `/admin game kill id` - Terminate a game
  - `id` (required): The ID of the game to terminate
- `/admin game add_test_player id` - Add a virtual test player to a game
  - `id` (required): The ID of the game to add a test player to
- `/admin game config [options]` - View or update default game configuration
  - `turn_pattern` (optional): Turn pattern (e.g., "writing,drawing")
  - `writing_timeout` (optional): Time limit for writing turns (e.g., "1d", "2h")
  - `writing_warning` (optional): Warning time before writing timeout (e.g., "1h", "30m")
  - `drawing_timeout` (optional): Time limit for drawing turns (e.g., "1d", "2h")
  - `drawing_warning` (optional): Warning time before drawing timeout (e.g., "10m", "5m")
  - `stale_timeout` (optional): Time before a game goes stale (e.g., "3d", "1w")
  - `min_turns` (optional): Minimum number of turns required
  - `max_turns` (optional): Maximum number of turns allowed
  - `returns` (optional): Return policy for players (e.g., "2/3" for 2 times per game with 3 turns between)
  - `test_mode` (optional): Enable or disable test mode with shortened timeouts

#### Channel Configuration (`/admin channel`)
- `/admin channel config [options]` - Configure bot channels
  - `announce` (optional): Channel for game announcements
  - `completed` (optional): Channel for completed games
  - `admin` (optional): Channel for admin notifications

### `/dev` - Developer Commands
Developer commands for debugging and development.

- `/dev info` - Get development information

### `/help` - Help Commands
Find help or contact support.

- `/help "Contact Support"` - Get support contact information
- `/help "Commands"` - Get command help

### `/info` - Bot Information
View bot information and utilities.

- `/info "About"` - About the bot
- `/info "Translate"` - Translation information

### `/season` - Season Management and Participation
Main commands for season management and participation.

#### Season Operations
- `/season list` - List all public open seasons plus seasons the user is in
- `/season show season` - Get status information for a season
  - `season` (required): The ID of the season to check status for
- `/season join season` - Join an existing open season
  - `season` (required): The ID of the season to join
- `/season new [options]` - Start a new season of the game
  - `open_duration` (optional): How long the season is open for joining (e.g., "7d", "24h")
  - `min_players` (optional): Minimum number of players required to start
  - `max_players` (optional): Maximum number of players allowed to join
  - `turn_pattern` (optional): Pattern of turns (e.g., "writing,drawing")
  - `claim_timeout` (optional): Time allowed to claim a turn offer (e.g., "1d", "12h")
  - `writing_timeout` (optional): Time allowed to submit a writing turn (e.g., "1d", "8h")
  - `drawing_timeout` (optional): Time allowed to submit a drawing turn (e.g., "1d", "1h")

### `/game` - On-Demand Game Management
Commands for creating and managing individual games outside of seasons.

#### Game Operations
- `/game list` - List your active games and available games to join
- `/game show id` - Get status information for a specific game
  - `id` (required): The ID of the game to check status for
- `/game new [options]` - Start a new on-demand game
  - `turn_pattern` (optional): Pattern of turns (e.g., "writing,drawing")
  - `writing_timeout` (optional): Time allowed to submit a writing turn (e.g., "1d", "8h")
  - `drawing_timeout` (optional): Time allowed to submit a drawing turn (e.g., "1d", "1h")
  - `min_turns` (optional): Minimum number of turns required
  - `max_turns` (optional): Maximum number of turns allowed
  - `max_players` (optional): Maximum number of players allowed to join
- `/game join [id]` - Join an existing open game
  - `id` (optional): The ID of the specific game to join (joins any available if not specified)

### `/ready` - Turn Management (DM Only)
Used in direct messages to claim and manage turns during active seasons.

- `/ready` - Confirm readiness to take your turn

## Command Permissions

- **Admin commands** (`/admin`): Require server administrator permissions
- **Developer commands** (`/dev`): Restricted to bot developers
- **Season commands** (`/season`): Available to all users
- **Game commands** (`/game`): Available to all users
- **Help/Info commands** (`/help`, `/info`): Available to all users
- **Ready command** (`/ready`): Available in DMs only during active seasons or games

## Troubleshooting

- If commands aren't appearing in your server, make sure you've entered the correct guild ID.
- Remember that guild commands are only visible in the specified server.
- Global commands take up to an hour to appear after registration.
- Admin commands require appropriate server permissions to be visible.
- The `/ready` command only works in direct messages with the bot during active seasons. 