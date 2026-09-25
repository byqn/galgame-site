/* ==========================================================================
   站点数据层 —— 改内容只改这个文件
   --------------------------------------------------------------------------
   字段说明：
     views    浏览量展示值（字符串，如 '4.1k'）
     isNew    true 时卡片左上角显示「新发布」角标
     cover    hue 控制封面色调，glyph 是封面大字（换成真图见 README）
     downloads 下载条目，url 一律留 '#'，请换成你有权分发的地址
   posts.category: 补丁 | 教程 | 资讯
   ========================================================================== */

window.SITE_DATA = {
  site: {
    name: '小萝莉の资源站',
    slogan: '找游戏、看攻略、少走弯路',
    desc: '免费、高质量的 Galgame 资源索引：找游戏、查会社、看补丁，一站搞定。',
    since: '2026',
    repo: 'https://github.com/byqn/galgame-site',
    links: [
      { label: 'QQ 群', value: '883598175', icon: '💬' },
      { label: 'TG 频道', value: 't.me/byqn1', url: 'https://t.me/byqn1', icon: '📣' },
      { label: 'TG 群', value: 't.me/galbyqn', url: 'https://t.me/galbyqn', icon: '✈️' },
      { label: 'B 站', value: '关注我们', icon: '📺' },
    ],
  },

  notices: [
    {
      id: 'notice-common',
      title: '网站说明和常见问题',
      desc: '汇总本站的收录范围、数据来源、更新机制与常见问题解答。',
      date: '2026-09-01',
      views: '2.3k',
      comments: 18,
    },
    {
      id: 'notice-download',
      title: '下载与补丁使用说明',
      desc: '网盘链接失效、解压密码、转区、运行库缺失等问题的处理方式。',
      date: '2026-08-20',
      views: '1.7k',
      comments: 12,
    },
  ],

  games: [],

  // 标签体系：作品库为空时标签页也展示这些分类，上传作品时也能直接选用
  tagGroups: [
    { name: '题材', tags: ['恋爱', '日常', '校园', '奇幻', '科幻', '悬疑', '末世', '战斗'] },
    { name: '风格', tags: ['治愈', '催泪', '黑暗', '搞笑', '文艺', '解谜', '群像'] },
    { name: '篇幅与分级', tags: ['短篇', '中篇', '长篇', '全年龄'] },
    { name: '季节与元素', tags: ['冬季', '夏季', '青春', '怀旧', '音乐', '猫咪', '王道'] },
  ],

  // category: 补丁 | 教程 | 资讯
  posts: [],
};
