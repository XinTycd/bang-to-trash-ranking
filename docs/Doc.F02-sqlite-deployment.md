# Doc.F02 — SQLite 部署与备份 Runbook

## 发布前

1. 备份现有代码、配置、图片目录和数据库。
2. 若生产数据仍在 MySQL，先在旁路环境完成数据导出、SQLite 导入和数量校验。
3. 确认服务器 Node.js 版本不低于 `22.0.0`。
4. 确认运行用户可读写项目的 `data/` 目录。

## 安装与启动

```bash
cd /www/wwwroot/bang-to-trash-ranking
npm ci --omit=dev
npm start
```

首次启动会自动创建 `data/ranking.sqlite` 和 schema。健康检查应返回：

```json
{"ok":true,"mode":"sqlite"}
```

## 一致性检查

停止写入后执行：

```bash
sqlite3 data/ranking.sqlite "PRAGMA integrity_check;"
```

预期输出为 `ok`。

## 备份

优先使用 SQLite 在线备份命令：

```bash
sqlite3 data/ranking.sqlite ".backup 'data/backup/ranking-YYYYMMDD-HHMMSS.sqlite'"
```

不要在应用运行且 WAL 中仍有写入时只复制主 `.sqlite` 文件。恢复时先停止应用，
保留故障现场文件，再用已验证备份替换数据库并完成健康检查。
