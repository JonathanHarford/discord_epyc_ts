# Test Refactor Plan

This document outlines a plan to refactor the testing strategy for the EPYC Discord Bot. The current reliance on manual testing against the live Discord API is time-consuming and not comprehensive. This plan proposes the creation of a mock Discord environment to enable fast, automated, and robust testing.

## 1. Investigation and Analysis

The first step was to analyze the existing codebase to understand its interaction with the `discord.js` library.

### Core `discord.js` Dependencies

The bot relies on several key `discord.js` components:

*   **`Client`**: The main entry point for the bot, extended as `CustomClient`. It's configured with intents, partials, and caching options.
*   **Interactions**: The bot heavily uses application commands, which are subclasses of `CommandInteraction`.
    *   `ChatInputCommandInteraction`: For slash commands.
    *   `AutocompleteInteraction`: For command option autocompletion.
    *   `ButtonInteraction`: For button clicks.
    *   `ModalSubmitInteraction`: For modal dialog submissions.
    *   `SelectMenuInteraction`: For dropdown menu selections.
*   **API Models**: The bot uses various data models from `discord.js`, such as:
    *   `User`: Represents a Discord user.
    *   `Guild`: Represents a Discord server.
    *   `TextChannel`, `NewsChannel`, `ThreadChannel`: For different types of channels.
    *   `Message`: Represents a message sent in a channel.
    *   `PermissionsString`: For permission checks.
*   **Rate Limiting**: The `discord.js-rate-limiter` library is used to control the rate of command execution.

### Key Architectural Patterns

*   **Dependency Injection**: Services are instantiated in `start-bot.ts` and passed to the commands and handlers that need them. This is a great pattern that will make it easier to inject our mock services during testing.
*   **Command Handling**: The `CommandHandler` is responsible for finding and executing commands based on the interaction name. It also handles rate limiting, deferring replies, and error handling.
*   **Event-Driven**: The bot is structured around event handlers for different types of events (e.g., `guildJoin`, `messageCreate`, `interactionCreate`).
*   **Services**: The business logic is encapsulated in services (e.g., `GameService`, `SeasonService`, `PlayerService`), which interact with the database (Prisma) and the Discord API.

## 2. Proposed Testing Strategy

Based on the analysis, the following testing strategy is proposed:

### 2.1. Mock Discord Library

A mock version of the `discord.js` library will be created using `vitest.mock`. This will allow for the interception of calls to `discord.js` and their replacement with mock implementations.

### 2.2. Mock Models

Mock classes for the `discord.js` models (`Client`, `User`, `Guild`, etc.) will be created. These classes will mirror the properties and methods of the real `discord.js` models, but their behavior will be controllable in tests.

### 2.3. Mock Interactions

Mock interaction objects will be created to simulate user input and test the bot's responses. These mock interactions will be passed to the command and event handlers.

### 2.4. Test Harness

A test harness will be developed to simplify the creation and sending of mock interactions to the bot. This will improve the readability and maintainability of the tests.

## 3. Refined Implementation Plan

The implementation will proceed in the following phases, incorporating insights from community best practices:

1.  **Build a Mock Discord Library**: Develop a set of mock classes that mimic the behavior of the `discord.js` library. As a best practice, I will focus on separating business logic from Discord API interactions.
2.  **Develop a Test Harness**: Create a central test harness to simplify test writing. This will enable a more test-driven development (TDD) approach.
3.  **Implement Scenario Tests**: Write tests for the bot's features, starting with simple command-response tests and progressing to more complex scenarios. The focus will be on unit and integration tests.
4.  **Future Consideration: End-to-End Testing**: After a robust suite of unit and integration tests is established, we can consider implementing end-to-end tests using a library like `corde` to test against a live Discord server.
