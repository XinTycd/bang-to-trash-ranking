# 从夯到拉锐评排行榜

基于 Node.js 和 SQLite 的主题分档排行系统，支持创建主题、上传图片、分享排名和创建分支。

## 启动

需要 Node.js 22 或更高版本，以及对项目目录的写入权限。

```bash
npm ci
npm start
```

打开 http://localhost:5980/。首次运行自动创建空数据库 `data/ranking.sqlite`，上传图片存于 `public/img/主题ID/`。健康检查为 `GET /api/health`。

## 可选后台

默认启动不提供后台。复制 `config.example.json` 为 `config.json`，设置非空 `admin.key`，然后运行 `npm run start:admin`。也可以通过环境变量 `ADMIN_KEY` 提供密钥（优先于配置文件）。访问 `http://localhost:5980/xintycd-admin?key=你的密钥`。

后台与前台使用同一端口和数据库；两种启动方式择一使用。`admin.allowedIps` 可限制后台客户端 IP，仅在可信代理覆盖转发头时启用 `server.trustProxy`。密钥出现在访问地址中，部署时应使用 HTTPS 并保护访问日志。

## 访问权限

私有主题及其结果、图片需要分享密码；知道密码的人可以查看和修改该主题。公开主题目前没有账户或所有权认证，任何知道主题编号的人都可修改或删除主题及评价项。浏览器中的创建记录仅用于界面显示，不能作为安全保障。公开部署前应根据使用场景增加身份认证或其他访问控制。

## 数据与发布

`data/`、上传图片、`config.json`、压缩包及数据库备份均被 `.gitignore` 排除。`public/img/web/logo.svg` 是界面素材，不是用户上传图片。不要将实际密钥写入示例配置。发布前应检查暂存区及历史记录，尤其是曾手动强制添加的文件。仓库应从无业务数据的初始提交开始。

迁移旧 JSON 数据时，目标 SQLite 文件必须不存在：

```bash
npm run migrate:json -- /path/to/db.json /path/to/ranking.sqlite
```

数据库备份与恢复见 [部署说明](docs/Doc.F02-sqlite-deployment.md)。运行 `npm test` 执行测试。

许可证：MIT。
