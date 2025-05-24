# EPYC Discord Bot - Manual Testing Plan (MVP)

This document outlines the comprehensive manual testing plan for the EPYC Discord bot MVP, focusing on Season Games functionality.

## Prerequisites

1. **Bot Setup**:
   - Discord bot token configured in `config/config.json`
   - Database setup and migrations applied (`pnpm run prisma:migrate:dev`)
   - Bot built and ready to run (`pnpm run build`)
   - Test Discord server with appropriate permissions

2. **Test Environment**:
   - At least 3-4 test Discord accounts for comprehensive testing
   - Private Discord server for testing
   - Bot registered with appropriate slash commands (`pnpm run commands:register:guild`)

## Test Categories

### 1. Basic Bot Infrastructure Tests

#### 1.1 Bot Connection and Commands Registration
- [ ] Start bot: `pnpm run start:bot`
- [ ] Verify bot comes online in Discord server
- [ ] Verify slash commands are available: `/new`, `/join`, `/status`, `/config`, `/admin`
- [ ] Test help command: `/help`
- [ ] Test info command: `/info`

### 2. Configuration Management Tests

#### 2.1 Default Configuration
- [ ] Test viewing default config: `/config seasons`
- [ ] Verify default values are displayed correctly

#### 2.2 Configuration Updates
- [ ] Test updating single parameter: `/config seasons claim_timeout:2h`
- [ ] Test updating multiple parameters: `/config seasons writing_timeout:10m drawing_timeout:30m`
- [ ] Test invalid parameters (should show error):
  - [ ] Invalid duration: `/config seasons claim_timeout:invalid`
  - [ ] Invalid turn pattern: `/config seasons turn_pattern:invalid`
  - [ ] Invalid min/max players: `/config seasons min_players:0 max_players:101`

### 3. Season Creation and Joining Tests

#### 3.1 Season Creation
- [ ] Test basic season creation: `/new season`
- [ ] Test season creation with custom parameters: `/new season open_duration:1h max_players:3`
- [ ] Test season creation with invalid parameters (should show errors):
  - [ ] Invalid duration: `/new season open_duration:invalid`
  - [ ] Invalid player counts: `/new season min_players:0`
- [ ] Verify season creator receives initial turn offer DM
- [ ] Verify season announcement in channel

#### 3.2 Season Joining
- [ ] Test joining valid season: `/join season:<id>`
- [ ] Test joining non-existent season: `/join season:invalid-id`
- [ ] Test joining same season twice (should show error)
- [ ] Test joining closed/active season (should show error)
- [ ] Verify join announcements in channel

### 4. Season Activation Tests

#### 4.1 Max Players Activation
- [ ] Create season with `max_players:3`
- [ ] Have 3 players join
- [ ] Verify automatic activation when max players reached
- [ ] Verify all players receive initial turn offers via DM
- [ ] Verify games are created (3 games for 3 players)

#### 4.2 Open Duration Timeout Activation
- [ ] Create season with `open_duration:1m` and `min_players:2`
- [ ] Have 2+ players join
- [ ] Wait for timeout
- [ ] Verify automatic activation after timeout
- [ ] Verify all players receive initial turn offers via DM

#### 4.3 Insufficient Players Cancellation
- [ ] Create season with `open_duration:1m` and `min_players:3`
- [ ] Have only 2 players join
- [ ] Wait for timeout
- [ ] Verify season is cancelled (not activated)
- [ ] Verify appropriate error messages

### 5. Turn Management Tests

#### 5.1 Turn Claiming (/ready command)
- [ ] Player receives turn offer DM
- [ ] Test `/ready` command in DM
- [ ] Verify turn status changes to PENDING
- [ ] Verify appropriate confirmation message
- [ ] Test `/ready` when no turn offered (should show error)
- [ ] Test `/ready` when already have pending turn (should show error)

#### 5.2 Turn Submission
- [ ] **Writing Turn Submission**:
  - [ ] Claim writing turn with `/ready`
  - [ ] Submit text response in DM
  - [ ] Verify turn marked as COMPLETED
  - [ ] Verify next turn is offered to appropriate player
- [ ] **Drawing Turn Submission**:
  - [ ] Claim drawing turn with `/ready`
  - [ ] Submit image attachment in DM
  - [ ] Verify turn marked as COMPLETED
  - [ ] Verify next turn is offered to appropriate player

#### 5.3 Turn Timeout Scenarios
- [ ] **Claim Timeout**:
  - [ ] Player receives turn offer
  - [ ] Don't use `/ready` within claim_timeout
  - [ ] Verify turn is dismissed and offered to next player
  - [ ] Verify timeout notification DM
- [ ] **Submission Timeout**:
  - [ ] Claim turn with `/ready`
  - [ ] Don't submit within writing/drawing timeout
  - [ ] Verify turn is marked as SKIPPED
  - [ ] Verify timeout notification DM
  - [ ] Verify next turn is offered to appropriate player

### 6. Game and Season Completion Tests

#### 6.1 Game Completion
- [ ] Complete all turns in a single game
- [ ] Verify game is marked as COMPLETED
- [ ] Verify completion notification to all players in that game

#### 6.2 Season Completion
- [ ] Complete all games in a season
- [ ] Verify season is marked as COMPLETED
- [ ] Verify completion announcement in original channel
- [ ] Verify full game sequences are displayed correctly

### 7. Status and Information Commands

#### 7.1 Season Status
- [ ] Test `/status season:<id>` for active season
- [ ] Verify correct display of:
  - [ ] Turn progress per game
  - [ ] Overall season progress
  - [ ] Player participation status
- [ ] Test status for non-existent season (should show error)
- [ ] Test status for completed season

### 8. Admin Commands Tests

#### 8.1 Player Management
- [ ] Test `/admin ban user:@user`
- [ ] Verify banned player cannot join new seasons
- [ ] Verify banned player cannot be offered turns
- [ ] Test `/admin unban user:@user`
- [ ] Verify unbanned player can join seasons again
- [ ] Test banning non-existent user (should show error)
- [ ] Test unbanning non-banned user (should show error)

#### 8.2 Season Management
- [ ] Test `/admin terminate season:<id>`
- [ ] Verify season is marked as TERMINATED
- [ ] Verify appropriate notifications
- [ ] Test terminating non-existent season (should show error)

#### 8.3 Listing Commands
- [ ] Test `/admin list seasons`
- [ ] Verify all active seasons are displayed with correct info
- [ ] Test `/admin list players`
- [ ] Verify all players are displayed with correct status

### 9. Error Handling and Edge Cases

#### 9.1 Invalid Input Handling
- [ ] Test commands with missing required parameters
- [ ] Test commands with invalid parameter values
- [ ] Test DM responses when no turn is pending
- [ ] Test image submission for writing turn (should show error)
- [ ] Test text submission for drawing turn (should show error)

#### 9.2 Permission and Access Control
- [ ] Test admin commands with non-admin user (should show error)
- [ ] Test DM commands in public channel (should show error or redirect)
- [ ] Test public commands in DM (should work appropriately)

#### 9.3 Concurrent Operations
- [ ] Test multiple players joining season simultaneously
- [ ] Test multiple turn submissions at same time
- [ ] Test season activation during player joins

### 10. Next Player Logic Tests

#### 10.1 Basic Turn Distribution
- [ ] Verify turns are distributed according to turn_pattern
- [ ] Verify no player gets multiple pending turns
- [ ] Verify turn distribution follows MUST rules from PRD

#### 10.2 Complex Scenarios
- [ ] Test with players being skipped
- [ ] Test with mixed completed/skipped turns
- [ ] Test end-of-season scenarios with few remaining turns

### 11. Messaging and User Experience

#### 11.1 Message Clarity
- [ ] Verify all bot messages are clear and informative
- [ ] Verify error messages provide helpful guidance
- [ ] Verify DM notifications include all necessary context

#### 11.2 Message Formatting
- [ ] Verify progress bars display correctly
- [ ] Verify game sequences format properly
- [ ] Verify turn instructions are clear

## Test Execution Checklist

### Pre-Testing Setup
- [ ] Database is clean (or use test database)
- [ ] Bot configuration is correct
- [ ] Test Discord server is prepared
- [ ] Multiple test accounts are available

### During Testing
- [ ] Document any unexpected behavior
- [ ] Take screenshots of important flows
- [ ] Note performance issues
- [ ] Record error messages exactly

### Post-Testing
- [ ] Compile list of issues found
- [ ] Prioritize issues by severity
- [ ] Create bug reports for significant issues
- [ ] Update documentation if needed

## Expected Test Duration

- **Basic Infrastructure**: 30 minutes
- **Configuration Management**: 30 minutes  
- **Season Creation/Joining**: 45 minutes
- **Season Activation**: 45 minutes
- **Turn Management**: 90 minutes
- **Completion Tests**: 45 minutes
- **Status Commands**: 30 minutes
- **Admin Commands**: 45 minutes
- **Error Handling**: 60 minutes
- **Next Player Logic**: 60 minutes
- **Messaging/UX**: 30 minutes

**Total Estimated Time**: 8-10 hours

## Success Criteria

All test cases should pass without critical errors. Minor issues may be acceptable if they don't break core functionality. The bot should handle all documented user flows from the PRD and SEASON_FLOWS.md correctly.

## Notes

- Some timeout tests may require patience or temporary configuration changes for faster testing
- Image upload tests require actual image files
- Admin command tests require appropriate Discord permissions
- Consider using shorter timeouts during testing for faster iteration 