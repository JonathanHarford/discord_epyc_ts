# Overview
Eat Poop You Cat (EPYC) is a party game that combines elements of the classic games "Telephone" and "Pictionary." The name comes from a memorable example of how the game can produce humorous results. It's also known by other names such as "Telestrations" or "Telephone Pictionary." This document outlines the requirements for a Discord bot implementation of EPYC.

The bot will support two main modes of play: **Season Games** and **OnDemand Games**. **Season Games are the primary focus for the Minimum Viable Product (MVP).**

# Core Features

## Basic Gameplay (Applicable to both Game Types)
1.  **Initial Turn**: The first player writes a sentence or phrase.
2.  **Drawing Turn**: The second player draws an illustration based solely on that sentence.
3.  **Describing Turn**: The third player writes a sentence based solely on the drawing (without seeing the original sentence).
4.  **Alternating Turns**: This pattern of alternating between writing and drawing continues. Each player typically takes one turn per game.
5.  **Reveal**: At the end, the final results are revealed to everyone, showing how the original sentence evolved through the game.

## Discord Bot Implementation (MVP focuses on Seasons)

### Season Games (MVP)
* **Game Start**: Seasons are initiated on a Discord server in a specific channel or via DM using the `/new season` command. 
* **Joining a Season**: Players use `/join season:<id>`.
* **Turn Assignment & Submission (DM)**:
    * When a turn becomes available in a season game (it is **AVAILABLE**), the bot determines the next player based on specific logic (detailed below). The turn is then **OFFERED** to this player via DM.
    * The player uses `/ready` in DM to claim the turn, making it **PENDING** (the turn is now **ASSIGNED**).
    * If the previous turn was writing, the player responds to the DM directly with an uploaded image.
    * If the previous turn was a drawing, the player responds to the DM directly with a sentence or phrase.
* **Next Player Logic for Season Turns**:
    * When a turn is AVAILABLE, the bot selects the next player to be OFFERED the turn based on a set of rules designed to ensure players play in every game once, avoid multiple pending turns, and balance turn types and playing order. The detailed logic is described in the [Next Player Logic](mdc:docs/NEXT_PLAYER_LOGIC.md) document.
* **Turn Visibility**: Players can only see the immediately preceding completed turn that was OFFERED/ASSIGNED to them.
* **Time Limits**: The bot enforces configurable time limits for claiming (`claim_timeout`) and submitting (`writing_timeout`, `drawing_timeout`) turns in season games.
    * **Unclaimed Turns**: If a player does not use `/ready` to claim an OFFERED turn within the `claim_timeout`, the assignment is dismissed. The turn becomes AVAILABLE again to be OFFERED to another eligible player. The original player can still be assigned turns in that game later.
    * **Claimed (PENDING) but Untaken Turns**: If a player claims a turn with `/ready` but fails to submit it within the `writing_timeout` or `drawing_timeout`, they are skipped for that specific turn in that game. The turn becomes AVAILABLE again to be OFFERED to another eligible player, and the player who failed to submit receives a message indicating they were skipped.
* **Season/Game Conclusion**:
    * A game within a season concludes when every player in the season has played in it (or been skipped due to timeout).
    * A season concludes when every game within that season has been completed. A completed season with N players contains N games, each aiming for N turns (though some may have fewer if players are skipped).
    * When a season is completed, the full sequence for *each* game in the season is revealed.
    * The reveal occurs in the channel where the season was initiated. If initiated via DM, the completed season sequences are DM'd to each player in the season.

### OnDemand Games (Future Enhancement)
* **Game Start**: A game is initiated on a Discord server by the first player using the `/new game` command. This player is immediately DM'd a request for an initiating turn.
* **Joining a Game**: When another player uses the `/play` command, they are assigned to the active game they have not yet played in that will become stale soonest (based on its last update time and stale timeout setting). They are then DM'd the previous turn.
* **Submitting Turns (DM)**:
    * If the previous turn was writing, the player responds to the DM directly with an uploaded image.
    * If the previous turn was a drawing, the player responds to the DM directly with a sentence or phrase.
* **Turn Visibility**: Players can only see the immediately preceding completed turn.
* **Time Limits**: The bot enforces configurable time limits for each turn.
* **Game Conclusion**:
    * A game concludes when:
        1.  A minimum number (configurable) of turns have been completed AND the game has reached a certain level of staleness (configurable), OR
        2.  The game has reached a maximum number (configurable) of turns.
    * The bot posts the complete sequence in the "completed" channel (defaults to announcement channel).
        * Users can react and comment on the results.

## Game Flow (MVP focuses on Seasons)

### Season Game Flow

See examples in [SEASON_FLOWS.md](mdc:docs/SEASON_FLOWS.md).

1.  **Season Initialization**:
    * A player uses the `/new season` command in a channel or DM, setting optional rules/parameters (like `open_duration`, `min_players`, `max_players`). The channel/DM context determines where the completed season is announced/sent.
    * Other players join using `/join season:<id>`.
    * Once the `open_duration` has passed or `max_players` is reached, the season becomes active; no more players can join.
    * One game is created per player in the season (N players = N games).
    * Each player is immediately OFFERED the initiating turn for one of the season's games via DM.
2.  **Turn Sequence within a Season**:
    * Players use `/ready` in DM to claim an OFFERED turn (making it PENDING/ASSIGNED).
    * The player responds to the DM with their turn (text or image).
    * Upon completion, the bot processes the turn. If there are more turns needed in that game and eligible players, the next turn becomes AVAILABLE and is then OFFERED to the selected player based on the Next Player Logic (detailed in Core Features and [Next Player Logic](mdc:docs/NEXT_PLAYER_LOGIC.md)).
    * This continues until all turns in all games are completed (or skipped).
3.  **Season Conclusion**:
    * When all games in a season are completed (each player has played their assigned turns in each game, or been skipped), the season concludes.
    * The bot posts or DMs the full sequence of all games in the season.

### OnDemand Game Flow (Future Enhancement)
1.  **Game Initialization**:
    * A player uses the `/new game` command to initiate a game, setting optional rules/parameters.
    * The bot immediately DMs the first player for a starting sentence.
2.  **Turn Sequence**:
    * Players signal their intent to play using the `/play` command.
    * They are assigned to an active game, and the bot DMs them the previous player's completed turn.
        * If no game is available, they are told to `/new game` if they wish to play.
    * The player responds to the DM with their turn.
3.  **Game Conclusion**:
    * (See Core Features -> OnDemand Games -> Game Conclusion)

## User Experience (MVP focuses on Seasons)

## Key User Flows (MVP focuses on Seasons)
* **Starting a Season**: User initiates `/new season` in a channel or DM, receives DM for their first turn OFFER, submits their turn.
* **Joining/Playing a Season**: User joins a season via `/join season:<id>`, then repeatedly plays turns (using `/ready` to CLAIM OFFERED turns and responding via DM with text/image) as they are assigned.
* **Viewing Completed Seasons/Games**: Users view the full chains of all games in a completed season in the designated channel or via DM.
* **Checking Season Status**: Users use `/status season:<name>` to see the progress of games within a season (e.g., how many turns left per game).

## UI/UX Considerations (MVP focuses on Seasons)
* **Direct Messages (DMs)**: Core gameplay (receiving turn OFFERs, CLAIMING turns with `/ready`, submitting turns) happens via DMs with the bot.
* **Slash Commands**: Users interact with the bot using Discord slash commands (`/new season`, `/join season`, `/status season`, `/ready`, `/config seasons`, etc.). `/new game` and `/play` are lower priority (OnDemand).
* **Notifications**:
    * Players receive DM notifications when a turn is OFFERED to them.
    * Players receive DM notifications for turn timeout warnings.
    * Players receive DM notifications if they are skipped for failing to submit a claimed turn.
    * All players in a season receive a notification in the season channel (or via DM if season started in DM) when the season is completed.
* **Clarity**: Instructions and prompts from the bot should be clear and concise, especially regarding the difference between a turn being AVAILABLE, OFFERED, CLAIMED (PENDING), and ASSIGNED.
* **Error Handling**: Users should receive informative messages if a command fails or an action cannot be performed (e.g., trying to `/ready` when no turn is OFFERED, trying to `/join season` that doesn't exist or is closed).

## User Terminology
* **Season Creator**: The player who initiated the season with the `/new season` command.
* **Player**: A Discord user participating in an EPYC season/game.
* **Admin**: A server administrator with additional privileges for moderation (flagging, banning, terminating).
* **Test Player**: A virtual player created for testing purposes.

# Technical Architecture
See [TECHNICAL_ARCHITECTURE.md](mdc:docs/TECHNICAL_ARCHITECTURE.md)

## Core Architectural Principles
- **Chat Platform Independence**: Services should be designed to be independent of any specific chat platform (e.g., Discord). Core logic should be abstracted from platform-specific APIs.
- **Standardized Service Method Returns**: Service methods that are invoked by bot commands should return a common, platform-agnostic data structure (e.g., a `MessageInstruction` type). This structure will then be translated by a platform-specific adapter into the appropriate format for the target chat platform. This ensures that the core service logic remains reusable across different platforms.

## System Terminology
* **Announcement Channel**: Channel for new season announcements (defaults to where `/new season` is used if in a channel).
* **Completed Channel**: Channel where completed game sequences are posted (defaults to announcement channel if season started in a channel; otherwise DM'd).
* **Admin Channel**: Private channel for flagged turns and admin messages. For the MVP (Seasons), turn flagging is disabled, so this is less critical initially but still needed for admin commands like ban/unban.
* **Uncensored Channel**: Optional private channel for uncensored games (less relevant for MVP Seasons where flagging is off).

# Development Roadmap

The MVP focuses exclusively on the **Season Game** type. OnDemand Games are a future enhancement.

## Future Enhancements
- OnDemand Game type (`/new game`, `/play`).
- OnDemand Game rules (`min_turns`, `max_turns`, `returns`, `return_cooldown`, `stale_timeout`).
- OnDemand Game flow (assigning players to the 'soonest stale' game).
- Turn Flagging and Admin Channel workflow.
- Uncensored Channel functionality.
- More sophisticated end-of-season logic for handling edge cases with few remaining turns/players.
- Additional reporting/status commands.

# Logical Dependency Chain (MVP Focus)

1.  **Database Schema**: Define tables for Seasons, Games, Players (in season/game context), Turns, and configurations. Ensure relationships support the season structure (Season has Players, Season has Games, Game is in Season, Game has Turns, Turn belongs to Player).
2.  **Basic Bot Infrastructure**: Discord connection, command handling framework, DM capabilities.
3.  **Configuration Loading/Saving**: Implement reading/writing of `.taskmasterconfig` or similar for season defaults, and loading `config/config.json` for guild ID.
4.  **Season Core Logic**:|
    *   `/new season` command handler: Create season entry in DB, generate ID, set initial state, DM creator for first turn offer.
    *   `/join season` command handler: Add player to season in DB, validate season state (open).
    *   Season Activation Logic: Background task or triggered on join/timeout to check `open_duration`/`max_players` and transition season state, create N games, and OFFER initial turns.
5.  **Turn Core Logic (Season Specific)**:|
    *   DM handling for `/ready`: Mark turn as PENDING/ASSIGNED, cancel claim timer, set submission timer.
    *   DM handling for turn submission (image/text): Validate input, mark turn as COMPLETED, record content, cancel submission timer.
    *   Next Player Selection Logic: Implement the specified algorithm (`MUSTs` and `SHOULDs`) to select the next player for a game when a turn is completed or a player is skipped. This is complex and core to season flow.
    *   Turn OFFERing Mechanism: Logic to send the DM notification to the selected player when a turn is OFFERED.
6.  **Timeout Handling**:|
    *   Task Scheduler integration: Schedule claim and submission timers.
    *   Timeout Event Handlers: Implement logic for `claim_timeout` (dismiss offer, find next player) and `writing_timeout`/`drawing_timeout` (skip player, send message, find next player).
7.  **Completion Logic**:|
    *   Game Completion Check: Logic triggered after a turn is completed/skipped to check if the game is finished (all players played or skipped).
    *   Season Completion Check: Logic triggered after a game is completed to check if the season is finished (all games completed).
    *   Completion Announcement/DM: Logic to format and send the full game sequences when a season finishes.
8.  **`/status season` Command**: Query DB for season/game/turn states and format readable output (turns left per game).
9.  **Admin Commands**: Implement the specified admin functionalities interacting with the DB (ban/unban players, terminate season, list seasons/players).
10. **Development Commands**: Implement `pnpm run commands:register:guild` and `pnpm run commands:clear:guild` using the guild ID from `config/config.json`.

# Risks and Mitigations

## Potential Risks
* **Complexity of Next Player Logic**: Implementing the intricate logic for selecting the next player in Season Games while adhering to all constraints (`MUSTs` and `SHOULDs`) and handling edge cases (like the end-of-season scenario described) could be challenging.
* **Scalability of Turn Distribution**: Ensuring the Task Scheduler and turn assignment logic efficiently handle many concurrent seasons and turns for potentially large numbers of players.
* **Handling End-of-Season Edge Cases**: The scenario with few turns/players left where balancing turn types becomes difficult might require specific handling beyond the general logic.
* **User Confusion**: Players might be confused by the different turn states (AVAILABLE, OFFERED, PENDING, ASSIGNED) and the rules around claiming vs. submitting turns.

## Mitigations
* **Incremental Development & Testing**: Build and test the next player logic iteratively, focusing on one rule at a time. Create specific test cases for edge scenarios like the end-of-season state.
* **Optimize Database Queries**: Ensure efficient queries for retrieving player and turn data needed for the next player logic and status checks. Consider indexing relevant fields.
* **Refine Next Player Logic**: If standard logic struggles with end-of-season, analyze remaining turns and players and potentially use a modified or simpler assignment rule for the last few turns.
* **Clear Bot Messaging**: Provide very clear explanations in DMs regarding turn status, timeouts, and what is expected from the player (claim vs. submit). The `/status season` command will also help users understand progress.

# Appendix

## Game Terminology
* **EPYC**: "Eat Poop You Cat" - The full name of the game.
* **Telephone Pictionary / Telestrations**: Alternative names for the game.
* **Turn**: A single interaction by a player (either writing a description or drawing an image).
* **Writing Turn**: A turn where a player writes a text description.
* **Drawing Turn**: A turn where a player creates and submits an image.
* **Chain**: The sequence of turns in a game.
* **Game**: An instance of an EPYC game, containing one chain. In a season, each player has a game initiated by them.
* **Game ID**: Unique identifier for a game instance.
* **Turn ID**: Unique identifier for a specific turn in a game.
* **Season**: A collection of games played by one group of players concurrently on one server.
* **Season Game**: A game that is part of a larger season, where turns are distributed among season players.
* **OnDemand Game**: A standalone game joined by players using the `/play` command (Future Enhancement).

## Turn States (Updated for Seasons)
* **CREATED**: Turn initially created (instantly becomes AVAILABLE).
* **AVAILABLE**: The turn exists but is not currently assigned or offered to a specific player. Eligible to be OFFERED.
* **OFFERED**: The bot has selected a specific player for this turn and notified them via DM, waiting for them to CLAIM it with `/ready`.
* **PENDING**: The player has claimed the OFFERED turn using `/ready` and is currently working on it. (This turn is now considered ASSIGNED).
* **COMPLETED**: The player has submitted their response for the turn.
* **SKIPPED**: The player failed to submit a PENDING turn within the time limit. (Specific to Season Games).
* **FLAGGED**: Turn flagged for review (less relevant for MVP Seasons).
* **REMOVED**: Turn removed by admin action (less relevant for MVP Seasons).

## Player Status within a Season
* **ASSIGNED**: A player is considered ASSIGNED to a turn if it is currently PENDING for them, or if they have already COMPLETED or been SKIPPED for that turn in that game.

## Season Rules (Configurable Parameters)
* `turn_pattern`: `drawing,writing` or `writing,drawing`. Default: `writing,drawing`. (Determines the sequence of turn types within each game in the season).
* `claim_timeout`: Time limit for a player to claim an OFFERED turn using `/ready`. Default: `1d`.
* `writing_timeout`: Time limit for a player to submit a PENDING writing turn after claiming it. Default: `1d`.
* `writing_warning`: Time before writing turn timeout for a warning. Default: `1m`.
* `drawing_timeout`: Time limit for a player to submit a PENDING drawing turn after claiming it. Default: `1d`.
* `drawing_warning`: Time before drawing turn timeout for a warning. Default: `10m`.
* `open_duration`: Time a season is open for users to join. Default: `7d`.
* `min_players`: Minimum players required to start a season once the `open_duration` passes. Default: `2`.
* `max_players`: Maximum players in a season. Default: `undefined`.
    * _Either `open_duration` or `max_players` must be set for a season to become active. If both, the season closes when the first condition is met._

## OnDemand Game Rules (Future Enhancement)
* `return_count`: Number of additional times a player can take a turn in the same game. Default: `0`.
* `return_cooldown`: Number of turns by others before a player can return (if `return_count > 0`). Default: `null`.
* `stale_timeout`: Time limit for an OnDemand game to be considered stale. Default: `7d`.
* `min_turns`: Minimum completed turns for an OnDemand game completion. Default: `6`.
* `max_turns`: Maximum completed turns for an OnDemand game. Default: `undefined` (no maximum).

## Game States (Updated)
* **SETUP**: Game being created (instantly becomes PENDING or ACTIVE depending on type).
* **PENDING**: (Season) Waiting for players to join the season. (OnDemand - Future) Waiting for a specific player's turn.
* **ACTIVE**: (Season) Season is open for joining or games are in progress. (OnDemand - Future) Game is in progress, not waiting for a specific player.
* **PAUSED**: Halted due to flagged content or admin action (less relevant for MVP Seasons).
* **COMPLETED**: Game or Season finished normally.
* **TERMINATED**: Ended prematurely by an admin.
* **STALE**: (Condition, OnDemand only - Future) Inactive longer than `stale_timeout`.

## Player States
* **NOT_BANNED**: Player not banned by an admin.
* **BANNED**: Player banned by an admin.

## Moderation Terminology (MVP focus on Admin Commands)
* **Flag**: Marking a turn as inappropriate, pausing the game (less relevant for MVP Seasons).
* **Ban**: Banning a user from playing on a server.
* **Admin Commands**: Special commands for server/bot administrators.

## Time Durations
Time durations are stored as human-readable strings, e.g.:
* `7d`
* `12h`
* `30m`
* `30s`

## Command Reference (MVP Focus)
* `/new season [options]`: Start a new season.
* `/join season:<id>`: Join an existing season.
* `/status season:<name>`: Show the status of games in a season.
* `/ready`: Claim an OFFERED turn in DM.
* `/config seasons [options]`: View or set default season rules.
* `/admin terminate season:<id>`: End a season prematurely (Admin).
* `/admin ban user:@user`: Ban a user from playing (Admin).
* `/admin unban user:@user`: Unban a user (Admin).
* `/admin list seasons`: List active seasons (Admin).
* `/admin list players`: List players in seasons (Admin).
* `/new game [options]`: Start an OnDemand game (Future Enhancement).
* `/play`: Join an active OnDemand game (Future Enhancement).
* `/config game [options]`: View or set default OnDemand game rules (Future Enhancement).
* `/admin flag turn:<id>`: Flag a turn (Future Enhancement).
* `/admin remove turn:<id>`: Remove a turn (Future Enhancement).


## Example Flows
See `SEASON_FLOWS.md` (MVP focus)
See `ONDEMAND_FLOWS.md` (Future Enhancement - requires creation)

# Testing Requirements for New Commands
Whenever a new command is added, the following testing procedures must be implemented:
- Integration tests: Must be conducted against a test database. These tests should not interact with Discord.
- Unit tests: Must be developed for the logic layer of the command.
