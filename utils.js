import 'dotenv/config';
import { verifyKey } from 'discord-interactions';

const ANCHOR_GAME_DAY_ID = 640;
const ANCHOR_DATE_UTC = new Date('2026-03-25T00:00:00.000Z');

const MONOSPACE_START = '```text';
const MONOSPACE_END = '```';

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
      Authorization: `Bot ${process.env.BOT_TOKEN}`,
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

  const headerMatch = lines[1].trim().match(/^#(\d+)\s*-\s*(\d+(?:\.\d+)?)\/10$/);
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

export function getGameDayIdForDate(dateInput) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);

  const msPerDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.floor((Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  ) - Date.UTC(
    ANCHOR_DATE_UTC.getUTCFullYear(),
    ANCHOR_DATE_UTC.getUTCMonth(),
    ANCHOR_DATE_UTC.getUTCDate()
  )) / msPerDay);

  return ANCHOR_GAME_DAY_ID + diffDays;
}

export function formatAsciiTable(title, headers, rows, emptyMessage = 'No data yet.') {
  if (!rows.length) {
    return title ? `${title}\n${emptyMessage}` : emptyMessage;
  }

  const widths = headers.map((header, columnIndex) =>
    Math.max(
      header.length,
      ...rows.map((row) => String(row[columnIndex]).length)
    )
  );

  const border = `+${widths.map((width) => '-'.repeat(width + 2)).join('+')}+`;

  const formatRow = (cells) =>
    `| ${cells
      .map((cell, columnIndex) => String(cell).padEnd(widths[columnIndex]))
      .join(' | ')} |`;

  return [
    MONOSPACE_START,
    title,
    formatRow(headers),
    border,
    ...rows.map(formatRow),
    MONOSPACE_END,
  ]
    .filter(Boolean)
    .join('\n');
}

export function formatDistribution(distribution) {
  const entries = Object.entries(distribution)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([key, value]) => `${key}: ${value}`);

  return entries.length ? entries.join(', ') : 'No data yet.';
}

export function formatAsciiHistogram(input, options = {}) {
  const {
    title = '',
    barWidth = 24,
    labelWidth = 'Value'.length,
    sortNumeric = true,
    emptyMessage = 'No data yet.',
  } = options;

  const entries = Array.isArray(input) ? input : Object.entries(input);

  if (!entries.length) {
    return title ? `${title}\n${emptyMessage}` : emptyMessage;
  }

  const normalized = entries
    .map(([label, value]) => [String(label), Number(value) || 0])
    .sort((a, b) => {
      if (!sortNumeric) return a[0].localeCompare(b[0]);
      return Number(a[0]) - Number(b[0]);
    });

  const maxValue = Math.max(...normalized.map(([, value]) => value), 1);

  // 1. Calculate how much value a single '#' represents
  const valuePerHash = maxValue / barWidth;
  const formattedValuePerHash = valuePerHash % 1 === 0 ? valuePerHash : valuePerHash.toFixed(1);

  const header = `${'Value'.padStart(labelWidth)} | Frequency`;

  const lines = normalized.map(([label, value]) => {
    const filled = value === 0 ? 0 : Math.max(1, Math.round((value / maxValue) * barWidth));
    const bar = '#'.repeat(filled);
    
    // 1. Check if the value is a decimal. If so, round to 3 decimal places.
    const formattedValue = Number.isInteger(value) ? value : Number(value.toFixed(3));
    
    // 2. Append the formatted value in parentheses
    const barWithCount = `${bar} (${formattedValue})`.trim();
    
    // Pad the combined string to keep the layout grid intact
    return `${label.padStart(labelWidth)} | ${barWithCount}`;
  });

  // 2. Add the dynamic visual anchor legend showing both scale and max width
  lines.push(`\nLegend: # = ~${formattedValuePerHash} (Max bar size: ${barWidth} #s)`);

  return [
    MONOSPACE_START,
    title,
    header,
    ...lines,
    MONOSPACE_END,
  ].filter(Boolean).join('\n');
}


export function formatLeaderboard(rows) {
  if (!rows.length) {
    return 'No leaderboard data yet.';
  }

  const headers = ['Rank', 'Player', 'Total', 'Days 1st', 'Whales'];

  const data = rows.map((row, index) => [
    String(index + 1),
    row.username,
    String(row.total_score_sum),
    String(row.top_score_count),
    String(row.solo_point_count),
  ]);

  const widths = headers.map((header, columnIndex) =>
    Math.max(header.length, ...data.map((row) => row[columnIndex].length))
  );

  const border = `+${widths.map((width) => '-'.repeat(width + 2)).join('+')}+`;

  const formatRow = (cells) =>
    `| ${cells
      .map((cell, columnIndex) => cell.padEnd(widths[columnIndex]))
      .join(' | ')} |`;

  return [
    MONOSPACE_START,
    border,
    formatRow(headers),
    border,
    ...data.map(formatRow),
    border,
    MONOSPACE_END,
  ].join('\n');
}