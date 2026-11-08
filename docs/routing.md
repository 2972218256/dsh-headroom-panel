# 路由块（cordis.patch.yml）

DSH 的模型端点由 profile 的 patch 层决定。本插件的「DSH 路由」功能只维护下面这个
**受管块**（标记为 `[headroom-route]`），不碰 patch 里的其他内容：

```yaml
# ============ headroom-route managed block ============
- id: deepseek-account
  name: "@deepseek-ai/dsh-deepseek-account-platform"
  config:
    desktopPlatform: !!js "ctx.get('profileContext')?.name === 'desktop' && ['darwin', 'win32'].includes(process.platform) ? process.platform : null"
    inferenceOrigin: "http://127.0.0.1:8787"   # [headroom-route] inferenceOrigin
- id: llm-deepseek-account
  name: "@deepseek-ai/dsh-llm-deepseek-account"
  config:
    baseURL: "http://127.0.0.1:8787"           # [headroom-route] baseURL
# ============ /headroom-route managed block ============
```

要点：

- `inferenceOrigin` 必须与请求端点 origin 一致，否则 DSH 会拒绝发放账号凭证
  （`platformOrigin` 保持官方，已有授权才不会失效）。
- 切到「直连官方」时，插件把这两行**注释掉**而不是删掉，DSH 回落到内置默认端点
  （`inferenceOrigin` 默认 `https://api.deepseek.com`）。
- 改完必须**重启 DSH**；只重启 headroom 代理不会改变 DSH 的指向。
- 命令行等价物：`~/.dsh/headroom-route.ps1 on|off`（会读同一个标记块；若块不存在，
  `on` 会自动追加）。

## 如何确认生效

```powershell
# 1) patch 里标记行是否处于启用状态
Select-String -Path "$env:USERPROFILE\.dsh\profiles\desktop\cordis.patch.yml" -Pattern 'headroom-route'

# 2) DSH 的请求是否真的到达 headroom（重启 DSH 后）
Get-Content "$env:USERPROFILE\.headroom\logs\proxy-8787.log" -Tail 20 |
  Select-String 'proxy_inbound_request'
```

日志中出现 `user-agent: deepseek-harness/...` 与当前会话 id，即表示请求已经过代理。
