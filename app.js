import 'dotenv/config';
import express from 'express';
import {
  InteractionResponseType,
  InteractionType,
} from 'discord-interactions';
import {
  VerifyDiscordRequest,
} from './utils.js';
import {
  getLeaderboard,
  getPlayerScoreHistory,
  getPlayerScoreDistribution,
  getPlayerScoresByTimeOfDay,
  getUnionScoreHistory,
  returnDailyUnion,
} from './database.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ verify: VerifyDiscordRequest(process.env.PUBLIC_KEY) }));

function getOption(options, name) {
  return options?.find((option) => option.name === name)?.value;
}

function formatLeaderboard(rows) {
  if (!rows.length) {
    return 'No leaderboard data yet.';
  }

  const lines = rows.map((row, index) => {
    const rank = index + 1;
    return `${rank}. ${row.username} - ${row.total_score_sum} total, ${row.top_score_count} top scores, ${row.solo_point_count} solo points`;
  });

  return `## Leaderboard\n${lines.join('\n')}`;
}

function formatDistribution(distribution) {
  const entries = Object.entries(distribution)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([key, value]) => `${key}: ${value}`);

  return entries.length ? entries.join(', ') : 'No data yet.';
}

function formatHistory(userId, rows, distribution) {
  if (!rows.length) {
    return `<@${userId}> has no score history yet.`;
  }

  const recentRows = rows.slice(0, 15).map((row) => `Day ${row.game_day_id}: ${row.score}`);
  const dist = formatDistribution(distribution);

  return [
    `## Score history for <@${userId}>`,
    recentRows.join('\n'),
    '',
    `Distribution: ${dist}`,
  ].join('\n');
}

function formatTimeOfDay(userId, distributionData) {
  const hours = Object.keys(distributionData.distribution)
    .map(Number)
    .sort((a, b) => a - b);

  if (!hours.length) {
    return `<@${userId}> has no time-of-day data yet.`;
  }

  const lines = hours.map((hour) => {
    const scores = distributionData.distribution[hour];
    const avg = distributionData.averages[hour].toFixed(2);
    return `${String(hour).padStart(2, '0')}:00 - count ${distributionData.frequency[hour]}, avg ${avg}, scores [${scores.join(', ')}]`;
  });

  return [
    `## Time of day for <@${userId}>`,
    lines.join('\n'),
  ].join('\n');
}

function formatUnionSummary(gameDayId, summary) {
  if (!summary) {
    return `No union summary found for day ${gameDayId}.`;
  }

  return [
    `## Union summary for day ${gameDayId}`,
    `Union score: ${summary.union_score}`,
    `Unique players: ${summary.users.length}`,
    `Scores: ${summary.scores.join(', ')}`,
    `Union array: ${summary.union.join(', ')}`,
    `Detailed: ${summary.detailed.join(', ')}`,
    `Unique winners: ${summary.unique.map((value) => value ?? '-').join(', ')}`,
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

app.post('/interactions', async function (req, res) {
  const { type, data } = req.body;

  if (type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG });
  }

  if (type === InteractionType.APPLICATION_COMMAND) {
    const { name, options } = data;

    if (name === 'leaderboard' || name === 'backlog-leaderboard') {
      const rows = getLeaderboard();
      return sendText(res, formatLeaderboard(rows));
    }

    if (name === 'history') {
      const userId = getOption(options, 'user') ?? req.body.member?.user?.id ?? req.body.user?.id;
      if (!userId) {
        return sendText(res, 'Missing user option for history.', true);
      }

      const rows = getPlayerScoreHistory(userId);
      const distribution = getPlayerScoreDistribution(userId);
      return sendText(res, formatHistory(userId, rows, distribution));
    }

    if (name === 'time') {
      const userId = getOption(options, 'user') ?? req.body.member?.user?.id ?? req.body.user?.id;
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
      const gameDayIdOption = getOption(options, 'game_day_id');

      if (gameDayIdOption !== undefined && gameDayIdOption !== null) {
        const gameDayId = Number(gameDayIdOption);
        const summary = returnDailyUnion(gameDayId);
        return sendText(res, formatUnionSummary(gameDayId, summary));
      }

      const history = getUnionScoreHistory();
      if (!history.length) {
        return sendText(res, 'No union summaries exist yet.');
      }

      const latestDayId = history[0].game_day_id;
      const summary = returnDailyUnion(latestDayId);
      return sendText(res, formatUnionSummary(latestDayId, summary));
    }

    return sendText(res, `Unknown command: ${name}`, true);
  }

  return sendText(res, 'Unsupported interaction type.', true);
});

app.listen(PORT, () => {
  console.log('Listening on port', PORT);
});