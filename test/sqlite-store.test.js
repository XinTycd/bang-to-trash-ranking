const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { SqliteStore } = require("../src/storage/sqlite-store");

async function createTestStore(t) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "bang-ranking-"));
  const store = new SqliteStore({ rootDir });
  await store.init();
  t.after(async () => {
    await store.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  });
  return store;
}

test("initializes the SQLite schema", async (t) => {
  const store = await createTestStore(t);
  const tables = store.db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((row) => row.name);

  assert.deepEqual(tables, ["items", "response_items", "responses", "topics"]);
  assert.equal(store.db.prepare("PRAGMA user_version").get().user_version, 1);
});

test("persists topics, items, ordering and responses", async (t) => {
  const store = await createTestStore(t);
  await store.createTopic({
    id: "TOPIC1",
    title: "测试主题",
    visibility: "public",
    author: "测试者",
    category: "游戏",
  });
  await store.createItem("TOPIC1", { id: "ITEM1", name: "项目一", imagePath: "/img/1.jpg" });
  await store.createItem("TOPIC1", { id: "ITEM2", name: "项目二", imagePath: "/img/2.jpg" });

  const ordered = await store.updateItemsOrder("TOPIC1", [
    { id: "ITEM2", rank: "top", sortOrder: 0 },
    { id: "ITEM1", rank: "bang", sortOrder: 1 },
  ]);
  assert.deepEqual(
    ordered.items.map(({ id, rank, sortOrder }) => ({ id, rank, sortOrder })),
    [
      { id: "ITEM2", rank: "top", sortOrder: 0 },
      { id: "ITEM1", rank: "bang", sortOrder: 1 },
    ],
  );

  const response = await store.createResponse("TOPIC1", {
    id: "RESPONSE1",
    participantId: "visitor",
    rankings: [
      { itemId: "ITEM1", rank: "elite", sortOrder: 0 },
      { itemId: "UNKNOWN", rank: "trash", sortOrder: 1 },
    ],
  });
  assert.equal(response.rankings.length, 1);
  assert.deepEqual(await store.getResponse("TOPIC1", "RESPONSE1"), response);

  await store.close();
  await store.init();
  const persisted = await store.getTopic("TOPIC1");
  assert.equal(persisted.title, "测试主题");
  assert.equal((await store.listResponses("TOPIC1")).length, 1);
});

test("uses transactions and cascades deletes", async (t) => {
  const store = await createTestStore(t);
  await store.createTopic({
    id: "TOPIC2",
    title: "待删除主题",
    visibility: "private",
    sharePassword: "1234",
    author: "测试者",
  });
  await store.createItem("TOPIC2", { id: "ITEM3", name: "项目三", imagePath: "" });
  await store.createResponse("TOPIC2", {
    id: "RESPONSE2",
    rankings: [{ itemId: "ITEM3", rank: "npc", sortOrder: 0 }],
  });

  assert.equal(await store.deleteTopic("TOPIC2"), true);
  assert.equal(store.db.prepare("SELECT COUNT(*) AS count FROM items").get().count, 0);
  assert.equal(store.db.prepare("SELECT COUNT(*) AS count FROM responses").get().count, 0);
  assert.equal(store.db.prepare("SELECT COUNT(*) AS count FROM response_items").get().count, 0);
});
