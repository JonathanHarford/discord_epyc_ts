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

