const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const net = require("net");
const { URL } = require("url");
const { createStore } = require("./src/storage");

const rootDir = __dirname;
const config = loadConfig(rootDir);
const port = Number(process.env.PORT || config.server.port || 5980);
const adminEnabled = process.argv.includes("--admin");
const trustProxy = Boolean(config.server.trustProxy);
const dataRoot = path.join(rootDir, "data");
const publicRoot = path.join(rootDir, "public");
const imgRoot = path.join(publicRoot, "img");
const categoryConfigPath = path.join(dataRoot, "categories.json");
const store = createStore({ rootDir });
const adminPath = normalizeAdminPath(config.admin.path || "/xintycd-admin");
const adminAssetPath = normalizeAdminPath(config.admin.assetPath || `${adminPath}.js`);
const adminKey = String(process.env.ADMIN_KEY || config.admin.key || "");
if (adminEnabled && !adminKey) {
  console.error("Admin mode requires a non-empty ADMIN_KEY or admin.key in config.json.");
  process.exit(1);
}
const adminAllowedIps = normalizeIpAllowlist(config.admin.allowedIps);
const defaultTopicCategories = ["综合", "娱乐", "吃喝", "游戏", "校园", "生活", "二次元", "影视", "音乐", "科技", "其他"];

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

fs.mkdirSync(dataRoot, { recursive: true });
fs.mkdirSync(publicRoot, { recursive: true });
fs.mkdirSync(imgRoot, { recursive: true });

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    await serveStatic(req, res, url);
  } catch (error) {
    if (error instanceof SyntaxError || error.statusCode) {
      if (!res.headersSent) sendJson(res, error.statusCode || 400, { error: "INVALID_REQUEST", message: "请求格式错误或内容过大" });
      return;
    }
    console.error(error);
    if (!res.headersSent) sendJson(res, 500, { error: "SERVER_ERROR", message: "服务器内部错误" });
  }
});

store
  .init()
  .then(() => {
    server.listen(port, () => {
      console.log(`Bang-to-trash ranking running at http://localhost:${port}`);
      console.log(`Storage mode: ${store.mode}`);
      console.log(`SQLite database: ${store.filePath}`);
      if (adminEnabled) console.log(`Admin path: ${adminPath}?key=***`);
      if (adminAllowedIps.length) {
        console.log(`Admin allowed IPs: ${adminAllowedIps.join(", ")}`);
      }
    });
  })
  .catch((error) => {
    console.error("Failed to initialize storage:", error);
    process.exit(1);
  });

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

function shutdown(signal) {
  console.log(`Received ${signal}, shutting down...`);
  const forceExitTimer = setTimeout(() => process.exit(1), 10_000);
  forceExitTimer.unref();
  server.close(async (error) => {
    try {
      await store.close();
    } catch (closeError) {
      console.error("Failed to close SQLite storage:", closeError);
      process.exitCode = 1;
    }
    if (error) {
      console.error("Failed to close HTTP server:", error);
      process.exitCode = 1;
    }
    clearTimeout(forceExitTimer);
    process.exit();
  });
}

async function handleApi(req, res, url) {
  const method = req.method || "GET";
  const parts = url.pathname.split("/").filter(Boolean);

  if (method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, mode: store.mode });
    return;
  }

  if (method === "GET" && url.pathname === "/api/topics") {
    const topics = await store.listTopics();
    sendJson(res, 200, { topics: topics.filter((topic) => topic.visibility === "public" || isAdminApiRequest(req)).map(publicTopicPayload) });
    return;
  }

  if (method === "GET" && url.pathname === "/api/categories") {
    const topics = await store.listTopics();
    const configuredCategories = await readTopicCategories();
    const categories = uniqueCategories([...configuredCategories, ...topics.filter((topic) => topic.visibility === "public" || isAdminApiRequest(req)).map((topic) => topic.category)]);
    sendJson(res, 200, { categories });
    return;
  }

  if (method === "PUT" && url.pathname === "/api/categories") {
    if (!isAdminApiRequest(req)) { sendJson(res, 403, { error: "FORBIDDEN", message: "需要后台权限" }); return; }
    const body = await readJson(req);
    if (!Array.isArray(body.categories)) {
      sendJson(res, 400, { error: "CATEGORIES_REQUIRED", message: "缺少标签列表" });
      return;
    }
    const categories = normalizeCategoryList(body.categories);
    await writeTopicCategories(categories);
    sendJson(res, 200, { categories });
    return;
  }

  if (method === "POST" && url.pathname === "/api/topics") {
    const body = await readJson(req);
    const title = String(body.title || "").trim();
    const author = String(body.author || "").trim();
    if (!title) {
      sendJson(res, 400, { error: "TITLE_REQUIRED", message: "主题标题不能为空" });
      return;
    }
    if (!author) {
      sendJson(res, 400, { error: "AUTHOR_REQUIRED", message: "作者名称不能为空" });
      return;
    }

    const topic = await store.createTopic({
      id: await createUniqueTopicId(),
      title: title.slice(0, 36),
      visibility: body.visibility === "private" ? "private" : "public",
      sharePassword: normalizeSharePassword(body.sharePassword),
      hot: Boolean(body.hot),
      showNames: body.showNames !== false,
      author: author.slice(0, 24),
      category: normalizeCategory(body.category),
    });
    if (topic.visibility === "private" && !topic.sharePassword) {
      await store.deleteTopic(topic.id);
      sendJson(res, 400, { error: "SHARE_PASSWORD_REQUIRED", message: "私有主题需要设置分享密码" });
      return;
    }
    fs.mkdirSync(path.join(imgRoot, topic.id), { recursive: true });
    sendJson(res, 201, { topic: publicTopicPayload(topic) });
    return;
  }

  if (parts[0] === "api" && parts[1] === "topics" && parts[2]) {
    const topicId = parts[2];
    const accessTopic = await store.getTopic(topicId);
    if (accessTopic && !isAdminApiRequest(req) && !allowTopicAccess(res, accessTopic, url)) return;

    if (method === "GET" && parts.length === 3) {
      const topic = await store.getTopic(topicId);
      if (!topic) {
        sendJson(res, 404, { error: "TOPIC_NOT_FOUND", message: "主题不存在" });
        return;
      }
      sendJson(res, 200, { topic: publicTopicPayload(topic) });
      return;
    }

    if (method === "PATCH" && parts.length === 3) {
      const body = await readJson(req);
      const existing = await store.getTopic(topicId);
      if (!existing) {
        sendJson(res, 404, { error: "TOPIC_NOT_FOUND", message: "主题不存在" });
        return;
      }
      const nextVisibility = body.visibility === "private" ? "private" : body.visibility === "public" ? "public" : existing.visibility;
      const nextSharePassword =
        typeof body.sharePassword === "string" ? normalizeSharePassword(body.sharePassword) : existing.sharePassword || "";
      if (nextVisibility === "private" && !nextSharePassword) {
        sendJson(res, 400, { error: "SHARE_PASSWORD_REQUIRED", message: "私有主题需要设置分享密码" });
        return;
      }
      const topic = await store.updateTopic(topicId, {
        title: typeof body.title === "string" ? body.title.trim().slice(0, 36) : undefined,
        author: typeof body.author === "string" ? body.author.trim().slice(0, 24) : undefined,
        category: typeof body.category === "string" ? normalizeCategory(body.category) : undefined,
        visibility: body.visibility === "private" ? "private" : body.visibility === "public" ? "public" : undefined,
        sharePassword: typeof body.sharePassword === "string" ? normalizeSharePassword(body.sharePassword) : undefined,
        hot: typeof body.hot === "boolean" ? body.hot : undefined,
        showNames: typeof body.showNames === "boolean" ? body.showNames : undefined,
      });
      sendJson(res, 200, { topic: publicTopicPayload(topic) });
      return;
    }

    if (method === "DELETE" && parts.length === 3) {
      const deleted = await store.deleteTopic(topicId);
      if (!deleted) {
        sendJson(res, 404, { error: "TOPIC_NOT_FOUND", message: "主题不存在" });
        return;
      }
      fs.rmSync(path.join(imgRoot, topicId), { recursive: true, force: true });
      sendJson(res, 200, { ok: true });
      return;
    }

    if (method === "POST" && parts[3] === "forks" && parts.length === 4) {
      const sourceTopic = await store.getTopic(topicId);
      if (!sourceTopic) {
        sendJson(res, 404, { error: "TOPIC_NOT_FOUND", message: "主题不存在" });
        return;
      }

      const body = await readJson(req);
      const forkTitle = String(body.title || `${sourceTopic.title} 分支`).trim().slice(0, 36);
      const forkAuthor = String(body.author || sourceTopic.author || "匿名").trim().slice(0, 24);
      if (!forkTitle) {
        sendJson(res, 400, { error: "TITLE_REQUIRED", message: "分支标题不能为空" });
        return;
      }

      const forkTopic = await store.createTopic({
        id: await createUniqueTopicId(),
        title: forkTitle,
        visibility: body.visibility === "private" ? "private" : "public",
        sharePassword: normalizeSharePassword(body.sharePassword),
        hot: Boolean(body.hot),
        showNames: sourceTopic.showNames !== false,
        author: forkAuthor || "匿名",
        category: normalizeCategory(body.category || sourceTopic.category),
      });
      if (forkTopic.visibility === "private" && !forkTopic.sharePassword) {
        await store.deleteTopic(forkTopic.id);
        sendJson(res, 400, { error: "SHARE_PASSWORD_REQUIRED", message: "私有主题需要设置分享密码" });
        return;
      }
      await store.updateTiers(forkTopic.id, sourceTopic.tiers);
      fs.mkdirSync(path.join(imgRoot, forkTopic.id), { recursive: true });

      for (const sourceItem of sourceTopic.items) {
        const forkItemId = createItemId();
        const imagePath = copyImageForFork(sourceItem.imagePath, topicId, forkTopic.id, forkItemId);
        await store.createItem(forkTopic.id, {
          id: forkItemId,
          name: sourceItem.name,
          imagePath,
          rank: "",
        });
      }

      const topic = await store.getTopic(forkTopic.id);
      sendJson(res, 201, { topic: publicTopicPayload(topic) });
      return;
    }

    if (method === "PUT" && parts[3] === "tiers" && parts.length === 4) {
      const body = await readJson(req);
      if (!Array.isArray(body.tiers)) {
        sendJson(res, 400, { error: "TIERS_REQUIRED", message: "缺少行名数据" });
        return;
      }
      const topic = await store.updateTiers(topicId, body.tiers);
      if (!topic) {
        sendJson(res, 404, { error: "TOPIC_NOT_FOUND", message: "主题不存在" });
        return;
      }
      sendJson(res, 200, { topic: publicTopicPayload(topic) });
      return;
    }

    if (method === "POST" && parts[3] === "items" && parts.length === 4) {
      const topic = await store.getTopic(topicId);
      if (!topic) {
        sendJson(res, 404, { error: "TOPIC_NOT_FOUND", message: "主题不存在" });
        return;
      }

      const multipart = await readMultipart(req);
      const name = String(multipart.fields.name || "").trim();
      if (!name) {
        sendJson(res, 400, { error: "ITEM_NAME_REQUIRED", message: "评价项名称不能为空" });
        return;
      }

      const itemId = createItemId();
      let imagePath = "";
      if (multipart.files.image?.buffer?.length) {
        const ext = extensionFromFile(multipart.files.image);
        const dir = path.join(imgRoot, topicId);
        fs.mkdirSync(dir, { recursive: true });
        const filename = `${itemId}${ext}`;
        fs.writeFileSync(path.join(dir, filename), multipart.files.image.buffer);
        imagePath = `/img/${topicId}/${filename}`;
      }

      const item = await store.createItem(topicId, {
        id: itemId,
        name: name.slice(0, 24),
        imagePath,
        rank: "",
      });
      sendJson(res, 201, { item });
      return;
    }

    if (method === "PUT" && parts[3] === "items" && parts[4] === "order" && parts.length === 5) {
      const body = await readJson(req);
      if (!Array.isArray(body.items)) {
        sendJson(res, 400, { error: "ITEMS_REQUIRED", message: "缺少排序数据" });
        return;
      }
      const topic = await store.updateItemsOrder(topicId, body.items);
      if (!topic) {
        sendJson(res, 404, { error: "TOPIC_NOT_FOUND", message: "主题不存在" });
        return;
      }
      sendJson(res, 200, { topic: publicTopicPayload(topic) });
      return;
    }

    if (method === "POST" && parts[3] === "responses" && parts.length === 4) {
      const body = await readJson(req);
      if (!Array.isArray(body.rankings)) {
        sendJson(res, 400, { error: "RANKINGS_REQUIRED", message: "缺少个人排名数据" });
        return;
      }
      const response = await store.createResponse(topicId, {
        id: createResponseId(),
        participantId: String(body.participantId || "").slice(0, 64),
        rankings: body.rankings,
      });
      if (!response) {
        sendJson(res, 404, { error: "TOPIC_NOT_FOUND", message: "主题不存在" });
        return;
      }
      sendJson(res, 201, { response });
      return;
    }

    if (method === "GET" && parts[3] === "responses" && parts.length === 4) {
      const responses = await store.listResponses(topicId);
      if (!responses) {
        sendJson(res, 404, { error: "TOPIC_NOT_FOUND", message: "主题不存在" });
        return;
      }
      sendJson(res, 200, { responses });
      return;
    }

    if (method === "GET" && parts[3] === "responses" && parts[4] && parts.length === 5) {
      const response = await store.getResponse(topicId, parts[4]);
      if (!response) {
        sendJson(res, 404, { error: "RESPONSE_NOT_FOUND", message: "结果不存在" });
        return;
      }
      sendJson(res, 200, { response });
      return;
    }

    if (method === "PATCH" && parts[3] === "items" && parts[4] && parts.length === 5) {
      const body = await readJson(req);
      const item = await store.updateItem(topicId, parts[4], {
        name: typeof body.name === "string" ? body.name.trim().slice(0, 24) : undefined,
        rank: typeof body.rank === "string" ? body.rank : undefined,
      });
      if (!item) {
        sendJson(res, 404, { error: "ITEM_NOT_FOUND", message: "评价项不存在" });
        return;
      }
      sendJson(res, 200, { item });
      return;
    }

    if (method === "DELETE" && parts[3] === "items" && parts[4] && parts.length === 5) {
      const removed = await store.deleteItem(topicId, parts[4]);
      if (!removed) {
        sendJson(res, 404, { error: "ITEM_NOT_FOUND", message: "评价项不存在" });
        return;
      }
      if (removed.imagePath?.startsWith("/img/")) {
        fs.rmSync(path.join(publicRoot, removed.imagePath.replace(/^\/+/, "")), { force: true });
      }
      sendJson(res, 200, { ok: true });
      return;
    }
  }

  sendJson(res, 404, { error: "NOT_FOUND", message: "接口不存在" });
}

async function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";

  if (adminEnabled && pathname === adminPath) {
    if (!isAdminIpAllowed(req)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    if (!isAdminRequest(url)) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }
    await serveAdminPage(res);
    return;
  }
  if (pathname === "/admin.html" || pathname === "/admin.js") {
    res.writeHead(404);
    res.end("Not Found");
    return;
  }
  if (adminEnabled && pathname === adminAssetPath) {
    if (!isAdminIpAllowed(req)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    await serveAdminScript(res);
    return;
  }

  const imageMatch = pathname.match(/^\/img\/([A-F0-9]{10})\//);
  if (imageMatch) {
    const topic = await store.getTopic(imageMatch[1]);
    if (!topic) { res.writeHead(404); res.end("Not Found"); return; }
    if (!isAdminApiRequest(req) && !(isAdminIpAllowed(req) && isAdminRequest(url)) && !allowTopicAccess(res, topic, url)) return;
  }

  const relativePath = pathname.replace(/^\/+/, "");
  const filePath = path.normalize(path.join(publicRoot, relativePath));
  if (!filePath.startsWith(publicRoot + path.sep)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile()) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    fs.createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404);
    res.end("Not Found");
  }
}

async function serveAdminPage(res) {
  try {
    const content = await fs.promises.readFile(path.join(rootDir, "admin.html"), "utf8");
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(
      content
        .replaceAll("__ADMIN_PAGE_HREF__", createAdminPageHref())
        .replaceAll("__ADMIN_ASSET_PATH__", adminAssetPath),
    );
  } catch {
    res.writeHead(404);
    res.end("Not Found");
  }
}

async function serveAdminScript(res) {
  try {
    const filePath = path.join(rootDir, "admin.js");
    res.writeHead(200, {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
    });
    fs.createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404);
    res.end("Not Found");
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function readJson(req) {
  return readBody(req).then((buffer) => {
    if (!buffer.length) return {};
    return JSON.parse(buffer.toString("utf8"));
  });
}

function readBody(req, maxBytes = 20 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        const error = new Error("Request body too large");
        error.statusCode = 413;
        reject(error);
        req.removeAllListeners("data");
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readMultipart(req) {
  const contentType = req.headers["content-type"] || "";
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!match) return { fields: {}, files: {} };

  const boundary = match[1] || match[2];
  const buffer = await readBody(req);
  return parseMultipart(buffer, boundary);
}

function parseMultipart(buffer, boundary) {
  const delimiter = Buffer.from(`--${boundary}`);
  const chunks = splitBuffer(buffer, delimiter);
  const fields = {};
  const files = {};

  for (const chunk of chunks) {
    let part = trimBoundaryPadding(chunk);
    if (!part.length || part.equals(Buffer.from("--"))) continue;

    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd < 0) continue;

    const headerText = part.slice(0, headerEnd).toString("latin1");
    let content = part.slice(headerEnd + 4);

    const disposition = headerText.match(/content-disposition:\s*form-data;([^\r\n]+)/i);
    if (!disposition) continue;

    const name = getDispositionValue(disposition[1], "name");
    const filename = getDispositionValue(disposition[1], "filename");
    const type = headerText.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim() || "";
    if (!name) continue;

    if (filename) {
      files[name] = { filename, type, buffer: content };
    } else {
      fields[name] = content.toString("utf8");
    }
  }

  return { fields, files };
}

function splitBuffer(buffer, delimiter) {
  const parts = [];
  let start = 0;
  let index = buffer.indexOf(delimiter, start);
  while (index !== -1) {
    parts.push(buffer.slice(start, index));
    start = index + delimiter.length;
    index = buffer.indexOf(delimiter, start);
  }
  parts.push(buffer.slice(start));
  return parts;
}

function trimBoundaryPadding(buffer) {
  let start = 0;
  let end = buffer.length;
  while (buffer[start] === 13 || buffer[start] === 10) start += 1;
  // Strip only the multipart framing CRLF, never bytes from the uploaded file.
  if (end >= 2 && buffer[end - 2] === 13 && buffer[end - 1] === 10) end -= 2;
  return buffer.slice(start, end);
}

function getDispositionValue(value, key) {
  const quoted = value.match(new RegExp(`${key}="([^"]*)"`));
  if (quoted) return quoted[1];
  const unquoted = value.match(new RegExp(`${key}=([^;\\s]+)`));
  return unquoted ? unquoted[1] : "";
}

function extensionFromFile(file) {
  const byType = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
  };
  if (byType[file.type]) return byType[file.type];
  const ext = path.extname(file.filename || "").toLowerCase();
  return [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext) ? ext : ".jpg";
}

async function createUniqueTopicId() {
  for (let i = 0; i < 20; i += 1) {
    const id = crypto.randomBytes(5).toString("hex").toUpperCase();
    if (!(await store.getTopic(id))) return id;
  }
  throw new Error("Failed to create unique topic id");
}

function createItemId() {
  return crypto.randomBytes(6).toString("hex").toUpperCase();
}

function createResponseId() {
  return crypto.randomBytes(7).toString("hex").toUpperCase();
}

function copyImageForFork(sourceImagePath, sourceTopicId, forkTopicId, forkItemId) {
  if (!sourceImagePath || !sourceImagePath.startsWith(`/img/${sourceTopicId}/`)) return "";

  const relativeSource = sourceImagePath.replace(/^\/+/, "");
  const sourcePath = path.normalize(path.join(publicRoot, relativeSource));
  const imageRoot = path.normalize(path.join(publicRoot, "img"));
  if (!sourcePath.startsWith(imageRoot) || !fs.existsSync(sourcePath)) return "";

  const ext = path.extname(sourcePath) || ".jpg";
  const forkDir = path.join(imgRoot, forkTopicId);
  fs.mkdirSync(forkDir, { recursive: true });
  const filename = `${forkItemId}${ext}`;
  fs.copyFileSync(sourcePath, path.join(forkDir, filename));
  return `/img/${forkTopicId}/${filename}`;
}

function normalizeAdminPath(value) {
  const cleaned = String(value || "").trim();
  if (!cleaned || cleaned === "/") return "/xintycd-admin";
  return cleaned.startsWith("/") ? cleaned : `/${cleaned}`;
}

function isAdminRequest(url) {
  return adminEnabled && Boolean(adminKey) && url.searchParams.get("key") === adminKey;
}

function isAdminApiRequest(req) {
  return adminEnabled && isAdminIpAllowed(req) && Boolean(adminKey) && req.headers["x-admin-key"] === adminKey;
}

function createAdminPageHref() {
  return adminKey ? `${adminPath}?key=${encodeURIComponent(adminKey)}` : adminPath;
}

function normalizeCategory(value) {
  const category = String(value || "").trim().slice(0, 24);
  return category || "其他";
}

function normalizeCategoryList(values) {
  const categories = uniqueCategories(Array.isArray(values) ? values : []);
  if (!categories.includes("其他")) categories.push("其他");
  return categories.length ? categories : [...defaultTopicCategories];
}

function uniqueCategories(values) {
  const seen = new Set();
  const categories = [];
  for (const value of values) {
    const category = normalizeCategory(value);
    if (seen.has(category)) continue;
    seen.add(category);
    categories.push(category);
  }
  return categories.length ? categories : [...defaultTopicCategories];
}

async function readTopicCategories() {
  try {
    const raw = await fs.promises.readFile(categoryConfigPath, "utf8");
    const parsed = JSON.parse(raw);
    return normalizeCategoryList(Array.isArray(parsed) ? parsed : parsed.categories);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`Failed to read categories.json: ${error.message}`);
    }
    return [...defaultTopicCategories];
  }
}

async function writeTopicCategories(categories) {
  await fs.promises.mkdir(dataRoot, { recursive: true });
  await fs.promises.writeFile(categoryConfigPath, `${JSON.stringify({ categories }, null, 2)}\n`, "utf8");
}

function normalizeSharePassword(value) {
  return String(value || "").trim().slice(0, 32);
}

function allowTopicAccess(res, topic, url) {
  if (topic.visibility !== "private" || !topic.sharePassword) return true;
  const password = normalizeSharePassword(url.searchParams.get("password"));
  if (!password) {
    sendJson(res, 403, { error: "PASSWORD_REQUIRED", message: "请输入分享密码" });
    return false;
  }
  if (password !== topic.sharePassword) {
    sendJson(res, 403, { error: "INVALID_PASSWORD", message: "分享密码错误" });
    return false;
  }
  return true;
}

function publicTopicPayload(topic) {
  if (!topic) return topic;
  const { sharePassword, ...payload } = topic;
  return {
    ...payload,
    hasSharePassword: Boolean(sharePassword),
  };
}

function loadConfig(baseDir) {
  const defaults = {
    server: { port: 5980, trustProxy: false },
    admin: {
      path: "/xintycd-admin",
      assetPath: "/xintycd-admin.js",
      key: "",
      allowedIps: [],
    },
  };

  try {
    const raw = fs.readFileSync(path.join(baseDir, "config.json"), "utf8");
    const parsed = JSON.parse(raw);
    return {
      server: { ...defaults.server, ...(parsed.server || {}) },
      admin: { ...defaults.admin, ...(parsed.admin || {}) },
    };
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`Failed to read config.json: ${error.message}`);
    }
    return defaults;
  }
}

function normalizeIpAllowlist(value) {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return source.map((entry) => normalizeIp(entry)).filter(Boolean);
}

function isAdminIpAllowed(req) {
  if (!adminAllowedIps.length) return true;
  const clientIp = getClientIp(req);
  return adminAllowedIps.includes(clientIp);
}

function getClientIp(req) {
  if (trustProxy) {
    const forwardedFor = req.headers["x-forwarded-for"];
    const forwardedIp = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    const realIp = Array.isArray(req.headers["x-real-ip"]) ? req.headers["x-real-ip"][0] : req.headers["x-real-ip"];
    const proxyIp = String(forwardedIp || realIp || "").split(",")[0].trim();
    const normalizedProxyIp = normalizeIp(proxyIp);
    if (normalizedProxyIp) return normalizedProxyIp;
  }
  return normalizeIp(req.socket.remoteAddress || "");
}

function normalizeIp(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw === "localhost") return "127.0.0.1";

  let ip = raw;
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  const zoneIndex = ip.indexOf("%");
  if (zoneIndex !== -1) ip = ip.slice(0, zoneIndex);

  return net.isIP(ip) ? ip : "";
}
