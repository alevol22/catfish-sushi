# catfish-sushi
Discord bot for processing catfishing.net results pasted into a Discord server and summarizing them into daily or other periodic stats. This is my first Discord bot!


## Running this

```
npm install
npm run register
npm run start
ngrok http 3000
```

## Commands

`/leaderboard`  
No Args  
Returns ASCII-formatted leaderboard table of all the players and their cumulative scores so far.

`/backlog`  
No Args  
Ephemeral, admin-only command. Uploads the entire backlog of the channel to the database and updates all counts.

`/history`  
Select 1 of 4 options for 'view' arg:  'my histogram', 'my history', 'union histogram', 'union_histogram'.  
Displays either player or union history in one of two views: histogram (draen with ASCII) or trend over time (currently a table, will be a graph). Currently, returns only a player's own history (future update may allow running for someone else).

`/time`  
No Args  
Histogram of player scores depending on when (time of day) they submit their message. Currently, returns only a player's own summary (future update may allow running for someone else).

`/union`  
Numerical 'game_day_id' arg inputted by user.  
Normally, the functionality of this command should run automatically at 23:59pm EST (or UTC?) every day. But, if this does not happen or something goes wrong, the manual command should replace that.

## Files

app.js - main file that maps commands and options to database calls and processing.

commands.js - list for commands and some definitions (needed for registration).

database.js - creates the database tables, schemas, helper functions, and external-facing data-query functions.

gateway.js - listener for incoming messages (saves only messages of the catfishing format).

renovate.json - artifact of project I'm buildign from, supposedly auto-updates packages and dependencies.

utils.js - various helper functions for API calls and processing.

### Technical details

App: Built with Express and `discord-interactions` and `discord.js` JS packages  
Database: local, built with `better-sqlite3`  
Hosting: interactions endpoint with `ngrok`