/*!
 * 远端配置：公告 + 版本信息
 *
 * mode:
 *   'demo' —— 演示模式：不联网，直接把下面的内容当作远端返回（用于尚未发布到 GitHub 的阶段）
 *   'live' —— 真实模式：按 endpoints 依次尝试拉取 version.json
 *
 * 发布到 GitHub 后，把 mode 改成 'live'，并把 USER 换成你的用户名即可。
 */
window.LEDGER_REMOTE = {
  mode: 'demo',

  endpoints: [
    'https://cdn.jsdelivr.net/gh/USER/ledger-studio@main/version.json',
    'https://raw.githubusercontent.com/USER/ledger-studio/main/version.json',
    'https://gh-proxy.com/raw.githubusercontent.com/USER/ledger-studio/main/version.json'
  ],

  announcement: {
    id: '2026-10-24-01',
    title: 'LST-v1.1.0 已发布',
    date: '2026-10-24',
    level: 'info',
    summary: '新增参数配置页、PDF 源补录（实验），页签顺序调整为「先生成、后检查」。',
    items: [
      '【新】参数配置：固定值基准与分类号映射可视化编辑，检查与生成共用同一份配置，保存在本机浏览器',
      '【新】PDF 源补录（实验）：从 PDF 文字层推测缺失的文件编号与文件日期，只补少数缺失，不保证准确',
      '【调整】页签顺序改为「生成台账 → 检查台账」，更贴合实际使用流程',
      '【调整】每次启动自动检查更新，有新版本会在顶部提示',
      '【提示】生成台账属实验功能，生成的台账请务必人工复核后再进入后续流程'
    ]
  },

  latest: {
    docNo: 'LST-v1.1.0',
    version: '1.1.0',
    releasedAt: '2026-10-24',
    notes: [
      '参数配置页（固定值基准 / 分类号映射 / 项目全称）',
      'PDF 源补录（实验）',
      '启动公告与自动更新检查',
      '页签顺序调整'
    ],
    url: 'https://github.com/USER/ledger-studio/releases/latest'
  }
};
