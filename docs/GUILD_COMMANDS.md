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

## Troubleshooting

- If commands aren't appearing in your server, make sure you've entered the correct guild ID.
- Remember that guild commands are only visible in the specified server.
- Global commands take up to an hour to appear after registration. 