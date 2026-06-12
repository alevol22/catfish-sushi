import 'dotenv/config';
import { fakeGameItems } from './game.js';
import { InstallGlobalCommands } from './utils.js';

// const WIKI_COMMAND = {
//   name: 'wiki',
//   type: 1,
//   description: 'Lookup information in wiki',
//   options: [
//     {
//       type: 3,
//       name: 'item',
//       description: 'Item to lookup',
//       choices: fakeGameItems, //       choices: createCommandChoices(),
//       required: true,
//     },
//   ],
//   integration_types: [0],
//   contexts: [0],
// };

// Leaderboard command
const LEADERBOARD_COMMAND = {
  name: 'leaderboard',
  type: 1,
  description: 'See leaderboard',
  integration_types: [0],
  contexts: [0],
};

// Leaderboard backlog command
const BACKLOG_LEADERBOARD_COMMAND = {
  name: 'backlog-leaderboard',
  type: 1,
  description: 'See leaderboard of all of our previous history',
  integration_types: [0],
  contexts: [0],
};

// History command, need input parameters
const HISTORY_COMMAND = {
  name: 'history',
  type: 1,
  description: 'See history matching input parameters',
  integration_types: [0],
  contexts: [0],
};

// Time command
const TIME_COMMAND = {
  name: 'time',
  type: 1,
  description: 'Histogram of player scores depending on when they submit their message',
  integration_types: [0],
  contexts: [0],
};

// Union (main) command
const UNION_COMMAND = {
  name: 'union',
  type: 1,
  description: 'Automatic daily summary command',
  integration_types: [0],
  contexts: [0],
};

const ALL_COMMANDS = [
  LEADERBOARD_COMMAND,
  BACKLOG_LEADERBOARD_COMMAND,
  HISTORY_COMMAND,
  TIME_COMMAND,
  UNION_COMMAND,
];

InstallGlobalCommands(process.env.APP_ID, ALL_COMMANDS);


// // Get the game choices from game.js
// function createCommandChoices() {
//   const choices = getRPSChoices();
//   const commandChoices = [];

//   for (let choice of choices) {
//     commandChoices.push({
//       name: capitalize(choice),
//       value: choice.toLowerCase(),
//     });
//   }

//   return commandChoices;
// }