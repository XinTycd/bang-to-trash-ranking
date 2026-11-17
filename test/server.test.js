const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const net = require('node:net');

async function startServer(t, admin) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranking-server-'));
  fs.mkdirSync(path.join(dir, 'src', 'storage'), { recursive: true });
  for (const name of ['server.js', 'admin.html', 'admin.js', 'src/storage/index.js', 'src/storage/sqlite-store.js']) {
    fs.copyFileSync(path.join(__dirname, '..', name), path.join(dir, name));
  }
  fs.mkdirSync(path.join(dir, 'public'));
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const child = spawn(process.execPath, [path.join(dir, 'server.js'), ...(admin ? ['--admin'] : [])], {
    env: { ...process.env, PORT: String(port), ADMIN_KEY: 'test-admin-key', NODE_PATH: path.join(__dirname, '..', 'node_modules') },
    stdio: 'ignore',
  });
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill();
      await new Promise((resolve) => child.once('exit', resolve));
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) return base; } catch {}
    if (child.exitCode !== null) throw new Error('Server exited before startup');
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error('Server did not start');
}

test('private topic access and default disabled administration', async (t) => {
  const base = await startServer(t, false);
  const create = await fetch(`${base}/api/topics`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Private', author: 'Test', visibility: 'private', sharePassword: 'secret' }) });
  const { topic } = await create.json();
  const topicUrl = `${base}/api/topics/${topic.id}`;
  assert.equal((await fetch(`${base}/xintycd-admin?key=test-admin-key`)).status, 404);
  assert.equal((await fetch(`${base}/api/categories`, { method: 'PUT', headers: { 'content-type': 'application/json', 'x-admin-key': 'test-admin-key' }, body: '{"categories":[]}' })).status, 403);
  assert.equal((await (await fetch(`${base}/api/topics`)).json()).topics.length, 0);
  assert.equal((await fetch(topicUrl)).status, 403);
  assert.equal((await fetch(`${topicUrl}/responses`)).status, 403);
  assert.equal((await fetch(topicUrl, { method: 'DELETE' })).status, 403);
  assert.equal((await fetch(`${topicUrl}?password=secret`)).status, 200);
  assert.equal((await fetch(`${topicUrl}/responses?password=secret`)).status, 200);
  const form = new FormData();
  form.set('name', 'Image');
  form.set('image', new Blob([new Uint8Array([1, 2, 13, 10])], { type: 'image/png' }), 'test.png');
  const upload = await fetch(`${topicUrl}/items?password=secret`, { method: 'POST', body: form });
  const { item } = await upload.json();
  assert.equal((await fetch(`${base}${item.imagePath}`)).status, 403);
  const image = await fetch(`${base}${item.imagePath}?password=secret`);
  assert.deepEqual([...new Uint8Array(await image.arrayBuffer())], [1, 2, 13, 10]);
});

test('enabled administration requires its key for API access', async (t) => {
  const base = await startServer(t, true);
  assert.equal((await fetch(`${base}/xintycd-admin`)).status, 404);
  assert.equal((await fetch(`${base}/xintycd-admin?key=test-admin-key`)).status, 200);
  const options = { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{"categories":["测试"]}' };
  assert.equal((await fetch(`${base}/api/categories`, options)).status, 403);
  options.headers['x-admin-key'] = 'test-admin-key';
  assert.equal((await fetch(`${base}/api/categories`, options)).status, 200);
});
