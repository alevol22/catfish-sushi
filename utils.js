import 'dotenv/config';
import { verifyKey } from 'discord-interactions';
import { getFakeUsername } from './game.js';

export function VerifyDiscordRequest(clientKey) {
  return function (req, res, buf) {
    const signature = req.get('X-Signature-Ed25519');
    const timestamp = req.get('X-Signature-Timestamp');
    console.log(signature, timestamp, clientKey);

    const isValidRequest = verifyKey(buf, signature, timestamp, clientKey);
    if (!isValidRequest) {
      res.status(401).send('Bad request signature');
      throw new Error('Bad request signature');
    }
  };
}

export async function DiscordRequest(endpoint, options) {
  // append endpoint to root API URL
  const url = 'https://discord.com/api/v10/' + endpoint;
  // Stringify payloads
  if (options.body) options.body = JSON.stringify(options.body);
  const res = await fetch(url, {
    headers: {
      Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'User-Agent':
        'DiscordBot (https://github.com/alevol22/catfish-sushi, 1.0.0)',
    },
    ...options,
  });
  // throw API errors
  if (!res.ok) {
    const data = await res.json();
    console.log(res.status);
    throw new Error(JSON.stringify(data));
  }
  // return original response
  return res;
}

export async function InstallGlobalCommands(appId, commands) {
  // API endpoint to overwrite global commands
  const endpoint = `applications/${appId}/commands`;

  try {
    // This is calling the bulk overwrite endpoint: https://discord.com/developers/docs/interactions/application-commands#bulk-overwrite-global-application-commands
    await DiscordRequest(endpoint, { method: 'PUT', body: commands });
  } catch (err) {
    console.error(err);
  }
}

export function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

async function getServerMembers(guildId, limit) {
  const endpoint = `guilds/${guildId}/members?limit=${limit}`;

  try {
    const res = await DiscordRequest(endpoint, { method: 'GET' });
    const parsedRes = await res.json();
    return parsedRes.map((member) => member.user.id);
  } catch (err) {
    return console.error(err);
  }
}

const EMOJI_SCORE = {
  '🐈': 1,
  '🥚': 0.5,
  '🐟': 0,
};

export function parseEmojiRow(row) {
  const values = Array.from(row.trim(), (char) => EMOJI_SCORE[char]);
  if (values.some((value) => value === undefined)) return null;
  return values;
}

export function parseGameMessage(content) {
  const lines = content.split(/\r?\n/);

  if (lines.length < 4) return null;
  if (lines[0].trim() !== 'catfishing.net') return null;

  const headerMatch = lines[1].trim().match(/^#(\d+)\s*-\s*(\d+)\/10$/);
  if (!headerMatch) return null;

  const gameDayId = Number(headerMatch[1]);
  const score = Number(headerMatch[2]);

  const row1 = parseEmojiRow(lines[2]);
  const row2 = parseEmojiRow(lines[3]);

  if (!row1 || !row2) return null;
  if (row1.length !== 5 || row2.length !== 5) return null;

  return {
    game_day_id: gameDayId,
    score,
    message_content: JSON.stringify([...row1, ...row2]),
  };
}