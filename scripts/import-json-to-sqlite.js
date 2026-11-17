const fs = require("fs");
const path = require("path");
const { SqliteStore } = require("../src/storage/sqlite-store");

const rootDir = path.resolve(__dirname, "..");
const inputPath = path.resolve(process.argv[2] || path.join(rootDir, "data", "db.json"));
const outputPath = path.resolve(process.argv[3] || path.join(rootDir, "data", "ranking.sqlite"));

main().catch((error) => {
  console.error(`JSON to SQLite migration failed: ${error.message}`);
  process.exitCode = 1;
});

async function main() {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file does not exist: ${inputPath}`);
  }
  if (fs.existsSync(outputPath)) {
    throw new Error(`Output database already exists: ${outputPath}`);
  }

  const parsed = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const topics = Array.isArray(parsed?.topics) ? parsed.topics : [];
  const store = new SqliteStore({ rootDir, filePath: outputPath });
  await store.init();

  try {
    importTopics(store, topics);
    const summary = readSummary(store);
    console.log(`Migrated ${summary.topics} topics, ${summary.items} items, ${summary.responses} responses.`);
    console.log(`SQLite database: ${outputPath}`);
  } catch (error) {
    await store.close();
    removeSqliteFiles(outputPath);
    throw error;
  }

  await store.close();
}

function importTopics(store, topics) {
  const insertTopic = store.db.prepare(`
    INSERT INTO topics
      (id, title, visibility, share_password, is_hot, show_names, author, category, tiers_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertItem = store.db.prepare(`
    INSERT INTO items
      (id, topic_id, name, image_path, rank_key, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertResponse = store.db.prepare(`
    INSERT INTO responses (id, topic_id, participant_id, created_at)
    VALUES (?, ?, ?, ?)
  `);
  const insertRanking = store.db.prepare(`
    INSERT INTO response_items (response_id, item_id, rank_key, sort_order)
    VALUES (?, ?, ?, ?)
  `);

  store.transaction(() => {
    for (const rawTopic of topics) {
      const topic = normalizeTopic(rawTopic);
      insertTopic.run(
        topic.id,
        topic.title,
        topic.visibility,
        topic.sharePassword,
        topic.hot ? 1 : 0,
        topic.showNames ? 1 : 0,
        topic.author,
        topic.category,
        JSON.stringify(topic.tiers),
        topic.createdAt,
        topic.updatedAt,
      );

      const itemIds = new Set();
      topic.items.forEach((item, index) => {
        itemIds.add(item.id);
        insertItem.run(
          item.id,
          topic.id,
          item.name,
          item.imagePath,
          normalizeRank(item.rank) || null,
          finiteNumber(item.sortOrder, index),
          item.createdAt,
          item.updatedAt,
        );
      });

      for (const response of topic.responses) {
        insertResponse.run(response.id, topic.id, response.participantId || null, response.createdAt);
        response.rankings.forEach((ranking, index) => {
          if (!itemIds.has(ranking.itemId)) return;
          insertRanking.run(
            response.id,
            ranking.itemId,
            normalizeRank(ranking.rank) || null,
            finiteNumber(ranking.sortOrder, index),
          );
        });
      }
    }
  });
}

function normalizeTopic(topic) {
  const now = new Date().toISOString();
  const items = Array.isArray(topic?.items) ? topic.items : [];
  return {
    id: String(topic?.id || ""),
    title: String(topic?.title || "从夯到拉"),
    visibility: topic?.visibility === "private" ? "private" : "public",
    sharePassword: String(topic?.sharePassword || "").trim().slice(0, 32),
    hot: Boolean(topic?.hot),
    showNames: topic?.showNames !== undefined ? topic.showNames !== false : items.every((item) => item?.showName !== false),
    author: String(topic?.author || "匿名"),
    category: String(topic?.category || "其他").trim().slice(0, 24) || "其他",
    tiers: normalizeTiers(topic?.tiers),
    createdAt: topic?.createdAt || now,
    updatedAt: topic?.updatedAt || now,
    items: items.map((item, index) => ({
      id: String(item?.id || ""),
      name: String(item?.name || "未命名"),
      imagePath: String(item?.imagePath || ""),
      rank: normalizeRank(item?.rank),
      sortOrder: finiteNumber(item?.sortOrder, index),
      createdAt: item?.createdAt || now,
      updatedAt: item?.updatedAt || now,
    })),
    responses: (Array.isArray(topic?.responses) ? topic.responses : []).map((response) => ({
      id: String(response?.id || ""),
      participantId: String(response?.participantId || ""),
      createdAt: response?.createdAt || now,
      rankings: (Array.isArray(response?.rankings) ? response.rankings : []).map((ranking, index) => ({
        itemId: String(ranking?.itemId || ""),
        rank: normalizeRank(ranking?.rank),
        sortOrder: finiteNumber(ranking?.sortOrder, index),
      })),
    })),
  };
}

function normalizeTiers(tiers) {
  const defaults = [
    { id: "bang", label: "夯" },
    { id: "top", label: "顶级" },
    { id: "elite", label: "人上人" },
    { id: "npc", label: "NPC" },
    { id: "trash", label: "拉完了" },
  ];
  const labels = new Map(
    (Array.isArray(tiers) ? tiers : [])
      .map((tier) => [normalizeRank(tier?.id), String(tier?.label || "").trim().slice(0, 16)])
      .filter(([id, label]) => id && label),
  );
  return defaults.map((tier) => ({ ...tier, label: labels.get(tier.id) || tier.label }));
}

function normalizeRank(rank) {
  return ["bang", "top", "elite", "npc", "trash"].includes(rank) ? rank : "";
}

function finiteNumber(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function readSummary(store) {
  return {
    topics: Number(store.db.prepare("SELECT COUNT(*) AS count FROM topics").get().count),
    items: Number(store.db.prepare("SELECT COUNT(*) AS count FROM items").get().count),
    responses: Number(store.db.prepare("SELECT COUNT(*) AS count FROM responses").get().count),
  };
}

function removeSqliteFiles(filePath) {
  for (const suffix of ["", "-shm", "-wal"]) {
    try {
      fs.rmSync(`${filePath}${suffix}`, { force: true });
    } catch {
      // Preserve the original migration error if cleanup fails.
    }
  }
}
