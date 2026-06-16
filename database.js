import Database from 'better-sqlite3';

// Creates 'catfish-sushi-db.db' file on disk automatically if it does not exist
const db = new Database('catfish-sushi-db.db', { verbose: console.log });

// Enable WAL mode for significantly faster performance
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    message_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    score INTEGER NOT NULL,
    message_content TEXT NOT NULL,
    message_timestamp_utc TEXT NOT NULL,
    game_day_id INTEGER NOT NULL,
    timezone_name TEXT,
    timezone_offset_minutes INTEGER
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_user_day
    ON messages(user_id, game_day_id);

  CREATE TABLE IF NOT EXISTS daily_summaries (
    game_day_id INTEGER NOT NULL,
    union_scores_json TEXT NOT NULL,
    unique_player_count INTEGER NOT NULL,
    PRIMARY KEY (game_day_id)
  );

  CREATE TABLE IF NOT EXISTS dirty_days (
    game_day_id INTEGER NOT NULL,
    PRIMARY KEY (game_day_id)
  );

  CREATE TABLE IF NOT EXISTS player_day_stats (
    game_day_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    score INTEGER NOT NULL,
    had_top_score INTEGER NOT NULL DEFAULT 0,
    was_solo_scorer INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (game_day_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS player_totals (
    user_id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    total_score_sum INTEGER NOT NULL DEFAULT 0,
    top_score_count INTEGER NOT NULL DEFAULT 0,
    solo_point_count INTEGER NOT NULL DEFAULT 0,
    last_updated_game_day_id INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

const insertMessage = db.prepare(`
  INSERT INTO messages (
    message_id,
    user_id,
    username,
    score,
    message_content,
    message_timestamp_utc,
    game_day_id,
    timezone_name,
    timezone_offset_minutes
  ) VALUES (
    @message_id,
    @user_id,
    @username,
    @score,
    @message_content,
    @message_timestamp_utc,
    @game_day_id,
    @timezone_name,
    @timezone_offset_minutes
  )
  ON CONFLICT DO NOTHING;
`);

const markDirtyDay = db.prepare(`
  INSERT INTO dirty_days (game_day_id)
  VALUES (?)
  ON CONFLICT(game_day_id) DO NOTHING
`);

const getState = db.prepare(`
  SELECT value
  FROM app_state
  WHERE key = ?
`);

const setState = db.prepare(`
  INSERT INTO app_state (key, value)
  VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);

const loadMessagesForDay = db.prepare(`
  SELECT *
  FROM messages
  WHERE game_day_id = ?
`);

const upsertDailySummaries = db.prepare(`
  INSERT INTO daily_summaries (
    game_day_id,
    union_scores_json,
    unique_player_count
  ) VALUES (
    @game_day_id,
    @union_scores_json,
    @unique_player_count
  )
  ON CONFLICT(game_day_id) DO UPDATE SET
    union_scores_json = excluded.union_scores_json,
    unique_player_count = excluded.unique_player_count
`);

const upsertPlayerDayStats = db.prepare(`
    INSERT INTO player_day_stats (
        game_day_id,
        user_id,
        username,
        score,
        had_top_score,
        was_solo_scorer
    ) VALUES (
        @game_day_id,
        @user_id,
        @username,
        @score,
        @had_top_score,
        @was_solo_scorer
    )
    ON CONFLICT(game_day_id, user_id) DO UPDATE SET
        username = excluded.username,
        score = excluded.score,
        had_top_score = excluded.had_top_score,
        was_solo_scorer = excluded.was_solo_scorer
`);

// Saves a message to the database and marks the corresponding day as dirty 
// for later rollup recomputation. Message is already in format
// might need to mod to accept many messages
export function saveMessage(message) {
  const tx = db.transaction(() => {
    const result = insertMessage.run(message);
    if (result.changes > 0) {
        markDirtyDay.run(message.game_day_id);
    }
  });

  tx();
}

export function computeDailySummary(game_day_id) {
  const rows = loadMessagesForDay.all(game_day_id);
  const scores = [];
  const uniquePlayers = new Set();
  const results = []; // there can only be one message per player per game day
  let union = []; // max value at each index across submissions
  let detailed = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  let unique = [null, null, null, null, null, null, null, null, null, null]

  for (const row of rows) {
    scores.push(row.score);
    uniquePlayers.add(row.user_id);
    results.push(row.message_content);
  }

  console.log(`Res array ${results}`);

    for (let i = 0; i < 10; i++) {
        let maxAtIndex = 0;
        let nonZeroCount = [];
        for (const [j, result] of results.entries()) {
            const value = parseFloat(result.split(',')[i].trim()) || 0;
            console.log(`Value at index ${i} for result ${j}: ${value}`);
            if (value > maxAtIndex) {
                maxAtIndex = value;
            }
            if (value !== 0) {
                // note: all entries guaranteed to not be null/undefined
                nonZeroCount.push(rows[j].user_id);
            }
        }
        union.push(maxAtIndex);
        // Determine the detailed category based on nonZeroCount
        if (maxAtIndex === 0) {
            detailed[i] = 0;
        } else if (nonZeroCount.length === 1) {
            detailed[i] = 1;
            unique[i] = nonZeroCount[0];
        } else if (nonZeroCount.length < uniquePlayers.size) {
            detailed[i] = 2;
        } else {
            detailed[i] = 3;
        }
    }

  let unionJson = {
    "scores": scores,
    "users": Array.from(uniquePlayers),
    "union_score": union.reduce((a, b) => a + b, 0),
    "union": union,
    "detailed": detailed,
    "unique": unique
  };

  upsertDailySummaries.run({
    game_day_id: game_day_id,
    union_scores_json: JSON.stringify(unionJson),
    unique_player_count: uniquePlayers.size,
  });

    // Find the day’s top score
    const topScore = Math.max(...scores) || 0;
    const topScorers = rows.filter(row => row.score === topScore);

    // Upsert rows into player_day_stats for every player in uniquePlayers
    for (const user_id of uniquePlayers) {
        upsertPlayerDayStats.run({
            game_day_id: game_day_id,
            user_id: user_id,
            username: rows.find(row => row.user_id === user_id).username,
            score: rows.find(row => row.user_id === user_id).score,
            had_top_score: topScorers.some(scorer => scorer.user_id === user_id) ? 1 : 0,
            was_solo_scorer: unique.filter(id => id === user_id).length
        });
    }
}

export function recomputeDirtyDays() {
  const dirtyRows = db.prepare(`
    SELECT game_day_id
    FROM dirty_days
  `).all();

  const clearDirty = db.prepare(`
    DELETE FROM dirty_days
    WHERE game_day_id = ?
  `);

  const tx = db.transaction(() => {
    for (const row of dirtyRows) {
      computeDailySummary(row.game_day_id);
      clearDirty.run(row.game_day_id);
    }
  });

  tx();
}

export function returnDailyUnion(game_day_id) {
    recomputeDirtyDays();

    const row = db.prepare(`
        SELECT union_scores_json
        FROM daily_summaries
        WHERE game_day_id = ?
    `).get(game_day_id);
    return row ? JSON.parse(row.union_scores_json) : null;
}

export function pushPlayerTotalsUpdate(user_id){
    const lastUpdateRow = db.prepare(`
        SELECT last_updated_game_day_id
        FROM player_totals
        WHERE user_id = ?
    `).get(user_id);

    const dateOfLastUpdate = lastUpdateRow ? lastUpdateRow.last_updated_game_day_id : 0;

    const totalsRow = db.prepare(`
        SELECT
            MAX(game_day_id) as last_updated_game_day_id,
            user_id,
            username,
            SUM(score) as total_score_sum,
            SUM(had_top_score) as top_score_count,
            SUM(was_solo_scorer) as solo_point_count
        FROM player_day_stats
        WHERE user_id = ? AND game_day_id > ?
        GROUP BY user_id
    `).get(user_id, dateOfLastUpdate);

    if (!totalsRow) {
        return null;
    }

    // the goal is to add the values from totalsRow to each of the values in player_totals
    // adding a player's recent points to their historical points
    const upsertTotals = db.prepare(`
        INSERT INTO player_totals (
            user_id,
            username,
            total_score_sum,
            top_score_count,
            solo_point_count,
            last_updated_game_day_id
        ) VALUES (
            @user_id,
            @username,
            @total_score_sum,
            @top_score_count,
            @solo_point_count,
            @last_updated_game_day_id
        )
        ON CONFLICT(user_id) DO UPDATE SET
            username = excluded.username,
            total_score_sum = player_totals.total_score_sum + excluded.total_score_sum,
            top_score_count = player_totals.top_score_count + excluded.top_score_count,
            solo_point_count = player_totals.solo_point_count + excluded.solo_point_count,
            last_updated_game_day_id = excluded.last_updated_game_day_id
    `);

    upsertTotals.run(totalsRow);
}

// leaderboard: for each player in player_day_stats, call pushPlayerTotalsUpdate 
// then collate and return a table
export function getLeaderboard() {
    const playerIds = db.prepare(`
        SELECT DISTINCT user_id
        FROM player_day_stats
    `).all().map(row => row.user_id);

    for (const user_id of playerIds) {
        pushPlayerTotalsUpdate(user_id);
    }

    const leaderboard = db.prepare(`
        SELECT
            user_id,
            username,
            total_score_sum,
            top_score_count,
            solo_point_count,
            last_updated_game_day_id
        FROM player_totals
        ORDER BY total_score_sum DESC
    `).all();

    return leaderboard;
}

export function getPlayerScoreHistory(user_id) {
    const historyRows = db.prepare(`
        SELECT
            game_day_id,
            score
        FROM messages
        WHERE user_id = ?
        ORDER BY game_day_id DESC
    `).all(user_id);

    return historyRows;
}

export function getPlayerScoreDistribution(userId) {
    const data = getPlayerScoreHistory(userId);
    const distribution = {};

    for (const row of data) {
        const score = row.score;
        if (distribution[score]) {
            distribution[score]++;
        } else {
            distribution[score] = 1;
        }
    }

    return distribution;
}

export function getUnionScoreHistory() {
    const historyRows = db.prepare(`
        SELECT
            game_day_id,
            union_scores_json
        FROM daily_summaries
        ORDER BY game_day_id DESC
    `).all();

    for (const row of historyRows) {
        row.union_score = JSON.parse(row.union_scores_json).union_score;
        row.players = JSON.parse(row.union_scores_json).users.length;
    }

    return historyRows;
}

export function getUnionScoreDistribution() {
    const history = getUnionScoreHistory();
    const distribution = {};

    for (const row of history) {
        const score = row.union_score;
        if (distribution[score]) {
            distribution[score]++;
        } else {
            distribution[score] = 1;
        }
    }

    return distribution;
}

export function getPlayerScoresByTimeOfDay(userId) {
    const data = db.prepare(`
        SELECT
            score,
            message_timestamp_utc,
            timezone_name,
            timezone_offset_minutes
        FROM messages
        WHERE user_id = ?
    `).all(userId);

    const distribution = {
        "distribution": {},
        "sums": {},
        "frequency": {},
        "averages": {}
    };

    for (const row of data) {
        let date = new Date(row.message_timestamp_utc);
        // if (timezoneNameOrOffset) {
        //     // if input is a number, treat it as a timezone offset in minutes
        //     if (!isNaN(timezoneOffset)) {
        //         date = new Date(date.getTime() + parseInt(timezoneNameOrOffset) * 60000);
        //     } else {
        //         // otherwise, treat it as a timezone name and convert using the row's stored timezone offset
        //         date = new Date(date.getTime() + row.timezone_offset_minutes * 60000);
        //     }
        //     const hour = date.getUTCHours();
        // }
        // else {
            // convert UTC to EST/EDT
            const hour = Number(
                date.toLocaleTimeString('en-US', { 
                    timeZone: 'America/New_York', 
                    hour: '2-digit', 
                    hour12: false 
                })
                );
        // }
        if (distribution.distribution[hour]) {
            distribution.distribution[hour].push(row.score);
            distribution.sums[hour] += row.score;
            distribution.frequency[hour]++;
        } else {
            distribution.distribution[hour] = [row.score];
            distribution.sums[hour] = row.score;
            distribution.frequency[hour] = 1;
        } 
    }

    for (const hour in distribution.distribution) {
        distribution.averages[hour] = distribution.sums[hour] / distribution.frequency[hour];
    }

    return distribution;
}

export function hasBackfillRun() {
  return getState.get('channel_backfill_done')?.value === '1';
}

export function markBackfillRun() {
  setState.run('channel_backfill_done', '1');
}

export default db;
