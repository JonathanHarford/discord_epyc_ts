# What is Eat Poop You Cat?

Eat Poop You Cat (EPYC) is a party game that combines elements of the classic games "Telephone" and "Pictionary." The name comes from a memorable example of how the game can produce humorous results. It's also known by other names such as "Broken Picture Telephone" or "Telephone Pictionary."

# Rules

## Basic Rules

1. The first player writes a sentence or phrase.
2. The second player draws an illustration based solely on that sentence.
3. The third player writes a sentence based solely on the drawing (without seeing the original sentence).
4. This pattern of alternating between writing and drawing continues until all players have participated. Each player takes one and only one turn per game.
5. At the end, the final results are revealed to everyone, showing how the original sentence evolved through the game.

## Discord Bot Implementation

In the Discord implementation:

* A game is started on a Discord server by the first player, who is immediately DM'd a request for an initiating turn.
* When another player decides to `/play` EPYC, they are assigned to the active game they have not yet played in that will become stale soonest (based on its last update time and stale timeout setting), and are DM'd the previous turn.
* When the previous turn is a writing turn, the player responds to the DM directly with an uploaded image.
* When the previous turn is a drawing turn, the player responds to the DM directly with a sentence or phrase.
* Players can only see the immediately preceding completed turn.
* The bot enforces time limits for each turn (configurable).

## Game Flow

1. **Game Initialization**:
   - A player uses the `/start` command to initiate a game, setting optional rules/parameters. 
   - The bot immediately DMs the first player for a starting sentence.

2. **Turn Sequence**:
   - Players signal their intent to play using the `/play` command
   - They are assigned to a game and the bot DMs them the previous player's completed turn in the game
     - If no game is available, they are told to `/start` a new game if they wish to play
   - The player responds to the DM with their turn

3. **Game Conclusion**:
   - When 
     1. a minimum number (configurable) of turns have been completed and the game has reached a certain level of staleness (configurable), or
     2. the game has reached a maximum number (configurable) of turns, then
   - The bot posts the complete sequence in the "completed" channel (see below)
      - Users can react and comment on the results
   - The game state is archived for future reference

## Special Considerations
- **Time Limits**: Each player has a configurable amount of time to complete their turn
- **Turn Timeouts**: If a player doesn't respond within the time limit, they are skipped and receive a DM notification about their turn timing out. The game becomes available to other players.
- **Game Completion**: A game is marked as completed when it has reached the minimum number of turns and has been inactive for the stale timeout period. All players receive a notification when the game is completed.
- **Moderation**: Server administrators can end games prematurely if needed
- **Multiple Games**: Multiple games are played simultaneously, but each player may only ever have one pending turn at a time (this rule does not apply to seasons). If a player with a pending turn tries `/play` or `/start`, they will be told to complete their current turn first.
- **Turn Flags**: After being DM'd a previous turn, players have the ability to flag the turn as spam, low-effort, or offensive. Games with flagged turns are paused and the game is posted to the "admin" channel (see below). The admin can unpause the game by either deleting the turn, removing the flag, or banning the player (which also deletes the turn). When a turn is deleted, the game becomes active again.

## Seasons

A season is a collection of games played by one group of players concurrently on one server. When a player uses the `/season open_duration:<duration>` command, a new season is created and a three-word id is generated, that the player can share with friends. At that point, other players can join the season using the `/season join id:<id>` command. Once the open duration has passed:
* The season becomes active, and no more players can join it.
* One game is created per each player, and that player is DM'd a request for an initiating turn.
* Games proceed in a similar manner to normal EPYC games but:
  * A game is not completed until every player has played in it (or been skipped due to time out). 
  * The season is not completed until every game has been completed. 
    * Therefore, a completed season that has N players contains N games, and each of those games has N turns.
  * Turns in a season cannot be flagged, and `min_turns`, `max_turns`, `returns`, and `stale_timeout` are ignored.
  * Pending turns are portioned out such that:
    * If player B plays after player A in one game (in that season), player B should not play after player A in any other game in that season.
    * Players should have approximately the same number of writing and drawing turns

# Terminology

## Game Terminology

### EPYC
- **EPYC**: "Eat Poop You Cat" - The full name of the game
- **Telephone Pictionary**: An alternative name for the game
- **Broken Picture Telephone**: Another alternative name for the game

### Game Elements
- **Player**: A Discord user participating in an EPYC game.
- **Turn**: A single interaction by a player (either writing a description or drawing an image)
- **Writing Turn**: A turn where a player writes a text description
- **Drawing Turn**: A turn where a player creates and submits an image
- **Chain**: The sequence of turns in a game. 
- **Game**: An instance of an EPYC game. A game contains one chain.
- **Game ID**: Unique identifier for a game instance
- **Turn ID**: Unique identifier for a specific turn in a game
- **Season**: A collection of games played by one group of players concurrently on one server (see Season definition)
- **Standard Game**: A game with the following rules:
  - `turn_pattern`: `writing,drawing` 
  - `returns`: undefined (no returning)
- **Flash Game**: (informal) A game with short timeouts:
  - `writing_timeout`: <= 2 minutes
  - `drawing_timeout`: <= 10 minutes
  - `stale_timeout`: <= 15 minutes

### Game Rules
- `turn_pattern`: The pattern of turn types in a game.
  - Possible values: `drawing,writing` or `writing,drawing`
  - Default: `writing,drawing` (Starts with a writing turn, alternates between writing and drawing turns)
- `returns`: Overrides the "one turn per player per game" rule. The number of times a player can return to a game, and the number of turns that must pass before a player can return. Syntax: `returns:<number of returns>/<turn gap>`
  - Default: undefined (no returning)
- `writing_timeout`: The time limit for a player to write a description.
  - Default: 1d
- `writing_warning`: The amount of time before a writing turn times out that a warning is posted to the player.
  - Default: 1m
- `drawing_timeout`: The time limit for a player to draw an image.
  - Default: 1d
- `drawing_warning`: The amount of time before a drawing turn times out that a warning is posted to the player.
  - Default: 10m
- `stale_timeout`: The time limit for a game to be considered stale.
  - Default: 7d
- `min_turns`: The minimum number of completed turns a game must have before it can be completed.
  - Default: 6
- `max_turns`: The maximum number of completed turns a game can have.
  - Default: undefined (no maximum)

### Season Rules
- `open_duration`: The amount of time a season is open for users to join.
  - Default: 7d
- `min_players`: The minimum number of players required to start a season.
  - Default: 2
- `max_players`: The maximum number of players allowed in a season.
  - Default: undefined (no maximum)

Either `open_duration` or `max_players` must be set. If both are set, the season will stay open until _either_ the open duration has passed _or_ the maximum number of players has been reached.

### Game States
- **Setup**: Game is being created, initial parameters set. Instantly becomes pending.
- **Pending**: Game is waiting for a specific player to submit their turn
- **Active**: Game is in progress but not waiting for a specific player's turn
- **Paused**: Game is temporarily halted due to flagged content or admin action
- **Completed**: Game has finished normally
- **Terminated**: Game was ended prematurely by an admin
- **Archived**: Game data has been archived (final state)
- **Stale**: Not a formal state, but a condition where a game has been inactive for longer than the stale timeout

### Turn States
- **Created**: Turn is initially created. Instantly becomes pending.
- **Pending**: Turn is assigned to a player who is working on it
- **Completed**: Turn has been submitted
- **Flagged**: Turn has been flagged for review
- **Removed**: Turn has been removed due to timeout or admin action

### Player States
- **Not Banned**: Player has not been banned by an admin
- **Banned**: Player has been banned by an admin

## User Terminology
- **Game Creator**: The player who initiated the game with the `/start` command
- **Test Player**: A virtual player created for testing purposes
- **Admin**: A server administrator with additional privileges for game moderation

## System Terminology

- **Test Mode**: A special mode that allows administrators to create and control test players, with shorter timeouts and relaxed requirements for faster testing
- **Announcement Channel**: The channel where new games/seasons are announced
- **Completed Channel**: The channel where the bot posts the full sequence of a completed season (defaults to same as announcement channel)
- **Admin Channel**: The private channel where the bot posts flagged turns and admin-related messages
- **Uncensored Channel**: A private channel where uncensored games can be played

## Moderation Terminology

- **Flag**: Marking a turn as inappropriate or problematic, causing the game to pause
- **Ban**: Banning a user from playing on a server
- **Admin Commands**: Special commands only available to server administrators or bot administrators 

# Also

- Time durations are stored as human-readable strings, e.g.
  - `7d`
  - `12h`
  - `30m`
  - `30s`