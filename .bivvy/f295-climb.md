<Climb>
  <header>
    <id>f295</id>
    <type>feature</type>
    <description>Add /dev command:testmode to toggle test mode on server</description>
  <newDependencies>None</newDependencies>
  <prerequisitChanges>None</prerequisitChanges>
  <relevantFiles>
    - src/commands/chat/dev-command.ts
    - src/enums/dev-command-name.ts
    - src/commands/args.ts
    - src/database/server-service.ts
    - lang/lang.en-US.json
    - lang/lang.en-GB.json
  </relevantFiles>

## Feature Overview
Add a new `testmode` command to the existing `/dev` command that allows developers to toggle the test mode setting on a server. Test mode enables special settings and behavior for testing purposes, allowing developers to run tests with shorter timeouts and more relaxed requirements.

## Requirements
1. Add a new `TESTMODE` value to the `DevCommandName` enum
2. Update the `/dev` command options to include a "Test Mode" option with a server ID parameter
3. Implement a `updateTestMode` method in the `ServerService` class to toggle the `testMode` property
4. Implement a handler for the testmode command in the `DevCommand` class:
   - Check if the user is a developer
   - Retrieve server settings for the provided server ID
   - Toggle the test mode setting (true → false, false → true)
   - Display a success message with the new test mode state

## Design and Implementation
1. Add a new `TESTMODE` value to the `DevCommandName` enum
2. Update the `Args.DEV_COMMAND` choices to include the new testmode option
3. Add translation strings for the new command option
4. Implement a `updateTestMode` method in `ServerService` to toggle the test mode setting
5. Add a new case in the `DevCommand.execute` method to handle the testmode command
6. Ensure the command validates that:
   - The user is a developer (already implemented)
   - The server ID is valid
   - The server exists in the database

## Development Details
1. The test mode feature affects the server's `testMode` property in the `ServerSettings` model
2. The command will require a server ID parameter to specify which server to toggle test mode for
3. The command should be accessible only to developers listed in the config
4. The command will display a success message showing the new test mode state (enabled/disabled)

## Testing Approach
1. Test that only developers can access the command
2. Test toggling test mode on and off in a test server
3. Test handling of invalid server IDs
4. Test handling of servers that don't exist in the database

## Future Considerations
- Consider adding more granular test mode settings
- Add a way to view the current test mode status for all servers
</Climb> 