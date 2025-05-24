# EPYC Discord Bot

A Discord bot implementation of _Eat Poop You Cat_ (aka _Broken Picture Telephone_ aka _Telepictionary_ aka _The Caption Game_ aka _Doodle or Die_ aka _Drawception_ aka _Telestrations_ aka _Scribblish_ aka _Gartic Phone_), an _exquisite corpse_ party game that combines elements of Telephone and Pictionary.

## What is EPYC?

EPYC (Eat Poop You Cat) is a party game where:

1. **Initial Turn**: The first player writes a sentence or phrase
2. **Drawing Turn**: The second player draws an illustration based solely on that sentence
3. **Describing Turn**: The third player writes a sentence based solely on the drawing (without seeing the original sentence)
4. **Alternating Turns**: This pattern continues, alternating between writing and drawing
5. **Reveal**: At the end, the full sequence is revealed, showing how the original sentence evolved through the game

## How is this different from other EPYC apps?

- It's played entirely in Discord
- You're not limited to a crappy 8-color drawing widget. Use Procreate, Photoshop, or draw by hand and snap a photo!
- Instead of a single game played with strangers over a few minutes, you simultaneously play as many games as there are players over the course of days, weeks, or months.

## Features

### Season Games (Primary Mode)
- **Season Creation**: Start a new season with `/new season` command
- **Player Joining**: Players join seasons with `/join season:<id>`
- **Automatic Turn Distribution**: Bot intelligently assigns turns to players via DM
- **Turn Claiming**: Players use `/ready` in DMs to claim offered turns
- **Content Submission**: Players submit text or images directly in DMs
- **Timeout Management**: Configurable timeouts for claiming and submitting turns
- **Season Completion**: Full game sequences revealed when season completes

### Game Management
- **Multiple Concurrent Games**: Each season creates one game per player
- **Turn Tracking**: Sophisticated turn state management (AVAILABLE → OFFERED → PENDING → COMPLETED)
- **Player Logic**: Smart algorithm ensures fair turn distribution and game balance
- **Progress Monitoring**: `/status season:<id>` shows current progress

### Administrative Features
- **Season Termination**: Admins can terminate seasons with `/admin terminate season:<id>`
- **Player Management**: Ban/unban players with `/admin ban` and `/admin unban`
- **Season Listing**: View all seasons with `/admin list seasons`
- **Configuration**: Customize season defaults with `/config seasons`

### Technical Features
- **Database-Driven**: PostgreSQL with Prisma ORM for reliable data management
- **Scheduled Jobs**: Automatic timeout handling and season activation
- **Discord Integration**: Rich DM interactions and slash command support
- **Comprehensive Testing**: Unit, integration, and end-to-end tests
- **TypeScript**: Fully typed for reliability and maintainability

## Game Flow

### Starting a Season
1. Player uses `/new season` in a Discord channel or DM
2. Other players join with `/join season:<id>`
3. Season activates when `max_players` is reached or `open_duration` expires
4. Bot creates one game per player and offers initial writing turns

### Playing Turns
1. Bot DMs players when turns are offered
2. Players use `/ready` to claim turns
3. Players submit content (text for writing turns, images for drawing turns)
4. Bot processes submission and offers next turn to appropriate player
5. Process continues until all games complete

### Season Completion
- Season completes when all games finish (each player has participated in each game)
- Bot reveals full sequences showing how each original sentence evolved
- Results posted in the channel where season started (or DM'd if started in DM)

## Commands

### Player Commands
- `/new season [options]` - Start a new season
- `/join season:<id>` - Join an existing season  
- `/status season:<id>` - Check season progress
- `/ready` - Claim an offered turn (DM only)

### Admin Commands
- `/admin terminate season:<id>` - End a season prematurely
- `/admin ban user:@user [reason]` - Ban a player
- `/admin unban user:@user` - Unban a player
- `/admin list seasons [status]` - List seasons
- `/admin list players [options]` - List players

### Configuration Commands
- `/config seasons view` - View current default settings
- `/config seasons set [options]` - Update default settings

## Setup

### Prerequisites
- Node.js 18+ and pnpm
- PostgreSQL database
- Discord bot token

### Installation

1. **Clone and install dependencies**
   ```bash
   git clone <repository-url>
   cd epyc_discord_bot
   pnpm install
   ```

2. **Database setup**
   ```bash
   # Set up your PostgreSQL database
   # Copy .env.example to .env and configure DATABASE_URL
   cp .env.example .env
   
   # Run database migrations
   pnpm prisma migrate deploy
   ```

3. **Discord bot setup**
   - Create a bot in [Discord Developer Portal](https://discord.com/developers/applications/)
   - Copy `config/config.example.json` to `config/config.json`
   - Add your bot token and client ID to the config file

4. **Register commands**
   ```bash
   pnpm run commands:register
   ```

5. **Start the bot**
   ```bash
   pnpm start
   ```

## Configuration

### Season Settings
Configure default season parameters:
- `turn_pattern`: Order of turn types (`"writing,drawing"` or `"drawing,writing"`)
- `claim_timeout`: Time to claim offered turns (default: `"1d"`)
- `writing_timeout`: Time to submit writing turns (default: `"1d"`)
- `drawing_timeout`: Time to submit drawing turns (default: `"1d"`)
- `open_duration`: How long season stays open for joining (default: `"7d"`)
- `min_players`: Minimum players to start season (default: `6`)
- `max_players`: Maximum players per season (default: `20`)

### Environment Variables
- `DATABASE_URL`: PostgreSQL connection string
- `DISCORD_TOKEN`: Bot token from Discord Developer Portal

## Development

### Running Tests
```bash
# Unit tests
pnpm test

# Integration tests  
pnpm test:integration

# End-to-end tests
pnpm test:e2e

# All tests
pnpm test:all
```

### Database Management
```bash
# Generate Prisma client
pnpm prisma generate

# Run migrations
pnpm prisma migrate dev

# Reset database
pnpm prisma migrate reset

# View database
pnpm prisma studio
```

### Development Scripts
```bash
# Development mode with hot reload
pnpm dev

# Build for production
pnpm build

# Register commands to specific guild (faster for testing)
pnpm run commands:register:guild

# Clear guild commands
pnpm run commands:clear:guild
```

## Architecture

### Core Services
- **SeasonService**: Manages season lifecycle and player joining
- **TurnService**: Handles turn claiming, submission, and state transitions
- **TurnOfferingService**: Implements next player selection logic
- **SchedulerService**: Manages timeouts and scheduled tasks
- **PlayerService**: Player management and ban/unban functionality

### Database Schema
- **Season**: Season metadata and configuration
- **Game**: Individual games within seasons
- **Turn**: Turn data with state tracking
- **Player**: Player information and ban status
- **SeasonConfig**: Configurable season parameters

### Key Design Principles
- **Platform Independence**: Core logic abstracted from Discord-specific APIs
- **Standardized Returns**: Services return platform-agnostic message instructions
- **Comprehensive Testing**: Full test coverage including end-to-end season playthroughs
- **Type Safety**: Full TypeScript implementation with strict typing

## Future Enhancements

- **OnDemand Games**: Standalone games with `/new game` and `/play` commands
- **Turn Flagging**: Content moderation and admin review workflow
- **Advanced Analytics**: Game statistics and player performance tracking

