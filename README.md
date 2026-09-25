# galgame-site

> 弄着玩 —— 小萝莉の资源站站

纯静态站点：零构建、零依赖、无后端。双击 `index.html` 就能跑，也可直接部署到 GitHub Pages。

线上地址：**https://byqn.github.io/galgame-site/**

## 页面结构

| 文件 | 路由参考 | 说明 |
| --- | --- | --- |
| `index.html` | `/` | 首页：双卡 Hero（介绍 + 公告）、快捷入口、最新 Galgame、高分推荐、最新补丁 |
| `galgame.html` | `/galgame` | 资源库：搜索 + 标签 / 会社 / 平台 / 语言筛选 + 四种排序 + 分页 |
| `detail.html` | `/galgame/{id}` | 作品详情：评分、会社、平台语言、简介、截图、下载版本、相关资源与推荐 |
| `tag.html` | `/tag` | 标签墙，点击标签直接进入筛选后的资源库 |
| `company.html` | `/company` | 会社列表：热门会社 + 全部会社（含每家代表作品） |
| `resource.html` | `/resource` | 补丁 / 教程 / 资讯列表，支持类型筛选与搜索 |
| `post.html` | `/resource/{id}` | 资源或文章正文 |
| `doc.html` | `/doc` | 网站说明、常见问题、公告、统计与免责声明 |

## 目录结构

```
galgame-site/
├── index.html / galgame.html / detail.html / tag.html / company.html
├── resource.html / post.html / doc.html
└── assets/
    ├── css/style.css      # 全部样式（深色社区风 + 响应式）
    └── js/
        ├── data.js        # ★ 数据层：作品 / 资源 / 公告都在这里改
        └── common.js      # 公共逻辑：导航、卡片、筛选、分页、各页面装配
```

## 怎么加内容

只改 `assets/js/data.js`：

**加作品** —— 往 `games` 数组复制一段改字段：

```js
{
  id: 'unique-id',                      // 详情页链接 ?id=unique-id
  title: '作品名', originalTitle: '原题', circle: '会社',
  releaseDate: '2026-01-01', updatedAt: '2026-09-01',
  rating: 8.5, views: '4.1k',           // 卡片上显示 ★ 8.5 · 4.1k
  tags: ['恋爱', '治愈'], platforms: ['PC'], languages: ['官方中文'],
  size: '3 GB', version: 'v1.0',
  isNew: true,                          // 显示「新发布」角标
  cover: { hue: 270, glyph: '雪' },     // 色调 + 封面大字
  summary: '简介……',
  screenshots: ['场景一', '场景二'],
  downloads: [{ label: '百度网盘', url: '#', code: 'xxxx' }],
}
```

**加补丁 / 教程 / 资讯** —— 往 `posts` 数组加，`category` 决定彩色标签：

- `category: '补丁' | '教程' | '资讯'`
- `body` 为段落数组：`'## 标题'` → 小标题，`'- 条目'` → 列表，普通字符串 → 段落

**加公告** —— 往 `notices` 数组加，第一条会显示在首页 Hero 右侧卡片。

**换封面图** —— 每部作品的封面放在 `assets/img/covers/<作品id>.jpg`（建议 1100px 宽），页面会按 id 自动匹配。

- 找不到文件或加载失败时，会自动回退到程序化生成的壁纸底图（`common.js` 里的 `coverArt()`，按 `cover.hue` 和 id 哈希生成 6 种图案）；
- 所以**可以只给一部分作品配图**，其余保持自动生成的渐变封面，不会出现破图。

当前 15 张封面取自 [Wallhaven](https://wallhaven.cc/)（免费动漫壁纸图库，SFW 分类），版权归各原作者所有，仅作占位演示；正式对外前请替换为你拥有授权的图片，或保留程序化封面。

## 自己上传作品（推荐）

站点带一个上传页面 `upload.html`：填资料 + 传封面，保存后立刻在作品库出现。

1. 启动本地服务器：`node deploy/serve.js 8080`（或 `deploy/start-public.ps1`）
2. 浏览器打开 `http://localhost:8080/upload.html`
3. 填完保存 —— 封面会自动压缩成 1100px 宽的 JPEG

保存位置：

- 作品数据 → `data/games.json`
- 封面图 → `assets/img/covers/<作品id>.jpg`

**注意：**

- 上传需要后端，所以**只在本地服务器模式下可用**；部署到 GitHub Pages 的静态版只能浏览。
- 出于安全考虑，上传接口只接受 Host 为 `localhost` / `127.0.0.1` 的请求 —— 即使站点通过 Cloudflare 隧道对公网开放，别人也无法调用上传。
- 想让上传的作品出现在线上版本：本地保存后 `git add . && git commit && git push`，图片和 JSON 会一起进仓库。

## 本地预览

方式一：双击 `index.html`（数据用 `<script>` 引入，`file://` 下也能正常渲染）。

方式二：起本地服务（推荐，便于手机同局域网预览）：

```powershell
python -m http.server 8000
# 访问 http://127.0.0.1:8000
```

VS Code 里按 `Alt+L` 用 Live Server 打开也可以。

## 部署

已配置 GitHub Pages（`main` 分支根目录）。推送后稍等片刻即自动更新：https://byqn.github.io/galgame-site/

## 自托管（用本机当服务器）

```powershell
# 只在本机 / 局域网跑
.\deploy\start-local.ps1

# 本机跑 + Cloudflare 隧道，打印一个公网地址
.\deploy\start-public.ps1
```

需要固定域名时的完整步骤（注册域名 → 命名隧道 → DNS → 开机自启）见 [`deploy/SELF-HOSTING.md`](deploy/SELF-HOSTING.md)。

## 下一步可做

- [ ] 真实封面图与截图（替换渐变色块）
- [ ] 作品收藏 / 想看（localStorage 本地记录）
- [ ] 搜索关键词高亮与搜索历史
- [ ] 浅色 / 深色主题切换
- [ ] 评论区（需要后端或第三方服务）
- [ ] 用脚本从 JSON 批量导入作品数据

## 免责声明

本项目仅用于整理公开的作品信息与原创文字内容，不存储、不提供任何游戏文件。示例数据中的下载地址均为占位符（`#`），替换为实际链接前请确认你拥有相应的分发权利。请支持正版。
