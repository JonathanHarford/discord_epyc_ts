# Next Player Logic for Season Games

This document details the rules and criteria for selecting the next player to be OFFERED a turn in a Season Game once the previous turn is completed or skipped.

When a turn in a Season Game becomes AVAILABLE, the bot determines the next player based on the following logic:

## MUST Rules (Hard Constraints)

- A player MUST never play in the same game twice within a single season.
- A player MUST never have more than one PENDING turn at a time across all season games.

## SHOULD Rules (Prioritization - Applied to Eligible Players)

Among the players who are eligible based on the MUST rules, the bot SHOULD prioritize the player based on the following criteria:

1.  Player A SHOULD NOT be ASSIGNED an <X>ing turn (writing/drawing) following Player B more than once per season.
2.  Players SHOULD NOT be given an <X>ing turn if they've already been ASSIGNED n/2 <X>ing turns in the season (where n is the number of players/games in the season). Prioritize players who are below this threshold for the given turn type.
3.  Given an <X>ing turn, the next player SHOULD be the player who has been ASSIGNED the fewest <X>ing turns in the season overall.
4.  If there is still a tie after applying the above SHOULD rules, prefer players who have fewer PENDING overall turns across all season games.

The bot should apply these SHOULD rules in sequence (from 1 to 4) to find the single best eligible player. If a tie persists after all SHOULD rules, a deterministic tie-breaking mechanism (e.g., lowest player ID) should be used.

## Handling Edge Cases

- **Unclaimed Turns**: If a player does not use `/ready` to claim an OFFERED turn within the `claim_timeout`, the assignment is dismissed. The turn becomes AVAILABLE again to be OFFERED to another eligible player according to this logic.
- **Claimed (PENDING) but Untaken Turns**: If a player claims a turn with `/ready` but fails to submit it within the `writing_timeout` or `drawing_timeout`, they are skipped for that specific turn in that game. The turn becomes AVAILABLE again to be OFFERED to another eligible player according to this logic, and the player who failed to submit receives a message indicating they were skipped.
- **End-of-Season Complexity**: Near the end of a season, it may be challenging to satisfy all SHOULD rules simultaneously due to limited remaining turns and player eligibility. The logic should strive to meet as many SHOULD criteria as possible, but the MUST rules are paramount. 