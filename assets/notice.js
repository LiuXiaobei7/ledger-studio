/*!
 * 远端配置：更新检查源
 *
 * 目标：在「不能直连 github.com」的机器上也能查到有没有新版本。
 *
 * 通道按并行竞速处理：同时请求下面所有源，谁先返回有效内容就用谁，
 * 其余请求立即作废。这样在受限网络下不会一个接一个地等超时。
 *
 * 实测结论（2026-10）：
 *   - 能正常访问 GitHub 的机器：jsDelivr / raw.githubusercontent 最快
 *   - 公司内网、github.com 被拦的机器：api.github.com 与 gh-proxy 镜像仍可用
 *   - 完全断网：全部失败，提示离线，改用离线 zip 覆盖
 *
 * 注意：更新检查必须通过本地服务运行（http://127.0.0.1:xxxx）。
 * 直接双击 index.html（file://）时浏览器禁止跨域请求，检查一定失败。
 */
window.LEDGER_REMOTE = {
  // 仓库坐标，改这两行即可指向你自己的 fork
  owner: 'LiuXiaobei7',
  repo: 'ledger-studio',
  branch: 'main',

  // 竞速总超时（毫秒）。超过这个时间还没任何源成功，就判定为不可达
  timeoutMs: 6000,

  // 缓存有效期（毫秒）。启动时若缓存未过期，直接用缓存不再联网
  cacheTtlMs: 30 * 60 * 1000,

  endpoints: [
    {
      name: 'jsDelivr',
      type: 'json',
      url: 'https://cdn.jsdelivr.net/gh/{owner}/{repo}@{branch}/version.json'
    },
    {
      name: 'GitHub 原始文件',
      type: 'json',
      url: 'https://raw.githubusercontent.com/{owner}/{repo}/{branch}/version.json'
    },
    {
      name: 'gh-proxy 镜像',
      type: 'json',
      url: 'https://gh-proxy.com/https://raw.githubusercontent.com/{owner}/{repo}/{branch}/version.json'
    },
    {
      name: 'ghproxy 镜像',
      type: 'json',
      url: 'https://ghproxy.net/https://raw.githubusercontent.com/{owner}/{repo}/{branch}/version.json'
    },
    {
      // 作为最后兜底：GitHub API 匿名访问有速率限制（每小时 60 次/IP），
      // 所以不放进去竞速队列，只有前面几个源全部失败时才单独试它
      name: 'GitHub API',
      type: 'base64',
      fallback: true,
      url: 'https://api.github.com/repos/{owner}/{repo}/contents/version.json'
    }

    // 可选：如果你在 Gitee 建了同步镜像，取消下面这行的注释并改成实际地址
    // { name: 'Gitee 镜像', type: 'json',
    //   url: 'https://gitee.com/{你的gitee用户名}/{repo}/raw/{branch}/version.json' }
  ],

  /* 离线兜底公告：远端读不到时显示这条，保证至少有一条本地公告可看 */
  fallbackAnnouncement: {
    id: '2026-10-24-02',
    title: 'LST-v1.1.5 已发布',
    date: '2026-10-24',
    level: 'info',
    summary: '更新检查改为真实联网检测：可自动选择可用的通道，受限网络下也能查到新版本。',
    items: [
      '【新】更新检查接入真实源，不再显示演示数据',
      '【新】多个通道同时尝试，自动采用最先返回的那个，不需要你手动选',
      '【新】检查结果在本机缓存 30 分钟，避免频繁联网；点「检查更新」可强制刷新',
      '【调整】检查失败时会说明是「网络不通」还是「浏览器限制了跨域」',
      '【提示】更新检查需要以本地服务方式打开（双击 启动.bat），直接双击 HTML 不可用'
    ]
  }
};
