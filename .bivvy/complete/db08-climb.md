<Climb>
  <header>
    <id>db08</id>
    <type>feature</type>
    <description>Duration string parser and generator</description>
  </header>
  <newDependencies>None</newDependencies>
  <prerequisitChanges>None anticipated</prerequisitChanges>
  <relevantFiles>
    - Likely to create new utility files for date/time handling
    - May need to update any existing files that handle duration calculations
  </relevantFiles>

  <Feature Overview>
    Implement a bidirectional parser/generator that converts between human-readable duration strings and milliseconds. This utility will enable users to input durations in a natural format and allow the system to display durations in a consistent, readable format.
  </Feature Overview>

  <Requirements>
    1. Parse duration strings into milliseconds
       - Valid format: [days]d[hours]h[minutes]m[seconds]s
       - Largest unit must be days (no weeks or years)
       - Units must be ordered from largest to smallest
       - Support partial representations (e.g., "5m30s", "2d", "1h30m")
    
    2. Generate duration strings from milliseconds
       - Follow the same formatting rules as parsing
       - Don't display zero units (e.g., "2h5s" instead of "2h0m5s")
       - Convert to largest units whenever possible (e.g., "1d" instead of "24h")
       - Always use the most compact representation
    
    3. Validation
       - Detect and reject invalid formats
       - Provide clear error messages for invalid inputs
  </Requirements>

  <Design and Implementation>
    - Create a dedicated utility module for duration handling
    - Implement two main functions:
      1. `parseDurationString(durationStr: string): number` - Converts duration string to milliseconds
      2. `generateDurationString(ms: number): string` - Converts milliseconds to duration string
    - Use regular expressions for parsing
    - Implement validation logic to enforce format rules
  </Design and Implementation>

  <Development Details>
    - Parser function steps:
      1. Validate input string against regex pattern
      2. Extract days, hours, minutes, seconds
      3. Convert each unit to milliseconds and sum
    
    - Generator function steps:
      1. Convert milliseconds to days, hours, minutes, seconds
      2. Optimize representation (no zero units, largest units possible)
      3. Build formatted string
    
    - Time unit constants:
      - 1 second = 1000ms
      - 1 minute = 60000ms
      - 1 hour = 3600000ms
      - 1 day = 86400000ms
  </Development Details>

  <Testing Approach>
    - Unit tests for both functions
    - Test cases should include:
      - Valid inputs with various combinations of units
      - Edge cases (zero values, large values, boundary values)
      - Invalid inputs (wrong order, unsupported units)
    - Ensure bidirectional conversion works correctly (parse -> generate -> parse)
  </Testing Approach>
</Climb> 