# EPYC Discord Bot - /play Command Implementation Moves

This document outlines the development tasks (moves) required to implement the `/play` command feature, as detailed in `@MzMz-climb.md`.

## Implementation Tasks

### 1. Create Pure Game Selection Function
-   **File:** `src/logic/game-selection.ts`
-   **Function Signature (Example):** `selectNextGame(games: Game[], userId: string, now: Date): Game | null`
    -   *Note: Import the `Game` type which includes `id`, `updatedAt`, `settings.staleTimeout`, player participation info (e.g., an array of player IDs who have taken a turn), and the "returns" game setting.*
-   **Logic to Implement:**
    1.  Filter out games based on the game's "returns" setting:
        -   If the game setting disallows returns, filter out games where `userId` is already in the list of players who have taken a turn.
        -   If the game setting allows returns, filter out games where the player has played too recently.
    2.  For the remaining eligible games, calculate their "staleness score." A lower score means closer to becoming stale.
        -   Example staleness calculation: `staleness = (game.updatedAt.getTime() + game.settings.staleTimeout) - now.getTime()`.
    3.  Sort the eligible games by their staleness score in ascending order (games closest to becoming stale first).
    4.  Return the first game from the sorted list. If no games are eligible after filtering, return `null`.

### 2. Create Game Join Service (`GameJoinService`)
-   **File:** `src/services/game-join-service.ts`
-   **Primary Class/Object:** `GameJoinService`
-   **Dependencies:** `DatabaseService`, `selectNextGame` function (from `src/logic/game-selection.ts`).
-   **Key Methods/Responsibilities:**
    -   **`joinGame(userId: string): Promise<JoinGameResult>`** (or similar)
        1.  **Check for Existing Pending Turn:**
            -   Query `DatabaseService` to see if `userId` has any turn with "pending" status in any active game.
            -   If yes, return `{ status: 'ALREADY_HAS_TURN' }`.
        2.  **Fetch Data:**
            -   Fetch all active games from `DatabaseService`. Ensure games include `id`, `updatedAt`, `settings` (with `staleTimeout` and "returns" policy), and player participation history.
            -   *Consider if player participation history (who played in what) needs a separate efficient query or can be part of the active games query if structured appropriately in the database.*
        3.  **Select Game:**
            -   Call `selectNextGame(activeGames, userId, new Date())`.
        4.  **Handle No Suitable Game:**
            -   If `selectNextGame` returns `null`, return `{ status: 'NO_GAME_AVAILABLE' }`.
        5.  **Process Game Join (if a game is selected):**
            -   Let `selectedGame` be the result from `selectNextGame`.
            -   Retrieve the last completed turn's content (text or image URL) for `selectedGame` using `DatabaseService`.
            -   Atomically (e.g., using a database transaction if necessary for multiple writes):
                -   Update `DatabaseService`: Add `userId` to `selectedGame`'s participants/players list (if not already present in a capacity that would prevent rejoining, like being the immediate previous player if self-play in sequence isn't desired for a specific game type).
                -   Update `DatabaseService`: Create a new turn record for `userId` in `selectedGame` with status "pending" and link it to the `selectedGame`.
                -   Update `DatabaseService`: Update `selectedGame.updatedAt` to the current timestamp.
            -   Return `{ status: 'SUCCESS', game: selectedGame, previousTurnContent: ... }`.
    -   **Type Definitions:**
        -   `JoinGameResult`: A discriminated union for outcomes (e.g., `{ status: 'SUCCESS', game: Game, previousTurnContent: string } | { status: 'NO_GAME_AVAILABLE' } | { status: 'ALREADY_HAS_TURN' } | { status: 'ERROR', message: string }`).

### 3. Create Play Command (`PlayCommand`)
-   **File:** `src/commands/chat/play-command.ts`
-   **Extends:** Base command class (e.g., `ChatInputCommand`)
-   **Dependencies:** `GameJoinService`.
-   **Key Logic in `execute(interaction)` method:**
    1.  Get `userId` from `interaction.user.id`.
    2.  Instantiate `GameJoinService`.
    3.  Call `gameJoinService.joinGame(userId)`.
    4.  **Handle Service Response:**
        -   **`SUCCESS`**:
            -   DM the user (`interaction.user.send`) with `previousTurnContent` and instructions (e.g., "Reply to this message with your [sentence/drawing] for Game X!").
            -   Reply to the interaction ephemerally: `interaction.reply({ content: "You've joined Game X! Check your DMs for the details and to submit your turn.", ephemeral: true })`.
        -   **`NO_GAME_AVAILABLE`**:
            -   Reply ephemerally: `interaction.reply({ content: "Sorry, there are no suitable EPYC games for you to join right now. Try using /start to create a new one!", ephemeral: true })`.
        -   **`ALREADY_HAS_TURN`**:
            -   Reply ephemerally: `interaction.reply({ content: "You already have an active turn in an EPYC game. Please complete that turn before joining another.", ephemeral: true })`.
        -   **`ERROR`**:
            -   Reply ephemerally: `interaction.reply({ content: "An error occurred while trying to join a game. Please try again later.", ephemeral: true })`.
            -   Log the error details for developers.
    5.  Ensure the command is correctly registered with Discord (usually handled by a command loader/manager).

## Testing Tasks

### 4. Unit Tests for Pure Game Selection Function
-   **File:** `src/logic/game-selection.test.ts`
-   **Mocking:** Mock `new Date()` for consistent "now" timestamps in tests.
-   **Test Cases:**
    -   **Empty Game List:** `selectNextGame([], "user1", MOCK_DATE)` should return `null`.
    -   **User Played All (No Returns):** Given games A, B, C (all disallowing returns), and `user1` has played in A, B, C. `selectNextGame([A,B,C], "user1", MOCK_DATE)` should return `null`.
    -   **User Played All (With Returns):** Given games A, B, C (all allowing returns), and `user1` has played in A, B, C. `selectNextGame([A,B,C], "user1", MOCK_DATE)` should select based on staleness.
    -   **Staleness Prioritization:**
        -   Game A: `updatedAt` = 10 mins ago, `staleTimeout` = 30 mins (stale in 20 mins)
        -   Game B: `updatedAt` = 5 mins ago, `staleTimeout` = 60 mins (stale in 55 mins)
        -   Game C: `updatedAt` = 25 mins ago, `staleTimeout` = 30 mins (stale in 5 mins)
        -   `selectNextGame([A,B,C], "user1", MOCK_DATE)` should return Game C.
    -   **Mixed Played/Unplayed (No Returns):**
        -   Game A (no returns, played by `user1`)
        -   Game B (no returns, not played by `user1`, stale in 10 mins)
        -   Game C (no returns, not played by `user1`, stale in 5 mins)
        -   `selectNextGame([A,B,C], "user1", MOCK_DATE)` should return Game C.
    -   **No Suitable Games:** All games played, or all games have `user1` as the only/last player (if additional filtering logic for this exists beyond "returns").

### 5. Integration Tests for `GameJoinService`
-   **File:** `src/services/game-join-service.test.ts`
-   **Setup:** Requires a test database setup with pre-populated data for different scenarios. Mock or use a real `DatabaseService` connected to this test DB.
-   **Test Scenarios:**
    -   **Successful Join:**
        -   Setup: DB has an available game `G1` not played by `user1`. `user1` has no pending turns.
        -   Action: Call `gameJoinService.joinGame("user1")`.
        -   Verification:
            -   Returns `{ status: 'SUCCESS', game: G1_details, previousTurnContent: ... }`.
            -   DB check: `user1` is now a participant in `G1`. A new "pending" turn for `user1` exists in `G1`. `G1.updatedAt` is updated.
    -   **No Game Available:**
        -   Setup: DB has games, but `user1` has played all (and returns are off), or no active games exist.
        -   Action: Call `gameJoinService.joinGame("user1")`.
        -   Verification: Returns `{ status: 'NO_GAME_AVAILABLE' }`. DB state unchanged related to new turns/participation for `user1`.
    -   **Already Has Pending Turn:**
        -   Setup: DB has `user1` with a "pending" turn in `Game_X`.
        -   Action: Call `gameJoinService.joinGame("user1")`.
        -   Verification: Returns `{ status: 'ALREADY_HAS_TURN' }`. No calls to `selectNextGame`. No changes to DB for new game joins.
    -   **Database Interaction Integrity:**
        -   If `DatabaseService` interactions for creating a turn or updating game fail, ensure any partial changes are rolled back (if transactions are used) and an error status is returned.

### 6. Interaction Tests for `PlayCommand`
-   **Method:** Manual testing via Discord client or using a bot testing framework if available.
-   **Environment:** Test bot connected to a development/staging Discord server and database.
-   **Test Scenarios:**
    -   **Command Registration:** `/play` command appears in Discord and is usable.
    -   **Successful Flow:**
        -   Execute `/play`.
        -   Expected: Ephemeral confirmation in channel ("Joined Game X... Check DMs"). DM received with previous turn content and instructions.
    -   **No Games Available Flow:**
        -   Setup: Ensure no games are joinable by the test user.
        -   Execute `/play`.
        -   Expected: Ephemeral message ("Sorry, no suitable games...").
    -   **Already Has Turn Flow:**
        -   Setup: Test user has an active pending turn.
        -   Execute `/play`.
        -   Expected: Ephemeral message ("You already have an active turn...").
    -   **Error Handling:** (Simulate service error if possible, or test generic error message if service throws an unexpected error).
        -   Execute `/play`.
        -   Expected: Ephemeral message ("An error occurred..."). 