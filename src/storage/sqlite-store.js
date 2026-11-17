const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

/**
 * SQLite repository for all ranking data.
 *
 * Runtime data is stored only in data/ranking.sqlite. The schema is created
 * and versioned during init; no external database service is required.
 * Doc ID: Doc.A04
 */
class SqliteStore {
  constructor({ rootDir, filePath } = {}) {
    this.filePath = filePath || path.join(rootDir, "data", "ranking.sqlite");
    this.db = null;
    this.mode = "sqlite";
  }

  async init() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    this.db = new Database(this.filePath);
    this.db.exec("PRAGMA foreign_keys = ON");
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA synchronous = NORMAL");
    this.db.exec("PRAGMA busy_timeout = 5000");
    this.migrate();
  }

  migrate() {
    const version = Number(this.db.prepare("PRAGMA user_version").get().user_version || 0);
    if (version > 1) {
      throw new Error(`SQLite schema version ${version} is newer than this application supports`);
    }
    if (version === 1) return;

    this.transaction(() => {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS topics (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
          share_password TEXT NOT NULL DEFAULT '',
          is_hot INTEGER NOT NULL DEFAULT 0 CHECK (is_hot IN (0, 1)),
          show_names INTEGER NOT NULL DEFAULT 1 CHECK (show_names IN (0, 1)),
          author TEXT NOT NULL DEFAULT '匿名',
          category TEXT NOT NULL DEFAULT '其他',
          tiers_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS items (
          id TEXT PRIMARY KEY,
          topic_id TEXT NOT NULL,
          name TEXT NOT NULL,
          image_path TEXT NOT NULL DEFAULT '',
          rank_key TEXT NULL CHECK (rank_key IS NULL OR rank_key IN ('bang', 'top', 'elite', 'npc', 'trash')),
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_items_topic_order
          ON items(topic_id, sort_order, created_at);

        CREATE TABLE IF NOT EXISTS responses (
          id TEXT PRIMARY KEY,
          topic_id TEXT NOT NULL,
          participant_id TEXT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_responses_topic_created
          ON responses(topic_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS response_items (
          response_id TEXT NOT NULL,
          item_id TEXT NOT NULL,
          rank_key TEXT NULL CHECK (rank_key IS NULL OR rank_key IN ('bang', 'top', 'elite', 'npc', 'trash')),
          sort_order INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (response_id, item_id),
          FOREIGN KEY (response_id) REFERENCES responses(id) ON DELETE CASCADE,
          FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_response_items_order
          ON response_items(response_id, sort_order);

        PRAGMA user_version = 1;
      `);
    });
  }

  async close() {
    if (!this.db) return;
    this.db.close();
    this.db = null;
  }

  async listTopics() {
    const topics = this.db
      .prepare(`${topicSelect()} ORDER BY updated_at DESC`)
      .all()
      .map(normalizeTopicRow);
    const itemsByTopic = this.getItemsByTopicIds(topics.map((topic) => topic.id));
    return topics.map((topic) => ({ ...topic, items: itemsByTopic.get(topic.id) || [] }));
  }

  async createTopic(input) {
    const now = new Date().toISOString();
    this.db
      .prepare(`
        INSERT INTO topics
          (id, title, visibility, share_password, is_hot, show_names, author, category, tiers_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        input.id,
        input.title,
        input.visibility,
        normalizeSharePassword(input.sharePassword),
        input.hot ? 1 : 0,
        input.showNames === false ? 0 : 1,
        input.author,
        normalizeCategory(input.category),
        JSON.stringify(defaultTiers()),
        now,
        now,
      );
    return this.getTopic(input.id);
  }

  async getTopic(id) {
    const topic = this.db.prepare(`${topicSelect()} WHERE id = ?`).get(id);
    if (!topic) return null;
    const items = this.db
      .prepare(`${itemSelect()} WHERE topic_id = ? ORDER BY sort_order ASC, created_at ASC`)
      .all(id)
      .map(normalizeItemRow);
    return { ...normalizeTopicRow(topic), items };
  }

  async deleteTopic(id) {
    return Number(this.db.prepare("DELETE FROM topics WHERE id = ?").run(id).changes) > 0;
  }

  async updateTopic(topicId, input) {
    const updates = [];
    const values = [];
    if (input.title) addUpdate(updates, values, "title", input.title);
    if (input.visibility) addUpdate(updates, values, "visibility", input.visibility);
    if (input.sharePassword !== undefined) {
      addUpdate(updates, values, "share_password", normalizeSharePassword(input.sharePassword));
    }
    if (input.author) addUpdate(updates, values, "author", input.author);
    if (input.category) addUpdate(updates, values, "category", normalizeCategory(input.category));
    if (input.hot !== undefined) addUpdate(updates, values, "is_hot", input.hot ? 1 : 0);
    if (input.showNames !== undefined) addUpdate(updates, values, "show_names", input.showNames ? 1 : 0);
    if (!updates.length) return this.getTopic(topicId);

    addUpdate(updates, values, "updated_at", new Date().toISOString());
    values.push(topicId);
    const result = this.db.prepare(`UPDATE topics SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    if (!Number(result.changes)) return null;
    return this.getTopic(topicId);
  }

  async updateTiers(topicId, tiers) {
    const result = this.db
      .prepare("UPDATE topics SET tiers_json = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(normalizeTiers(tiers)), new Date().toISOString(), topicId);
    if (!Number(result.changes)) return null;
    return this.getTopic(topicId);
  }

  async createItem(topicId, input) {
    if (!this.topicExists(topicId)) return null;
    const nextOrder = this.db
      .prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM items WHERE topic_id = ?")
      .get(topicId).next_order;
    const now = new Date().toISOString();
    this.transaction(() => {
      this.db
        .prepare(`
          INSERT INTO items
            (id, topic_id, name, image_path, rank_key, sort_order, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(input.id, topicId, input.name, input.imagePath, normalizeRank(input.rank) || null, nextOrder, now, now);
      this.touchTopic(topicId, now);
    });
    return this.getItem(topicId, input.id);
  }

  async updateItem(topicId, itemId, input) {
    const updates = [];
    const values = [];
    if (input.name) addUpdate(updates, values, "name", input.name);
    if (input.rank !== undefined) addUpdate(updates, values, "rank_key", normalizeRank(input.rank) || null);
    if (!updates.length) return this.getItem(topicId, itemId);

    const now = new Date().toISOString();
    addUpdate(updates, values, "updated_at", now);
    values.push(topicId, itemId);
    let changes = 0;
    this.transaction(() => {
      changes = Number(
        this.db.prepare(`UPDATE items SET ${updates.join(", ")} WHERE topic_id = ? AND id = ?`).run(...values)
          .changes,
      );
      if (changes) this.touchTopic(topicId, now);
    });
    return changes ? this.getItem(topicId, itemId) : null;
  }

  async updateItemsOrder(topicId, items) {
    if (!this.topicExists(topicId)) return null;
    const now = new Date().toISOString();
    const update = this.db.prepare(`
      UPDATE items
      SET rank_key = ?, sort_order = ?, updated_at = ?
      WHERE topic_id = ? AND id = ?
    `);
    this.transaction(() => {
      items.forEach((item, index) => {
        const sortOrder = Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : index;
        update.run(normalizeRank(item.rank) || null, sortOrder, now, topicId, String(item.id));
      });
      this.touchTopic(topicId, now);
    });
    return this.getTopic(topicId);
  }

  async createResponse(topicId, input) {
    const topic = await this.getTopic(topicId);
    if (!topic) return null;
    const itemIds = new Set(topic.items.map((item) => item.id));
    const rankings = normalizeRankings(input.rankings, itemIds);
    const createdAt = new Date().toISOString();
    const insertRanking = this.db.prepare(`
      INSERT INTO response_items (response_id, item_id, rank_key, sort_order)
      VALUES (?, ?, ?, ?)
    `);

    this.transaction(() => {
      this.db
        .prepare("INSERT INTO responses (id, topic_id, participant_id, created_at) VALUES (?, ?, ?, ?)")
        .run(input.id, topicId, input.participantId || null, createdAt);
      for (const ranking of rankings) {
        insertRanking.run(input.id, ranking.itemId, ranking.rank || null, ranking.sortOrder);
      }
    });

    return {
      id: input.id,
      topicId,
      participantId: input.participantId || "",
      createdAt,
      rankings,
    };
  }

  async listResponses(topicId) {
    if (!this.topicExists(topicId)) return null;
    const responses = this.db
      .prepare(`
        SELECT id, topic_id AS topicId, participant_id AS participantId, created_at AS createdAt
        FROM responses
        WHERE topic_id = ?
        ORDER BY created_at DESC
      `)
      .all(topicId);
    return this.attachRankings(responses);
  }

  async getResponse(topicId, responseId) {
    if (!this.topicExists(topicId)) return null;
    const response = this.db
      .prepare(`
        SELECT id, topic_id AS topicId, participant_id AS participantId, created_at AS createdAt
        FROM responses
        WHERE topic_id = ? AND id = ?
      `)
      .get(topicId, responseId);
    if (!response) return null;
    return this.attachRankings([response])[0];
  }

  async deleteItem(topicId, itemId) {
    const item = this.getItem(topicId, itemId);
    if (!item) return null;
    const now = new Date().toISOString();
    this.transaction(() => {
      this.db.prepare("DELETE FROM items WHERE topic_id = ? AND id = ?").run(topicId, itemId);
      const remaining = this.db
        .prepare("SELECT id FROM items WHERE topic_id = ? ORDER BY sort_order ASC, created_at ASC")
        .all(topicId);
      const reorder = this.db.prepare("UPDATE items SET sort_order = ? WHERE topic_id = ? AND id = ?");
      remaining.forEach((row, index) => reorder.run(index, topicId, row.id));
      this.touchTopic(topicId, now);
    });
    return item;
  }

  getItem(topicId, itemId) {
    const row = this.db.prepare(`${itemSelect()} WHERE topic_id = ? AND id = ?`).get(topicId, itemId);
    return row ? normalizeItemRow(row) : null;
  }

  getItemsByTopicIds(topicIds) {
    const map = new Map();
    if (!topicIds.length) return map;
    const placeholders = topicIds.map(() => "?").join(", ");
    const items = this.db
      .prepare(`${itemSelect()} WHERE topic_id IN (${placeholders}) ORDER BY sort_order ASC, created_at ASC`)
      .all(...topicIds);
    for (const row of items) {
      if (!map.has(row.topicId)) map.set(row.topicId, []);
      map.get(row.topicId).push(normalizeItemRow(row));
    }
    return map;
  }

  attachRankings(responses) {
    if (!responses.length) return [];
    const ids = responses.map((response) => response.id);
    const placeholders = ids.map(() => "?").join(", ");
    const rankings = this.db
      .prepare(`
        SELECT response_id AS responseId, item_id AS itemId, rank_key AS rank, sort_order AS sortOrder
        FROM response_items
        WHERE response_id IN (${placeholders})
        ORDER BY sort_order ASC
      `)
      .all(...ids);
    const byResponse = new Map();
    for (const ranking of rankings) {
      if (!byResponse.has(ranking.responseId)) byResponse.set(ranking.responseId, []);
      byResponse.get(ranking.responseId).push({
        itemId: ranking.itemId,
        rank: ranking.rank || "",
        sortOrder: ranking.sortOrder,
      });
    }
    return responses.map((response) => ({
      ...response,
      participantId: response.participantId || "",
      rankings: byResponse.get(response.id) || [],
    }));
  }

  topicExists(topicId) {
    return Boolean(this.db.prepare("SELECT 1 FROM topics WHERE id = ?").get(topicId));
  }

  touchTopic(topicId, timestamp = new Date().toISOString()) {
    this.db.prepare("UPDATE topics SET updated_at = ? WHERE id = ?").run(timestamp, topicId);
  }

  transaction(operation) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}

function topicSelect() {
  return `
    SELECT id, title, visibility, share_password AS sharePassword,
           is_hot AS hot, show_names AS showNames, author, category,
           tiers_json AS tiersJson, created_at AS createdAt, updated_at AS updatedAt
    FROM topics
  `;
}

function itemSelect() {
  return `
    SELECT topic_id AS topicId, id, name, image_path AS imagePath,
           rank_key AS rank, sort_order AS sortOrder,
           created_at AS createdAt, updated_at AS updatedAt
    FROM items
  `;
}

function addUpdate(updates, values, column, value) {
  updates.push(`${column} = ?`);
  values.push(value);
}

function normalizeRankings(rankings, itemIds) {
  if (!Array.isArray(rankings)) return [];
  const seen = new Set();
  return rankings
    .filter((ranking) => {
      const id = String(ranking?.itemId || "");
      if (!itemIds.has(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((ranking, index) => ({
      itemId: String(ranking.itemId),
      rank: normalizeRank(ranking.rank),
      sortOrder: Number.isFinite(Number(ranking.sortOrder)) ? Number(ranking.sortOrder) : index,
    }));
}

function normalizeRank(rank) {
  return ["bang", "top", "elite", "npc", "trash"].includes(rank) ? rank : "";
}

function defaultTiers() {
  return [
    { id: "bang", label: "夯" },
    { id: "top", label: "顶级" },
    { id: "elite", label: "人上人" },
    { id: "npc", label: "NPC" },
    { id: "trash", label: "拉完了" },
  ];
}

function normalizeTiers(tiers) {
  const labels = new Map();
  if (Array.isArray(tiers)) {
    for (const tier of tiers) {
      const id = normalizeRank(tier?.id);
      const label = String(tier?.label || "").trim();
      if (id && label) labels.set(id, label.slice(0, 16));
    }
  }
  return defaultTiers().map((tier) => ({ id: tier.id, label: labels.get(tier.id) || tier.label }));
}

function normalizeTopicRow(row) {
  let tiers = defaultTiers();
  try {
    tiers = normalizeTiers(JSON.parse(row.tiersJson));
  } catch {
    tiers = defaultTiers();
  }
  const { tiersJson, ...topic } = row;
  return {
    ...topic,
    hot: Boolean(topic.hot),
    showNames: topic.showNames !== 0 && topic.showNames !== false,
    sharePassword: normalizeSharePassword(topic.sharePassword),
    category: normalizeCategory(topic.category),
    tiers,
  };
}

function normalizeItemRow(row) {
  return {
    id: row.id,
    name: row.name,
    imagePath: row.imagePath,
    rank: row.rank || "",
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function normalizeCategory(value) {
  const category = String(value || "").trim().slice(0, 24);
  return category || "其他";
}

function normalizeSharePassword(value) {
  return String(value || "").trim().slice(0, 32);
}

module.exports = { SqliteStore };
