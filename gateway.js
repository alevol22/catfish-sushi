// import 'dotenv/config';
// import { Client, GatewayIntentBits } from 'discord.js';
// import { saveMessage } from './database.js';
// import { parseGameMessage } from './utils.js';

// const client = new Client({
//   intents: [
//     GatewayIntentBits.Guilds,
//     GatewayIntentBits.GuildMessages,
//     GatewayIntentBits.MessageContent,
//   ],
// });

// const TARGET_CHANNEL_ID = process.env.TARGET_CHANNEL_ID;

// function formatLocalDay(date) {
//   return date.toISOString().slice(0, 10);
// }

// function formatGameDayId(date) {
//   return Number(date.toISOString().slice(0, 10).replaceAll('-', ''));
// }

// client.once('ready', () => {
//   console.log(`Logged in as ${client.user.tag}`);
// });

// client.on('messageCreate', (message) => {
//   if (!TARGET_CHANNEL_ID) return;
//   if (message.channelId !== TARGET_CHANNEL_ID) return;
//   if (message.author.bot) return;
//   if (!message.content?.trim()) return;

//   const parsed = parseGameMessage(message.content);
//   if (!parsed) {
//     console.log(`Skipping message ${message.id}: not a valid game message`);
//     return;
//   }

//   saveMessage({
//     message_id: message.id,
//     user_id: message.author.id,
//     username: message.author.username,
//     score: parsed.score,
//     message_content: parsed.message_content,
//     message_timestamp_utc: message.createdAt.toISOString(),
//     game_day_id: formatGameDayId(message.createdAt),
//     local_day: formatLocalDay(message.createdAt),
//     timezone_name: null,
//     timezone_offset_minutes: null,
//   });
// });

// client.login(process.env.DISCORD_TOKEN);