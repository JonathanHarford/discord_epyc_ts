---
description: 
globs: **/test*/**,**/test_*
alwaysApply: false
---
# Test Execution and Verification

## Running Tests
- CRITICAL: A task is NEVER complete if any test is failing
- Never add one or more tests unless you're certain ALL tests pass.
- Run the test suite before claiming to be done with a task
- Always wait for the complete test output before proceeding

## Reporting Test Results
- "All tests pass" refers ONLY to running the COMPLETE test suite with `pnpm test` without arguments
- Running subset of tests doesn't constitute "all tests pass"
- Before using 💚 in commit messages, you MUST verify:
  1. A full test run has been executed and showed 0 failures
  2. No regressions were introduced
  3. All previously failing tests now pass
- For partial test runs, use: "Tests for [specific feature] are passing" without the 💚 prefix
- Include test statistics in your analysis (e.g., "X passed; Y failed")

## Test Output Analysis
- If tests seem stuck or show no progress, try running specific test files
- Watch for error messages even when tests pass
- ALWAYS verify test output before considering a task done

## Common Pitfalls
- AVOID mocks in unit tests. Use them only in integration tests.
- Don't assume tests passed just because some passing results appear
- Don't proceed with commits or further changes until test completion
- Be wary of partial test results in large test suites
- Remember that console logs don't indicate test status
- NEVER mark a task complete or suggest a commit with �� if any test fails