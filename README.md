# dsh-headroom-panel

DeepSeek Harness（DSH）插件：在 DSH 里**查看并配置本机 [headroom](https://docs.headroomlabs.ai) 代理**。

> 这不是上下文压缩插件。它管理的是已经在运行的 **headroom 代理进程**（`~/.headroom/proxy_startup.pyw`）：
> 看它的健康/节省统计，改它的模式/上游/端口，切换 DSH 是否经过它，以及一键重启它。

## 功能

**右侧边栏 · Headroom 页签**（8 秒自动刷新）

- 运行状态：版本、端口、运行时长、上游地址、当前模式
- 节省统计：请求数、压缩次数、平均压缩率、本次移除 token、本次会话省 token、缓存命中率、节省金额、终身累计、平均延迟
- 最近 5 条请求：`before → after (saved)`
- **版本错配告警**：磁盘上的 headroom 版本 ≠ 运行中代理版本时提示（headroom 升级后没重启代理会触发 `ImportError`，导致模型请求全部失败——本项目作者踩过这个坑，所以内置了守卫）

**DSH 路由**

- 显示当前是「经本地 headroom / 直连官方 / 未配置」
- 一键写入或注释 `cordis.patch.yml` 里带 `[headroom-route]` 标记的受管块
- **改完需要重启 DSH 才会生效**（插件不会替你重启 DSH）

**代理配置**（写 `~/.headroom/proxy.json` 后自动重启代理）

- 模式：`cache`（冻结前缀、保缓存命中）/ `token`（更激进）/ `passthrough`（只转发不压缩）
- Anthropic 上游 URL
- 端口（同时同步 patch 中的路由端口，需重启 DSH）

**仅重启代理**：升级 headroom 之后用这个刷新运行版本。

## 前置条件

1. 已安装 headroom（`pip install headroom-ai`），且存在启动器 `~/.headroom/proxy_startup.pyw`
   （也可以用 Windows 启动文件夹的快捷方式自启，见 headroom 官方文档）
2. 启动器读取 `~/.headroom/proxy.json`（本插件会写这个文件）；没有该文件也能跑，插件首次保存时会创建
3. DSH 版本需支持插件 bundles 与 `dsh.client`（本项目在 DSH 0.2.2-rc.1 上开发验证）

## 安装（三选一）

**A. 从 GitHub 安装（推荐，需要你的机器能访问 GitHub）**

```sh
dsh plugin --profile desktop add github:2972218256/dsh-headroom-panel
```

**B. 手动安装（离线可用）**

```powershell
# 1) 把本仓库复制/解压到 profile 的 node_modules
$dst = "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-headroom-panel"
Copy-Item -Recurse . $dst

# 2) 在 ~/.dsh/profiles/desktop/package.json 的 dsh.profile.bundles 末尾加一行
#    "dsh-headroom-panel"

# 3) 重启 DSH
```

**C. 从 npm 安装**（发布后可用）

```sh
dsh plugin --profile desktop add dsh-headroom-panel
```

重启 DSH 后，打开右侧边栏 → **Headroom** 页签。

## 配置项（环境变量覆盖）

默认假设 Windows + 标准安装路径。非默认环境用环境变量覆盖：

| 变量 | 默认值 |
|---|---|
| `DSH_HEADROOM_PROXY_JSON` | `~/.headroom/proxy.json` |
| `DSH_HEADROOM_STARTUP` | `~/.headroom/proxy_startup.pyw` |
| `DSH_HEADROOM_PYTHONW` | `%LOCALAPPDATA%\Programs\Python\Python313\pythonw.exe` |
| `DSH_HEADROOM_PATCH` | `~/.dsh/profiles/desktop/cordis.patch.yml` |
| `DSH_HEADROOM_SITE_PACKAGES` | 从 `DSH_HEADROOM_PYTHONW` 推导，用于版本守卫 |

## Host API

插件在 DSH host 上注册的 HTTP 路由（同源、POST、JSON）：

| 路径 | 作用 |
|---|---|
| `/api/dsh-headroom-panel/status` | 代理健康/配置/统计 + 路由状态 + 版本错配告警 |
| `/api/dsh-headroom-panel/config` | `{ mode?, optimize?, anthropicUpstream?, port? }` → 写 `proxy.json` 并重启代理 |
| `/api/dsh-headroom-panel/route` | `{ target: "on" \| "off" }` → 写/注释 patch 路由块（需重启 DSH） |
| `/api/dsh-headroom-panel/restart` | 重启 headroom 代理 |

返回统一为 `{ ok: true, value }` 或 `{ ok: false, error: { code, message } }`。

## 安全与边界

- 只读写两个文件：`~/.headroom/proxy.json`、`~/.dsh/profiles/desktop/cordis.patch.yml`
- 重启代理：先用 `/health` 返回的 pid 终止旧进程，再用 pythonw 后台启动启动器；**不会重启 DSH**
- 不安装依赖、不联网（除了访问本机 `127.0.0.1` 上的 headroom）
- 没有 npm 安装包时也不会自己下载东西

## 卸载

1. 从 `~/.dsh/profiles/desktop/package.json` 的 `dsh.profile.bundles` 移除 `"dsh-headroom-panel"`
2. 删除 `node_modules/dsh-headroom-panel`
3. 重启 DSH

## 开发

```sh
node --check lib/index.js && node --check lib/client.js   # 语法
node scripts/smoke-test.mjs                               # 对真实运行中的代理做冒烟
```

`smoke-test.mjs` 只读 `/health`、`/stats` 与 patch 文件，不修改任何配置。

## License

MIT

## 与 dsh-better-sidebar 的关系

如果你安装了 [`dsh-better-sidebar`](https://github.com/omdsh-dev/DSH-better-sidebar)（它会接管 DSH 右侧边栏），
本插件优先通过它的 `ctx.betterSidebar.registerTab()` 注册页签；没有该插件时回退到 DSH 原生
`sidebarRightTabs`。两种情况下页签都叫 **Headroom**。

## 关于「重启代理」的进程模型

`重启代理` 通过 WMI 创建进程（父进程为 `WmiPrvSE`），而不是作为 DSH 的子进程启动。
原因：从 DSH 的终端/工具里启动的子进程会继承 DSH 的 Windows job object，DSH 一重启
这个代理就会被一起杀掉（表现为"DSH 重启后 headroom 没起来"）。WMI 启动的进程不随
DSH 退出而消失；WMI 不可用时回退为普通 detached spawn。

## 已知问题

- headroom `0.43.1` 的 `/dashboard` 页面会 500（上游 bug：`get_dashboard_html(licensed=...)`
  与运行时补丁签名不匹配）。面板里的「原始统计」按钮改为打开 `/stats`（JSON）。

## 入口与排障

**两个入口都会尝试注册**：

1. `dsh-better-sidebar` 的右侧边栏页签（若安装）；
2. **页面右下角悬浮按钮 `Headroom`**（兜底，不依赖任何侧边栏）。

**加载证据日志**：`~/.headroom/panel-boot.log`

```
<时间> host pid=12345 {"connection":true}
<时间> client {"version":"0.1.2","at":...,"ua":"..."}
```

- 只有 `host`：客户端 bundle 没加载（检查 `dsh.client` 声明/包名/重启）。
- `host` + `client`：bundle 已加载，若仍看不到入口，则是 UI 注册失败（看浏览器 Console）。
- 都没有：bundle 根本没被 DSH 加载（检查 profile bundles 与 node_modules）。

## 入口：左侧导航（系统级）

Headroom 的路由/压缩是**全局**配置（配置一次，之后所有会话/模型都走它），所以主入口放在
**左侧导航栏**（与「插件」「上下文洞察」「识图」同一机制）：

- `sidebar.panellist` 槽位注册图标 + 名称 **Headroom**（默认 order 88）
- `main` 槽位注册同名页面，点开后是整页配置界面

只有当左侧导航注册失败时，才会退化为页面右下角的悬浮按钮（兜底）。

## 仪表盘 500 的根因（本机已修复）

`/dashboard` 报 `Internal Server Error` 与插件无关：本机
`%APPDATA%\Python\Python313\site-packages\usercustomize.py`（Headroom 仪表盘**中文语言包**）
把 `headroom.dashboard.get_dashboard_html` 包装成了**不接受参数**的 lambda；
而 headroom `0.43.1` 的 `/dashboard` 路由改为 `get_dashboard_html(licensed=...)` 调用，
于是抛出 `TypeError: unexpected keyword argument 'licensed'` → 500。

修复：让包装器透传 `*args, **kwargs`（备份 `usercustomize.py.bak-20261108`），重启代理后
`/dashboard` 与 `/settings` 恢复 200。删除该文件则仪表盘回到英文原版，也能用。
