---
description: 
globs: **/test*/**,**/test_*
alwaysApply: false
---
# Test Execution and Verification

## Running Tests
- CRITICAL: A task is NEVER complete if any test is failing
- Never add one or more tests unless you're certain ALL EXISTING tests pass.
- Run the test suite before claiming to be done with a task
- Always wait for the complete test output before proceeding

## Reporting Test Results
- "All tests pass" refers ONLY to running the COMPLETE test suite with `pnpm test` without arguments

## Common Pitfalls
- AVOID mocks. 
  - NEVER mock the database -- that's what the test database is for!
    - So also avoid mocking the Services that use the database. Use the test database with real services!
  - Focus tests below the chat layer -- you shouldn't need to mock Discord (very much) either.
  - DO mock time and scheduling
- Don't assume tests passed just because some passing results appear
- Don't proceed with commits or further changes until test completion
- Be wary of partial test results in large test suites
- Remember that console logs don't indicate test status