<Climb>
  <header>
    <id>MzMz</id>
    <type>feature</type>
    <description>Add the /play command to allow users to join an existing EPYC game. The command should assign the player to an active game that they haven't played in yet, prioritizing games that will become stale soonest. If no suitable game is available, the user should be informed.</description>
  </header>
  <newDependencies></newDependencies>
  <prerequisitChanges>
    - Need a way to determine game staleness (last updated time + stale timeout).
    - Need a way to track which players have played in which games.
  </prerequisitChanges>
  <relevantFiles>
    - `docs/PRD.md` (for game flow and rules)
    - `src/commands/chat/start-command.ts` (as a pattern for new command creation)
    - `src/services/game-play-service.ts` (a new service for game joining logic)
    - `src/database/database-service.ts` (for querying game and player states)
  </relevantFiles>
  <everythingElse>
    ## Feature Overview
    The `/play` command is a crucial part of the EPYC Discord bot, enabling users to participate in ongoing games. It bridges the gap between game creation (`/start`) and active gameplay.

    ## Requirements
    1.  **Command Registration**: The `/play` command should be registered as a chat input command.
    2.  **Game Assignment Logic**:
        *   The bot must find an active game that the invoking player has not yet participated in.
        *   If multiple such games exist, the bot should prioritize the game that is closest to becoming stale (based on the game's `updatedAt` and the game's setting's `staleTimeout`).
        *   If no suitable active game is found, the player should be informed and potentially prompted to `/start` a new game.
    3.  **Player State**:
        *   A player can only have one pending turn at a time across all games (excluding seasons). If a player uses `/play` while already having a pending turn, they should be notified to complete their current turn first.
    4.  **DM Interaction**:
        *   Upon successful assignment to a game, the bot should DM the player with the previous turn's content (either text or an image).
        *   The DM should clearly instruct the player on how to respond (e.g., "Reply to this message with your drawing" or "Reply to this message with your sentence").
    5.  **Error Handling**:
        *   Gracefully handle cases where no games are available.
        *   Gracefully handle cases where the player already has an active turn.
        *   Provide informative error messages to the user.
    6.  **Database Interaction**:
        *   Query for active games.
        *   Query for player participation in games.
        *   Update game state when a player joins (e.g., marking the game as pending for this player, updating `last_updated_at`).
        *   Record the new turn with a "pending" state.
    7.  **Structure**: Follow the pattern set by `start-command.ts` for command structure, including parameter handling, service utilization, and interaction responses.

    ## Design and Implementation
    8.  **Pure Game Selection Function**:
        *   Define a pure function (e.g., `selectNextGame(games: Game[], userId: string, now: Date): Game | null`).
        *   Location: e.g., `src/logic/game-selection.ts`
        *   Input: A list of active games (containing `id`, `updatedAt`, `settings.staleTimeout`, and player participation info), the user's ID, and the current timestamp.
        *   Logic:
            *   Filter out games according to the "returns" game setting (if no returns, filter out games the user has already played in).
            *   Calculate staleness for each remaining game (e.g., `game.updatedAt + game.settings.staleTimeout - now`).
            *   Sort games by ascending staleness (soonest to be stale first).
            *   Return the top game, or null if no suitable game.
    9.  **Game Join Service (`GameJoinService`)**:
        *   Location: `src/services/game-join-service.ts` (or similar)
        *   Responsibilities:
            *   Check if the player already has a pending turn across any game. If so, inform and exit.
            *   Fetch active games from `DatabaseService`.
            *   Fetch player's game participation history from `DatabaseService`.
            *   Call the pure `selectNextGame` function with the fetched data and current time.
            *   If a game is selected:
                *   Interact with `DatabaseService` to:
                    *   Add the player to the game's participants list (if not already there in a different context).
                    *   Create a new turn record with a "pending" state for this player in this game.
                    *   Update the game's `updatedAt` timestamp.
                *   Retrieve the previous turn's content (text or image URL) to be sent to the player.
                *   Return success state with game details and previous turn content.
            *   If no game is selected, return a state indicating no suitable game was found.
    10. **Play Command (`PlayCommand`)**:
        *   Location: `src/commands/chat/play-command.ts`.
        *   Responsibilities:
            *   Register the `/play` chat input command.
            *   Instantiate and call the `GameJoinService` with the invoking user's ID.
            *   Handle the response from the service:
                *   If successful game assignment:
                    *   DM the player with the previous turn's content and clear instructions on how to respond.
                    *   Send an ephemeral confirmation message in the interaction channel (e.g., "You've joined game X! Check your DMs.").
                *   If no suitable game:
                    *   Send an ephemeral message informing the user and perhaps suggesting they `/start` a new game.
                *   If player already has a pending turn:
                    *   Send an ephemeral message informing the user to complete their current turn.
    *   **Database Queries (handled by `DatabaseService` and used by `GameJoinService`)**:
        *   Query to find active games, including their `updatedAt`, `settings` (for `staleTimeout`), and list of player IDs who have taken a turn.
        *   Query to check if a user has an existing pending turn in any active game.
        *   Operations to create/update player participation records.
        *   Operations to create new turn records.
        *   Operations to update game metadata (e.g., `updatedAt`).
    *   **Turn Handling**: The `GameJoinService` will retrieve the content of the last completed turn in the selected game to be DMed to the player.

    ## Development Details
    *   Refer to `docs/PRD.md` for rules regarding game flow, player turns, and game states.
    *   The `stale_timeout` is a game-specific setting.
    *   Consider edge cases, such as a game becoming stale or being completed/terminated right as a player attempts to join.

    ## Testing Approach
    1.  **Unit Tests for Pure Game Selection Function (`src/logic/game-selection.test.ts`)**:
        *   Test with an empty list of games: should return `null`.
        *   Test with games where the user has played in all of them: should return `null`.
        *   Test with games where the user is the last player in all available games: should return `null`.
        *   Test with multiple suitable games: ensure the one closest to staleness is selected.
        *   Test with games having different `staleTimeout` values and `updatedAt` timestamps.
        *   Test selection when some games are played by the user and others are not.
        *   Mock `Date` for predictable staleness calculations.
    2.  **Integration Tests for `GameJoinService` (`src/services/game-join-service.test.ts`)**:
        *   Requires a controlled test database environment.
        *   Test successful game joining:
            *   Verify `DatabaseService` is called to fetch games and player state.
            *   Verify `selectNextGame` is called.
            *   Verify `DatabaseService` is called to update game state (player joins, new turn created, `updatedAt` updated).
            *   Verify the service returns correct previous turn content.
        *   Test scenario: No suitable games available (e.g., all games played, user is last player in all).
            *   Verify service returns appropriate status/error.
        *   Test scenario: Player already has a pending turn.
            *   Verify `DatabaseService` is called to check this.
            *   Verify service returns appropriate status/error early.
            *   Ensure database transactions are handled correctly (if applicable for multiple updates).
    3.  **Interaction Tests for `PlayCommand` (manual or using a Discord bot testing utility)**:
        *   Verify the `/play` command is registered and accessible.
        *   Test successful flow: command execution -> service call -> game join -> DM received with correct content -> ephemeral confirmation.
        *   Test error flow: no games available -> appropriate ephemeral message.
        *   Test error flow: player has pending turn -> appropriate ephemeral message.
        *   Test interactions with different game states in the database.

    ## Future Considerations
    *   Integration with "Seasons" if the logic differs. (The PRD.md states: "Multiple games are played simultaneously, but each player may only ever have one pending turn at a time (this rule does not apply to seasons).")
    *   Handling for when a game has reached `max_turns`.
  </everythingElse>
</Climb>