import 'dotenv/config';
import express from 'express';
import cron from 'node-cron';
import {
  InteractionResponseType,
  InteractionType,
} from 'discord-interactions';
import {
  VerifyDiscordRequest,
  DiscordRequest,
  parseGameMessage,
  getGameDayIdForDate,
} from './utils.js';
import {
  getLeaderboard,
  getPlayerScoreHistory,
  getPlayerScoreDistribution,
  getPlayerScoresByTimeOfDay,
  getUnionScoreHistory,
  getUnionScoreDistribution,
  returnDailyUnion,
  saveMessage,
  hasBackfillRun,
  markBackfillRun,
} from './database.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ verify: VerifyDiscordRequest(process.env.PUBLIC_KEY) }));

function getOption(options, name) {
  return options?.find((option) => option.name === name)?.value;
}

async function fetchAllChannelMessages() {
  const allMessages = [];
  let before;

  while (true) {
    const endpoint = `channels/${process.env.TARGET_CHANNEL_ID}/messages?limit=100${before ? `&before=${before}` : ''}`;
    const response = await DiscordRequest(endpoint, { method: 'GET' });
    const page = await response.json();

    if (!page.length) break;

    allMessages.push(...page);
    before = page[page.length - 1].id;

    if (page.length < 100) break;
  }

  return allMessages;
}

async function runBackfill() {
  const messages = await fetchAllChannelMessages();

  for (const message of messages.reverse()) {
    if (message.author?.bot) continue;
    if (!message.content?.trim()) continue;

    const parsed = parseGameMessage(message.content);
    if (!parsed) continue;

    saveMessage({
      message_id: message.id,
      user_id: message.author.id,
      username: message.author.username,
      score: parsed.score,
      message_content: parsed.message_content,
      message_timestamp_utc: message.created_at ?? message.timestamp ?? new Date(message.createdAt ?? Date.now()).toISOString(),
      game_day_id: parsed.game_day_id,
      local_day: new Date(message.timestamp ?? message.created_at ?? Date.now()).toISOString().slice(0, 10),
      timezone_name: null,
      timezone_offset_minutes: null,
    });
  }
}

function getLatestUnionSummaryMessage(gameDay) {
  const summary = returnDailyUnion(gameDay);
  return formatUnionSummary(latestDayId, summary);
}

async function postDailyUnionSummary() {
  const latestDayId = getGameDayIdForDate(new Date());
  const content = await getLatestUnionSummaryMessage(latestDayId);
  if (!content) return;

  await DiscordRequest(`channels/${process.env.TARGET_CHANNEL_ID}/messages`, {
    method: 'POST',
    body: {
      content,
      allowed_mentions: { parse: [] },
    },
  });
}

cron.schedule(
  '59 23 * * *',
  async () => {
    try {
      await postDailyUnionSummary();
    } catch (error) {
      console.error('Failed to post daily union summary:', error);
    }
  },
  {
    timezone: 'America/New_York',
  }
);

function formatAsciiHistogram(input, options = {}) {
  const {
    title = '',
    barWidth = 24,
    labelWidth = 4,
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

  const lines = normalized.map(([label, value]) => {
    const filled = value === 0 ? 0 : Math.max(1, Math.round((value / maxValue) * barWidth));
    const bar = '#'.repeat(filled);
    return `${label.padStart(labelWidth)} | ${bar.padEnd(barWidth)} | ${value}`;
  });

  return [title, ...lines].filter(Boolean).join('\n');
}

function formatLeaderboard(rows) {
  if (!rows.length) {
    return 'No leaderboard data yet.';
  }

  const headers = ['Rank', 'Player', 'Total', 'Top', 'Solo'];

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
    border,
    formatRow(headers),
    border,
    ...data.map(formatRow),
    border,
  ].join('\n');
}

function formatDistribution(distribution) {
  const entries = Object.entries(distribution)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([key, value]) => `${key}: ${value}`);

  return entries.length ? entries.join(', ') : 'No data yet.';
}

function formatAsciiTable(title, headers, rows, emptyMessage = 'No data yet.') {
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
    title,
    border,
    formatRow(headers),
    border,
    ...rows.map(formatRow),
    border,
  ]
    .filter(Boolean)
    .join('\n');
}

function formatTimeOfDay(userId, distributionData) {
  const hours = Object.keys(distributionData.distribution)
    .map(Number)
    .sort((a, b) => a - b);

  if (!hours.length) {
    return `<@${userId}> has no time-of-day data yet.`;
  }

  const sumRows = hours.map((hour) => [
    `${String(hour).padStart(2, '0')}:00`,
    distributionData.sums[hour],
  ]);

  const frequencyRows = hours.map((hour) => [
    `${String(hour).padStart(2, '0')}:00`,
    distributionData.frequency[hour],
  ]);

  const averageHistogram = formatAsciiHistogram(distributionData.averages, {
    title: 'Averages',
    barWidth: 20,
    labelWidth: 2,
  });

  return [
    `## Time of day for <@${userId}>`,
    '',
    formatAsciiTable('Sums', ['Hour', 'Sum'], sumRows),
    '',
    formatAsciiTable('Frequencies', ['Hour', 'Count'], frequencyRows),
    '',
    averageHistogram,
  ].join('\n');
}

function formatUnionSummary(gameDayId, summary) {
  if (!summary) {
    return `No union summary found for day ${gameDayId}.`;
  }

  const unionEmoji = summary.union.map((value) => (value > 0 ? '🍣' : '🪝')).join('');

  const detailedEmoji = summary.detailed
    .map((value) => {
      if (value === 0) return '🪝';
      if (value === 1) return '🦦';
      if (value === 2) return '🐙';
      if (value === 3) return '🦐';
      return '❓';
    })
    .join('');

  return [
    'catfish-sushi',
    `#${gameDayId} - ${summary.union_score}/10`,
    unionEmoji,
    '',
    "today's catch:",
    detailedEmoji,
  ].join('\n');
}

function sendText(res, content, ephemeral = false) {
  return res.send({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content,
      ...(ephemeral ? { flags: 64 } : {}),
      allowed_mentions: { parse: [] },
    },
  });
}

// POST STARTS HERE
app.post('/interactions', async function (req, res) {
  const { type, data } = req.body;

  if (type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG });
  }

  if (type === InteractionType.APPLICATION_COMMAND) {
    const { name, options } = data;

    if (name === 'leaderboard') {
      const rows = getLeaderboard();
      return sendText(res, formatLeaderboard(rows));
    }

    if (name === 'backlog') {
        const username = req.body.member.user.username;
        if (username !== 'sashimi4878') {
            return sendText(res, 'You are not allowed to run the backlog backfill.', true);
        }

        if (!hasBackfillRun()) {
            await runBackfill();
            markBackfillRun();
        }

        return sendText(res, "Backfill completed successfully.");
    }

    if (name === 'history') {
      const view = getOption(options, 'view');
      const userId = req.body.member.user.id;
      
      if (!view) {
          return sendText(res, 'Missing view option for history.', true);
      }
      if ((view === 'my_histogram' || view === 'my_history') && !userId) {
          return sendText(res, 'Missing user for history.', true);
      }

    if (view === 'my_history') {
        const rows = getPlayerScoreHistory(userId);
        const tableRows = rows.map((row) => [
            row.game_day_id,
            row.score,
        ]);

        return sendText(
            res,
            [
            `## My history for <@${userId}>`,
            '',
            formatAsciiTable('History', ['Day', 'Score'], tableRows),
            ].join('\n')
        );
    }

    if (view === 'my_histogram') {
        const distribution = getPlayerScoreDistribution(userId);
        return sendText(
        res,
        [
            `## Score histogram for <@${userId}>`,
            '',
            formatAsciiHistogram(distribution, {
            title: 'Scores',
            barWidth: 20,
            labelWidth: 4,
            }),
        ].join('\n')
        );
    }

    if (view === 'union_history') {
        const history = getUnionScoreHistory();

        if (!history.length) {
            return sendText(res, 'No union history yet.', true);
        }

        const tableRows = history.map((row) => {
            const summary = JSON.parse(row.union_scores_json);
            return [
            row.game_day_id,
            summary.union_score,
            summary.users.length,
            ];
        });

        return sendText(
            res,
            [
            '## Union history',
            '',
            formatAsciiTable('Union', ['Day', 'Score', 'Players'], tableRows),
            ].join('\n')
        );
    }

    if (view === 'union_histogram') {
        const distribution = getUnionScoreDistribution();
        return sendText(
        res,
        [
            '## Union histogram',
            '',
            formatAsciiHistogram(distribution, {
            title: 'Union scores',
            barWidth: 20,
            labelWidth: 4,
            }),
        ].join('\n')
        );
    }

    return sendText(res, `Unknown history view: ${view}`, true);
    }

    if (name === 'time') {
      const userId = req.body.member.user.id;
      if (!userId) {
        return sendText(res, 'Missing user option for time.', true);
      }

      const timezoneOffsetMinutes = getOption(options, 'timezone_offset_minutes');
      const payload = getPlayerScoresByTimeOfDay(
        userId,
        timezoneOffsetMinutes !== undefined ? String(timezoneOffsetMinutes) : undefined
      );

      return sendText(res, formatTimeOfDay(userId, payload));
    }

    if (name === 'union') {
        const gameDayIdOption = Number(getOption(options, 'game_day_id'));
        const content = await getLatestUnionSummaryMessage(gameDayIdOption);
        if (!content) {
            return sendText(res, 'No union summaries exist yet.', true);
        }

        return sendText(res, content);
    }

    return sendText(res, `Unknown command: ${name}`, true);
  }

  return sendText(res, 'Unsupported interaction type.', true);
});

app.listen(PORT, () => {
  console.log('Listening on port', PORT);
});