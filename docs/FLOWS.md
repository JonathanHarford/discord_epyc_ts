# Bot Setup

Bot→#general:
	Thank you for adding @EatPoopYouCat to your server!
	You must `/config channels` before I can administer games.
	Join our server for additional help… or to play with strangers: https://discord.gg/karuta

Alice→#general:
	/config channels announce:#games completed:#epyc admin:#mods

Bot(reply):
	You're all set up! Use /start to start your first game, or /season to start a season.

Alice→#general:
	/config games

Bot(reply):
	**Default game rules:**
	turn_pattern: writing,drawing
	writing_timeout: 5m
	writing_warning: 1m
	drawing_timeout: 20m
	drawing_warning: 2m
	stale_timeout: 3d
	min_turns: 6
	max_turns: none
	returns: none

Alice→#general:
	/config games writing_timeout:1d drawing_timeout:2d stale_timeout:7d returns:2/3

Bot(reply):
	**Default game rules:**
	turn_pattern: writing,drawing
	writing_timeout: 1d
	writing_warning: 1m
	drawing_timeout: 2d
	drawing_warning: 2m
	stale_timeout: 7d
	min_turns: 6
	max_turns: none
	returns: Players can play 2 times per game, as long as three turns have passed in between.

Alice→#general:
	/config seasons

Bot(reply):
	**Default season rules:**
	turn_pattern: writing,drawing
	writing_timeout: 1d
	writing_warning: 3h
	drawing_timeout: 3d
	drawing_warning: 6h
	min_players: 6
	max_players: none

# Creating a game

Alice→#games:
	/start

Bot→#games:
	@Alice has started a new game! Use `/play` to join.

Bot→Alice(DM):
	You've started a new game! Please write a starting sentence or phrase.

Alice→Bot(DM):
	The ninja carefully balanced an egg on his sword.

Bot→Alice(DM):
	Thanks! Your turn has been recorded. I'll notify you when the game is completed.

# Playing a game

Bob→#games:
	/play

Bot→#games:
	@Bob has joined the game started by @Alice!

Bot→Bob(DM):
	It's your turn! Draw an illustration based on this sentence:
	"The ninja carefully balanced an egg on his sword."
	
	[Attach your drawing as an image file in this DM]
	[To flag this turn as inappropriate, type "flag"]

Bob→Bot(DM):
	[Uploads drawing of a ninja balancing an egg]

Bot→Bob(DM):
	Thanks! Your turn has been recorded. I'll notify you when the game is completed.

Charlie→#games:
	/play

Bot→#games:
	@Charlie has joined the game!

Bot→Charlie(DM):
	It's your turn! Write a sentence or phrase describing this image:
	[Image of Bob's drawing]
	
	[Type your response directly in this DM]
	[To flag this turn as inappropriate, type "flag"]

Charlie→Bot(DM):
	A samurai demonstrates his skill with precise blade control.

Bot→Charlie(DM):
	Thanks! Your turn has been recorded. I'll notify you when the game is completed.

# Timeout Scenario

Bot→Dave(DM):
	⚠️ Reminder: You have 1 minute to complete your writing turn. After that, your turn will time out and be skipped.

[After timeout period]

Bot→Dave(DM):
	Your turn has timed out. The game will now be available for another player.

# Turn Flagging

Emma→Bot(DM):
	flag

Bot→Emma(DM):
	You've flagged the previous turn. An admin will review it. The game is now paused.

Bot→#mods:
	⚠️ @Emma has flagged a turn in game #12345.
	**Previous turn:** [Image or text content]
	
	React with:
	- ✅ to remove the flag and unpause the game
	- 🚫 to delete the turn and continue the game
	- 🔨 to ban the player (@Frank) and delete the turn

# Finishing a game

[After minimum turns completed and stale timeout period]

Bot→#epyc:
	**Game Complete!**
	Started by @Alice, played by @Bob, @Charlie, @Dave, @Emma
	
	Turn 1 (@Alice): "The ninja carefully balanced an egg on his sword."
	
	Turn 2 (@Bob): [Image of ninja balancing egg]
	
	Turn 3 (@Charlie): "A samurai demonstrates his skill with precise blade control."
	
	[remaining turns...]
	
	Final turn (@Emma): "The martial artist chopped the vegetable with one swift motion."
	
	Thanks for playing!

# Creating a season

Alice→#games:
	/season open_duration:1d

Bot→#games:
	@Alice has started a new season with ID: **blue-happy-fox**
	Season will remain open for joining for 1 day.
	Use `/season join id:blue-happy-fox` to join!

Bob→#games:
	/season join id:blue-happy-fox

Bot→#games:
	@Bob has joined the season **blue-happy-fox**!
	Current players: @Alice, @Bob

[After open duration passes]

Bot→#games:
	Season **blue-happy-fox** is now active with 8 players x 8 games = 64 turns in all!

# Playing a season

Bot→Alice(DM): (Initiation occurs simultaneously for all players/games)
	It's your turn to start **Game 1** for season **blue-happy-fox**! 
	Please write a starting sentence or phrase.

Alice→Bot(DM):
	The astronaut discovered a tiny alien in his spacesuit pocket.

Bot→Alice(DM):
	Thanks! Your turn has been recorded.

--

Bot→Bob(DM):
	It's your turn to start **Game 2** for season **blue-happy-fox**!
	Please write a starting sentence or phrase.

Bob→Bot(DM):
	Three cats wearing sunglasses drove a convertible down the highway.

Bot→Bob(DM):
	Thanks! Your turn has been recorded.

--

Bot→Bob(DM):
	It's your turn in **Game 1** for season **blue-happy-fox**!
	Draw an illustration based on this sentence:
	"The astronaut discovered a tiny alien in his spacesuit pocket."
	
	[Attach your drawing as an image file in this DM]

Bob→Bot(DM):
	[Uploads drawing of astronaut with alien]

Bot→Alice(DM):
	Thanks! Your turn has been recorded.

--

Bot→Alice(DM):
	It's your turn in **Game 2** for season **blue-happy-fox**! Draw an illustration based on this sentence:
	"Three cats wearing sunglasses drove a convertible down the highway."
	
	[Attach your drawing as an image file in this DM]

Alice→Bot(DM):
	[Uploads drawing of cats in convertible]

Bot→Alice(DM):
	Thanks! Your turn has been recorded.


# Finishing a season

[After all games in season completed]

Bot→#epyc:
	**Season Complete!** 🎉
	Season **blue-happy-fox** with @Alice, @Bob
	
	**Game 1 (Started by @Alice):**
	Turn 1 (@Alice): "The astronaut discovered a tiny alien in his spacesuit pocket."
	Turn 2 (@Bob): [Image of astronaut with alien]
    ...

	
	**Game 2 (Started by @Bob):**
	Turn 1 (@Bob): "Three cats wearing sunglasses drove a convertible down the highway."
	Turn 2 (@Alice): [Image of cats in convertible]
    ...

# Admin commands

Admin→#games:
	/admin terminate game_id:12345

Bot→#mods:
	Game #12345 has been terminated by @Admin.

Admin→#mods:
	/admin ban user:@Troll

Bot→#mods:
	@Troll has been banned from playing EPYC games on this server.

Admin→#games:
	/admin unban user:@ReformedTroll

Bot→#mods:
	@ReformedTroll has been unbanned and can now play EPYC games on this server.

Admin→#games:
	/admin test_mode enable

Bot→#games:
	Test mode enabled. Games will use shortened timeouts:
	- writing: 1m
	- drawing: 2m
	- stale: 5m
	Use `/admin add_test_player` to add virtual players.

