import 'dotenv/config';
import { InstallGlobalCommands } from './utils.js';

// Leaderboard command
const LEADERBOARD_COMMAND = {
  name: 'leaderboard',
  type: 1,
  description: 'See leaderboard',
  integration_types: [0],
  contexts: [0],
};

// Backlog command
const BACKLOG_COMMAND = {
  name: 'backlog',
  type: 1,
  description: 'Backfill historical messages',
  integration_types: [0],
  contexts: [0],
};

// History command, with input parameters
const HISTORY_COMMAND = {
  name: 'history',
  type: 1,
  description: 'See history matching input parameters',
  options: [
    {
      type: 3,
      name: 'view',
      description: 'What to show',
      required: true,
      choices: [
        { name: 'my histogram', value: 'my_histogram' },
        { name: 'my history', value: 'my_history' },
        { name: 'union histogram', value: 'union_histogram' },
        { name: 'union history', value: 'union_history' },
      ],
    },
  ],
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
  options: [
    {
      type: 4,
      name: 'game_day_id',
      description: 'Game day for union to display',
      required: true
    },
  ],
  integration_types: [0],
  contexts: [0],
};

const ALL_COMMANDS = [
  LEADERBOARD_COMMAND,
  BACKLOG_COMMAND,
  HISTORY_COMMAND,
  TIME_COMMAND,
  UNION_COMMAND,
];

InstallGlobalCommands(process.env.APP_ID, ALL_COMMANDS);