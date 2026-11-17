# Doc.A04 — SQLite 单一存储架构

## 决策

应用只使用 `data/ranking.sqlite` 作为业务数据源。`src/storage/sqlite-store.js`
负责 schema 版本、事务和所有数据访问，HTTP 层不直接执行 SQL。

SQLite 使用 WAL、外键约束、5 秒 busy timeout 和 `NORMAL` synchronous 模式。
当前 schema 版本为 `1`，通过 `PRAGMA user_version` 管理。

## 数据表

- `topics`：主题及其可见性、分享口令、档位配置。
- `items`：主题评价项，删除主题时级联删除。
- `responses`：参与者提交的排名结果，删除主题时级联删除。
- `response_items`：结果中的评价项排名，删除结果或评价项时级联删除。

## 兼容性

使用稳定的 `better-sqlite3` 驱动。运行环境要求 Node.js `22.0.0` 或更高版本；
部署时必须通过 lockfile 安装生产依赖。

## 迁移与回滚

旧 JSON 数据可通过 `npm run migrate:json -- <input.json> <output.sqlite>`
一次性导入。导入要求目标 SQLite 文件不存在，失败时会删除不完整目标。

MySQL 数据不会由应用自动迁移。生产切换前应将 MySQL 数据转换为旧 JSON
结构后再导入，或编写经测试的一次性迁移程序。回滚时停止应用并恢复发布前的
代码、配置和数据库备份。
