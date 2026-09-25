# galgame-site

> 弄着玩 —— Galgame 作品索引、攻略与资讯站

纯静态站点，零依赖、零构建：双击 `index.html` 就能看，也可以直接部署到 GitHub Pages。

## 页面结构

| 文件 | 页面 | 说明 |
| --- | --- | --- |
| `index.html` | 首页 | 最近更新、高分推荐、攻略资讯入口 |
| `library.html` | 资源库 | 关键词搜索 + 标签筛选 + 多维排序 |
| `detail.html` | 作品详情 | `?id=作品id`，含简介、截图占位、下载区、相关攻略与作品 |
| `guides.html` | 攻略资讯 | 分类（攻略 / 评测 / 资讯）+ 关键词搜索 |
| `guide.html` | 文章详情 | `?id=文章id` |
| `about.html` | 关于本站 | 更新方式、技术说明、免责声明 |

## 目录结构

```
galgame-site/
├── index.html / library.html / detail.html / guides.html / guide.html / about.html
└── assets/
    ├── css/style.css      # 全部样式（深色主题 + 响应式）
    └── js/
        ├── data.js        # ★ 数据层：作品、文章都在这里改
        └── common.js      # 公共逻辑：导航、卡片渲染、搜索、筛选、排序
```

## 怎么加内容

编辑 `assets/js/data.js`：

**加一部作品**：往 `games` 数组里复制一段已有条目，改字段即可。

```js
{
  id: 'unique-id',          // 唯一 id，详情页链接 ?id=unique-id
  title: '作品名', originalTitle: '原题', circle: '社团',
  releaseDate: '2026-01-01', updatedAt: '2026-09-01',
  rating: 8.5, tags: ['恋爱', '治愈'],
  languages: ['简体中文'], platforms: ['Windows'], size: '3 GB', version: 'v1.0',
  cover: { hue: 270, glyph: '雪' },   // hue 控制封面色调，glyph 是封面大字
  summary: '简介……',
  screenshots: ['场景一', '场景二'],
  downloads: [{ label: '百度网盘', url: '#', code: 'xxxx' }],
  guideId: null,            // 可选，关联的攻略 id
}
```

**加一篇文章**：往 `posts` 数组里加，`body` 是段落数组：

- `'## 标题'` → 渲染成小标题
- `'- 条目'` → 渲染成列表
- 其它字符串 → 普通段落

**换真实封面图**：图片放进 `assets/img/`，然后改 `common.js` 里的 `coverHtml()`，把渐变色块换成 `<img>`。

## 本地预览

方式一：直接双击 `index.html`（数据用 `<script>` 引入，`file://` 下也能正常渲染）。

方式二：起一个本地服务（推荐，便于手机同局域网预览）：

```powershell
python -m http.server 8000
# 然后访问 http://127.0.0.1:8000
```

## 部署到 GitHub Pages

1. 仓库 **Settings → Pages**；
2. Source 选 **Deploy from a branch**，分支选 `main`、目录 `/ (root)`，保存；
3. 稍等片刻即可通过 `https://byqn.github.io/galgame-site/` 访问。

## 下一步可做

- [ ] 真实封面图与截图（替换占位色块）
- [ ] 作品详情页加「收藏 / 想看」本地记录（localStorage）
- [ ] 列表分页或无限滚动（作品上千条之后）
- [ ] 搜索关键词高亮、搜索历史
- [ ] 浅色 / 深色主题切换
- [ ] RSS 或 JSON 数据源，方便用脚本批量喂数据

## 免责声明

本项目仅用于整理公开的作品信息与原创攻略内容。示例数据中的下载地址均为占位符（`#`），替换为任何实际链接前请确认你拥有相应分发权利。请支持正版。
