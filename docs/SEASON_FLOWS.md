# Bot Setup by Alice, an admin

Bot→#epyc:
	Thank you for adding @EatPoopYouCat to your server!
	Use /season new to start a season, or /admin season config to change the default season settings.
	Join our server for additional help… or to play with strangers: https://discord.gg/karuta

Alice→#epyc:
	/admin season config

Bot(reply):
	**Default season rules:**
	open_duration: 2d
	turn_pattern: writing,drawing
	claim_timeout: 1d
	writing_timeout: 1d
	writing_warning: 3h
	drawing_timeout: 3d
	drawing_warning: 6h
	min_players: 6
	max_players: none

Alice→#epyc:
	/admin season config claim_timeout:2d writing_timeout:5m writing_warning:1m drawing_timeout:20m drawing_warning:2m

Bot(reply):
	**Default season rules:**
	open_duration: 2d
	turn_pattern: writing,drawing
	claim_timeout: 2d
	writing_timeout: 5m
	writing_warning: 1m
	drawing_timeout: 20m
	drawing_warning: 2m
	min_players: 6
	max_players: none

# Creating a season

Alice→#epyc:
	/season new open_duration:1d

Bot→#epyc:
	@Alice has started a new season with ID: **blue-happy-fox**
	Season will remain open for joining for 1 day.
	Use `/season join season:blue-happy-fox` to join!

Bob→#epyc:
	/season join season:blue-happy-fox

Bot→#epyc:
	@Bob has joined the season **blue-happy-fox**!
	Current players: @Alice, @Bob

[After open duration passes]

Bot→#epyc:
	Season **blue-happy-fox** is now active with 8 players x 8 games = 64 turns in all!

# Playing a season

## Bot DMs with Alice

Bot→Alice(DM): (Initiation occurs simultaneously for all players/games)
	**blue-happy-fox** Game **1** Turn **1** AVAILABLE
	Use the `/ready` command to confirm you're ready to take your turn.

Alice→Bot(DM):
	/ready

Bot→Alice(DM):
	**blue-happy-fox** Game **1** Turn **1/8** PENDING
	Please reply with a starting sentence or phrase.

Alice→Bot(reply):
	The astronaut discovered a tiny alien in his spacesuit pocket.

Bot→Alice(DM):
	**blue-happy-fox** Game **1** Turn **1/8** COMPLETED
	Day 1 ■□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□
	Thanks! Your turn has been recorded.

## Bot DMs with Bob (simultaneous for all players/games)

Bot→Bob(DM):
	**blue-happy-fox** Game **2** Turn **1/8** AVAILABLE
	Use the `/ready` command to confirm you're ready to take your turn.

Bob→Bot(DM):
	/ready

Bot→Bob(DM):
	**blue-happy-fox** Game **2** Turn **1/8** PENDING
	Please reply with a starting sentence or phrase.

Bob→Bot(reply):
	Three cats wearing sunglasses drove a convertible down the highway.

Bot→Bob(DM):
	**blue-happy-fox** Game **2** Turn **1/8** COMPLETED
	Day 1 ■■□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□
	Thanks! Your turn has been recorded.

## Bob receives a drawing request from the game Alice started

Bot→Bob(DM):
	**blue-happy-fox** Game **1** Turn **2/8** AVAILABLE
	Use the `/ready` command to confirm you're ready to take your turn.

Bob→Bot(DM):
	/ready

Bot→Bob(DM):	
	**blue-happy-fox** Game **1** Turn **2/8** PENDING
	Upload an illustration based on this sentence:
	"The astronaut discovered a tiny alien in his spacesuit pocket."

Bob→Bot(DM):
	[Uploads drawing of astronaut with alien]

Bot→Bob(DM):
	**blue-happy-fox** Game **1** Turn **2/8** COMPLETED
	Day 1 ■■□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□
	Thanks! Your turn has been recorded.

## Alice receives a writing request from the game Bob started, after Carol(?)

Bot→Alice(DM):
	**blue-happy-fox** Game **2** Turn **3/8** AVAILABLE
	Use the `/ready` command to confirm you're ready to take your turn.

Alice→Bot(DM):
	/ready

Bot→Alice(DM):
	**blue-happy-fox** Game **2** Turn **3/8** PENDING
	Please reply with a sentence or phrase describing this picture:
	[A drawing of cats in a convertible]

Alice→Bot(reply):
	Three cats wearing sunglasses drove a convertible down the highway.

Bot→Alice(DM):
	**blue-happy-fox** Game **2** Turn **3/8** COMPLETED
	Day 3 ■■■□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□
	Thanks! Your turn has been recorded.

## Dmitri has multiple turns to deal with at once

Dmitri→Bot(DM):
	/ready

Bot→Dmitri(DM):
    There aren't any turns available for you right now.

Bot→Dmitri(DM):
	**blue-happy-fox** Game **3** Turn **4/8** AVAILABLE
	Use the `/ready` command to confirm you're ready to take your turn.

Bot→Dmitri(DM):
	**blue-happy-fox** Game **5** Turn **4/8** AVAILABLE
	Use the `/ready` command to confirm you're ready to take your turn.

Dmitri→Bot(DM):
	/ready

Bot→Dmitri(DM):
	**blue-happy-fox** Game **3** Turn **4/8** PENDING
	Please reply with a sentence or phrase describing this picture:
	[The moon in the sky with a spaceship]

Dmitri→Bot(DM):
	/ready

Bot→Dmitri(DM):
	You already have a pending turn!
	**blue-happy-fox** Game **3** Turn **4/8** PENDING
	Please reply with a sentence or phrase describing this picture:
	[The moon in the sky with a spaceship]

## Edgar doesn't claim his turn

Bot→Edgar(DM):
	**blue-happy-fox** Game **5** Turn **4/8** AVAILABLE
	Use the `/ready` command to confirm you're ready to take your turn.

[After claim_timeout of 1 day]

Bot→Edgar(DM):
	**blue-happy-fox** Game **5** Turn **4/8**
	Since you didn't claim your turn, I'm going to assign it to someone else.

## Frances claims her turn but doesn't submit

Bot→Frances(DM):
	**blue-happy-fox** Game **5** Turn **4/8** AVAILABLE
	Use the `/ready` command to confirm you're ready to take your turn.

Frances→Bot(DM):
	/ready

Bot→Frances(DM):
	**blue-happy-fox** Game **5** Turn **4/8** PENDING
	Please reply with a sentence or phrase describing this picture:
	[A drawing of cats in a convertible]

[After writing_timeout - writing_warning: 5 - 1 = 4 minutes]

Bot→Frances(DM):
	**blue-happy-fox** Game **5** Turn **4/8** PENDING
	You have 1m left to submit your turn! Please submit!
	Please reply with a sentence or phrase describing this picture:
	[A drawing of cats in a convertible]

[After writing_warning: 1m]

Bot→Frances(DM):
	**blue-happy-fox** Game **5** Turn **4/8**
	Skipped!
	I wish you hadn't claimed the turn if you weren't going to submit!

# Finishing a game

[After all turns in game completed]

Bot→Alice(DM):
Bot→Bob(DM):
Bot→Carol(DM):
	**blue-happy-fox** Game **2** COMPLETED 🎉
	Day 13 ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■□□□□□□□□□□□□□□

# Viewing seasons

## Listing all available seasons

Bob→#epyc:
	/season list

Bot→Bob(ephemeral reply):
	**Open Seasons:**
	**green-jolly-dog** - 4/8 players - Opens for 2 more days
	**red-sleepy-cat** - 2/10 players - Opens for 5 more days
	
	**Your Active Seasons:**
	**blue-happy-fox** - Day 3 - 3/64 turns completed

## Viewing a specific season status

Bob→#epyc:
	/season show season:blue-happy-fox

Bot→Bob(ephemeral reply):
	**blue-happy-fox** 3/64
	Day 3 ■■■□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□ 5%
	
# Finishing a season

[After all games in season completed]

Bot→#epyc:
	**blue-happy-fox** COMPLETED 🎉
	Day 21 ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
	
	**Game 1**
	@Alice: "The astronaut discovered a tiny alien in his spacesuit pocket."
	@Bob: [Image of astronaut with alien]
    ...

	**Game 2**
	@Bob: "Three cats wearing sunglasses drove a convertible down the highway."
	@Alice: [Image of cats in convertible]
    ...

# Admin commands

Admin:
	/admin season kill id:blue-happy-fox

Bot(ephemeral reply):
	Season blue-happy-fox has been terminated by @Admin.

Admin:
	/admin player ban user:@Troll reason:"Inappropriate behavior"

Bot(ephemeral reply):
	@Troll has been banned from playing EPYC games on this server.

Admin:
	/admin player unban user:@ReformedTroll

Bot(ephemeral reply):
	@ReformedTroll has been unbanned and can now play EPYC games on this server.

Admin:
	/admin season list

Bot(ephemeral reply):
	**blue-happy-fox** 3/64
	Day 3 ■■■□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□ 5%
	**green-jolly-dog** 12/100
	Day 5 ■■■■■□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□ 12%
	
Admin:
	/admin player list

Bot(ephemeral reply):
	@Alice
	@Bob
	@Carol
	@Dmitri
	@Edgar
	@Frances

Admin:
	/admin player show user:@Alice

Bot(ephemeral reply):
	**Player Details: @Alice**
	Status: Active
	Seasons participated: 3
	Current seasons: blue-happy-fox
	Total games completed: 12