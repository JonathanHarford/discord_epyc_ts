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
    - `src/services/game-creation-service.ts` (potentially to be extended or a new service for game joining logic)
    - `src/database/database-service.ts` (for querying game and player states)
  </relevantFiles>
  <everythingElse>
    ## Feature Overview
    The `/play` command is a crucial part of the EPYC Discord bot, enabling users to participate in ongoing games. It bridges the gap between game creation (`/start`) and active gameplay.

    ## Requirements
    1.  **Command Registration**: The `/play` command should be registered as a chat input command.
    2.  **Game Assignment Logic**:
        *   The bot must find an active game that the invoking player has not yet participated in.
        *   If multiple such games exist, the bot should prioritize the game that is closest to becoming stale (based on `last_updated_at` and `stale_timeout` settings of the game).
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
    *   **New Command File**: Create `src/commands/chat/play-command.ts`.
    *   **New Service (or existing service extension)**:
        *   `GameJoinService` or similar to encapsulate the logic for finding and assigning games.
        *   This service will need to interact with `DatabaseService`.
    *   **Database Queries**:
        *   A query to find active games, not yet played by the user, ordered by impending staleness.
        *   A query to check if a user has an existing pending turn.
    *   **Turn Handling**: Logic to retrieve the previous turn and send it via DM.

    ## Development Details
    *   Refer to `docs/PRD.md` for rules regarding game flow, player turns, and game states.
    *   The `stale_timeout` is a game-specific setting.
    *   Consider edge cases, such as a game becoming stale or being completed/terminated right as a player attempts to join.

    ## Testing Approach (Conceptual - for PRD)
    *   Unit tests for the `GameJoinService` logic:
        *   Correctly identifies the soonest-to-be-stale game.
        *   Correctly handles no available games.
        *   Correctly handles player already having a turn.
    *   Simulate different game states and player histories.

    ## Future Considerations
    *   Integration with "Seasons" if the logic differs. (The PRD.md states: "Multiple games are played simultaneously, but each player may only ever have one pending turn at a time (this rule does not apply to seasons).")
    *   Handling for when a game has reached `max_turns`.
  </everythingElse>
</Climb> 