# 从夯到拉锐评排行榜（Bang-to-trash-ranking）

一个基于 Node.js 和 SQLite 的开源分档排行系统。创建一个主题，添加需要评价的内容，将它们拖入不同档位，再通过主题编号或链接邀请其他人参与排名。

项目使用原生 HTML、CSS 和 JavaScript 构建前端，后端负责接口、静态资源和本地持久化。无需单独部署数据库服务，即可在本机启动。

## 项目信息

- 作者：`XinTycd`
- 项目地址：[XinTycd/bang-to-trash-ranking](https://github.com/XinTycd/bang-to-trash-ranking)
- 开源协议：[MIT License](LICENSE)

## 项目特性

- **主题管理**：创建公开或私有主题，设置标题、作者和分类。
- **分档排名**：默认提供「夯、顶级、人上人、NPC、拉完了」五个档位，支持自定义档位名称和拖拽排序。
- **评价项管理**：添加名称和图片，支持选择或拖拽图片上传，并可编辑、删除评价项。
- **参与与分享**：通过主题编号或链接进入主题，提交个人排名并查看与创建者的结果对比。
- **主题分支**：复制已有主题的档位、评价项和图片，基于相同内容重新排名。
- **历史记录**：在当前浏览器查看创建过的主题和参与过的结果。
- **可选后台**：按需启用后台，管理主题、评价项、分类和参与结果。
- **本地存储**：主题、评价项和排名结果保存在 SQLite，图片保存在本地目录。

## 适用场景

- 游戏、影视、音乐、美食等主题的分档讨论。
- 社群活动中的个人喜好排名和结果对比。
- 课程、团队或朋友之间的评价排序与分享。
- 以 Node.js 和 SQLite 为基础的个人项目学习与二次开发。

## 技术架构

```text
浏览器
  ├─ 前台页面：主题、评价项、排名与结果
  └─ 可选后台：主题与分类管理
          │
          │ HTTP / JSON / multipart
          ▼
Node.js HTTP 服务（server.js）
  ├─ 静态页面与图片
  ├─ 主题、评价项和排名 API
  ├─ 可选后台入口与访问控制
  └─ SQLite 存储层
          ├─ data/ranking.sqlite    主题、评价项和排名结果
          ├─ data/categories.json   自定义分类（运行时生成）
          └─ public/img/<主题ID>/   上传图片
```

### 技术栈

| 部分 | 技术 |
| --- | --- |
| 前端 | HTML5、CSS3、原生 JavaScript |
| 后端 | Node.js 原生 HTTP 服务 |
| 数据库 | SQLite，通过 `better-sqlite3` 访问 |
| 测试 | Node.js 内置测试运行器 |

## 目录结构

```text
.
├─ public/                    前台页面、样式、脚本和界面 Logo
├─ src/storage/               SQLite 存储实现
├─ scripts/                   旧数据导入及 Windows 重启脚本
├─ test/                      服务接口与存储测试
├─ docs/                      存储架构、部署与备份说明
├─ admin.html                 后台页面
├─ admin.js                   后台交互逻辑
├─ config.example.json        配置示例
├─ server.js                  HTTP 服务入口
├─ package.json               依赖与运行命令
└─ LICENSE                    MIT 开源协议
```

`data/`、上传图片和实际配置文件不会随仓库分发，首次运行或使用相应功能时会在本地生成。

## 环境要求

- Node.js `22.0.0` 或更高版本，以及 npm。
- 对项目目录具有写入权限，以便创建 `data/` 和保存上传图片。
- 不需要另行安装或启动 MySQL、PostgreSQL 等数据库服务。

## 快速启动

```bash
git clone https://github.com/XinTycd/bang-to-trash-ranking.git
cd bang-to-trash-ranking
npm ci
npm start
```

打开 <http://localhost:5980/>。首次启动时，应用会创建空的 SQLite 数据库及数据表；仓库不包含已有主题、排名结果或用户上传图片。

健康检查：

```bash
curl http://localhost:5980/api/health
```

正常响应：

```json
{"ok":true,"mode":"sqlite"}
```

使用 `Ctrl+C` 停止服务。Windows 用户也可以运行 `npm run restart`，通过 PowerShell 脚本重启项目服务。

## 基本使用

1. 在首页填写主题标题、作者和分类，选择公开或私有后创建主题。私有主题必须设置分享密码。
2. 添加评价项和图片；根据需要修改档位名称，然后将评价项拖入对应档位。
3. 复制主题编号或分享链接，让其他人加入并提交自己的排名。私有主题需要另行告知分享密码。
4. 参与者完成排名后可以查看自己的结果以及与主题创建者的对比。
5. 如需基于原内容重新排序，可以创建主题分支；分支的排名从空白开始。

创建记录、参与记录和私有主题密码保存在当前浏览器的本地存储中；更换浏览器或清除站点数据后，这些本地记录可能无法找回。服务端数据仍保存在部署目录中。

## 配置说明

应用可直接使用默认配置启动。如需修改配置，将 `config.example.json` 复制为项目根目录下的 `config.json`：

```json
{
  "server": {
    "port": 5980,
    "trustProxy": false
  },
  "admin": {
    "path": "/xintycd-admin",
    "assetPath": "/xintycd-admin.js",
    "key": "",
    "allowedIps": []
  }
}
```

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `server.port` | `5980` | HTTP 监听端口，可通过 `PORT` 环境变量覆盖。 |
| `server.trustProxy` | `false` | 是否读取反向代理提供的客户端 IP 请求头。 |
| `admin.path` | `/xintycd-admin` | 后台页面路径。 |
| `admin.assetPath` | `/xintycd-admin.js` | 后台脚本路径。 |
| `admin.key` | 空字符串 | 后台访问密钥；启用后台时必须设置非空值。 |
| `admin.allowedIps` | `[]` | 后台 IP 白名单；空数组表示不限制 IP。 |

修改配置后需重启服务。仅在可信反向代理会覆盖客户端提供的转发请求头时，才应启用 `server.trustProxy`。

## 可选后台

默认的 `npm start` **不启用后台**。需要管理后台时，可在 `config.json` 中设置非空的 `admin.key`，再运行：

```bash
npm run start:admin
```

也可以使用环境变量 `ADMIN_KEY` 提供密钥，其优先级高于 `config.json` 中的 `admin.key`。以 PowerShell 为例：

```powershell
$env:ADMIN_KEY = "替换为自己的密钥"
npm run start:admin
```

然后访问 `http://localhost:5980/xintycd-admin?key=你的密钥`。后台和前台由同一个进程提供、使用同一个端口和数据库；请根据需要选择 `npm start` 或 `npm run start:admin`，不要在同一端口同时启动两份服务。

后台支持查看与管理主题、评价项、分类和参与结果。后台密钥出现在访问地址中，请使用 HTTPS 并妥善保护浏览器历史、反向代理日志等可能记录该地址的位置。

## API 文档

默认服务地址为 `http://localhost:5980`。除上传评价项图片使用 `multipart/form-data` 外，请求体使用 JSON。

| 方法 | 接口 | 用途 |
| --- | --- | --- |
| `GET` | `/api/health` | 检查服务状态与存储模式。 |
| `GET` | `/api/categories` | 获取主题分类。 |
| `PUT` | `/api/categories` | 更新分类，需要后台权限。 |
| `GET` | `/api/topics` | 获取公开主题；后台授权请求也可获取私有主题。 |
| `POST` | `/api/topics` | 创建主题。 |
| `GET` / `PATCH` / `DELETE` | `/api/topics/:id` | 获取、更新或删除主题。 |
| `POST` | `/api/topics/:id/forks` | 基于主题创建分支。 |
| `PUT` | `/api/topics/:id/tiers` | 更新档位名称。 |
| `POST` | `/api/topics/:id/items` | 添加评价项，可附带图片。 |
| `PUT` | `/api/topics/:id/items/order` | 保存评价项的档位和顺序。 |
| `PATCH` / `DELETE` | `/api/topics/:id/items/:itemId` | 更新或删除评价项。 |
| `POST` / `GET` | `/api/topics/:id/responses` | 提交或获取参与者排名。 |
| `GET` | `/api/topics/:id/responses/:responseId` | 获取指定参与结果。 |

访问私有主题的接口时，需在请求地址中附加 `?password=分享密码`；请求私有主题图片同样需要该参数。后台接口使用 `X-Admin-Key` 请求头，且后台必须已启用。实际请求时应对参数进行 URL 编码，并避免在公开日志中记录密码。

### 创建主题示例

```bash
curl -X POST http://localhost:5980/api/topics \
  -H "Content-Type: application/json" \
  -d '{"title":"我的排行榜","author":"参与者","category":"综合","visibility":"public"}'
```

成功后返回 `201` 和包含主题信息的 JSON；服务端生成的 `topic.id` 可用于后续请求。私有主题需将 `visibility` 设为 `private`，并在请求体中提供非空 `sharePassword`。

## 数据、备份与迁移

| 路径 | 内容 |
| --- | --- |
| `data/ranking.sqlite` | SQLite 主数据库。运行中还可能出现 WAL 和共享内存文件。 |
| `data/categories.json` | 后台保存的自定义分类。 |
| `public/img/<主题ID>/` | 各主题的上传图片及分支复制的图片。 |
| `config.json` | 本机或部署环境的实际配置，可能包含后台密钥。 |

这些文件不应提交到公开仓库。`.gitignore` 已排除运行数据、上传图片、实际配置、数据库备份及压缩包；`public/img/web/logo.svg` 是界面使用的项目素材。

备份时应同时考虑数据库、分类文件、上传图片和实际配置。SQLite 运行在 WAL 模式下，不应在写入期间只复制主数据库文件；在线备份、完整性检查及恢复步骤见 [SQLite 部署与备份说明](docs/Doc.F02-sqlite-deployment.md)。

### 从旧 JSON 数据迁移

```bash
npm run migrate:json -- /path/to/db.json /path/to/ranking.sqlite
```

导入工具要求目标 SQLite 文件不存在。省略参数时默认读取 `data/db.json` 并写入 `data/ranking.sqlite`。迁移后请核对主题、评价项和结果数量，并妥善保存原始备份。图片文件需要另行迁移到对应目录。

## 访问权限与部署注意事项

- 私有主题需要分享密码；知道密码的人可以访问并修改该主题。分享密码不是用户账号或所有权认证。
- **公开主题目前没有服务端所有权认证。**知道公开主题编号的人可以通过接口修改或删除主题及评价项；浏览器中的创建记录只用于界面显示，不构成安全保障。
- 私有主题密码和后台密钥可能出现在 URL 中；使用 HTTPS，控制日志和浏览器历史的访问权限，并根据实际场景采取额外的身份认证和访问控制。
- 后台默认关闭，启用时必须设置密钥。仅靠修改后台路径无法保护管理接口。

这些限制在将服务部署到公共网络前尤其需要评估。

## 测试

```bash
npm test
```

测试使用临时目录和独立数据库，覆盖 SQLite 持久化、级联删除、后台启用及私有主题访问等关键路径。

## 开源协议

本项目基于 [MIT License](LICENSE) 开源。使用、修改和分发时请保留许可证所要求的版权及许可声明。
