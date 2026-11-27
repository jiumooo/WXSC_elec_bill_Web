# WXSC_elec_bill_Web

**[👉 点这里直接查：https://jiumooo.github.io/WXSC_elec_bill_Web/](https://jiumooo.github.io/WXSC_elec_bill_Web/)**

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-已部署-2ea44f?logo=github)](https://jiumooo.github.io/WXSC_elec_bill_Web/) [![版本](https://img.shields.io/badge/version-1.2.6-blue)](https://github.com/jiumooo/WXSC_elec_bill_Web)

无锡科技职业技术学院（WXSC）电费查询的纯静态网页版：查当前房间余额、设置房间、按时间范围查充值记录，并把结果导出成 **Excel** 或 **Markdown**。

它脱胎于 AstrBot 插件 `astrbot_plugin_wxsc_elec_bill`——只保留真正有用的查询能力（去掉了群通知、定时推送、NapCat 之类的机器人侧功能），改成一个可以直接丢进 **GitHub Pages** 的静态站点。

| 项 | 值 |
| --- | --- |
| **版本** | `1.2.6` |
| **形态** | 纯前端（HTML + CSS + 原生 JavaScript），零依赖、零运行时构建 |
| **线上地址** | [https://jiumooo.github.io/WXSC_elec_bill_Web/](https://jiumooo.github.io/WXSC_elec_bill_Web/) |
| **开箱能查** | 仓库自带按楼栋 / 房间 / 个人分好的**离线历史台账**（`data/`），不用中转、不用联网查询 |
| **台账现状** | 12 栋 · 2035 间 · 295941 笔 · 2061 个 JSON 约 33 MB · **截止 2026-11-10 03:08:47（北京时间）** |
| **自动刷新** | GitHub Actions 每天 **01:00（北京时间）** 抓一次真实数据，有变化就自动提交并部署 |

---

## 快速开始

打开 **[https://jiumooo.github.io/WXSC_elec_bill_Web/](https://jiumooo.github.io/WXSC_elec_bill_Web/)**，第一次会弹出 **4 步使用引导**，跟着点完就能查到自己的房间：

1. **选通道**：点「**直接用历史数据**」最快——仓库里已经放好真实台账，离线可查，页面会写明数据截至时间。
   想查「此刻」的实时数据，再点「检测可用中转」自建一条（见 [数据通道](#数据通道重要)）。
2. **填入学年份**：比如 2022，查询开始时间会自动设成 `2022-09-01 00:00:00`（**按 9 月 1 日入学算**）。
3. **选楼栋**：下拉里是全部楼栋和各自房间数，选你住的那栋。
4. **选房间**：房间下拉会按所选楼栋自动匹配，选好即自动查询并退出引导，直接进主界面。

之后想再进引导：页面底部 **「重新查看使用引导」**；想跳过：引导右上角「跳过」。
顶栏右侧跟着版本号的两个按钮是 **「房间设置」** 和 **「中转通道」**，点开是抽屉面板，面板顶部可以在两者之间直接切换。

主界面上半部分是 **当前房间**（余额），下半部分是 **充值记录查询**：选时间范围 → 「查询」→
在「每人总金额表 / 充值明细表 / 个人充值记录」之间切换 → 点右上角 **「导出 Excel」/「导出 Markdown」**。
导出前会先弹 **预览**，确认内容（表头、行数、文件名）后再点「确认导出」——**当前是哪张表，预览和导出的就是哪张表**。

> 学校接口不带 CORS 头，`*.github.io` 上要查**实时**数据必须先有一个中转（平台限制，不是页面偷懒）；
> 只查历史台账则完全不需要中转。

## 功能

| 模块 | 说明 |
| --- | --- |
| **使用引导** | 首次进入 4 步走完：选通道 → 填入学年份 → 选楼栋 → 选房间，选完自动查询并退出引导 |
| **当前房间** | 剩余电量、已用电量、已购电量、已用比例；右侧按钮「刷新余额」——**历史数据模式下它叫「重读快照」**，只是重新读一次本地文件，不会联网 |
| **房间设置**（顶栏按钮） | **楼栋下拉 → 房间下拉**（先选楼栋，房间只在该楼内匹配）；「入学年份」也在这里改；小区/校区 ID 与数据源收在「高级」里；底部记录本机用过的房间，一键切回 |
| **中转通道**（顶栏按钮） | 「直接用历史数据」「自动检测可用中转」、手动填地址、「保存并测试」、复制 Worker 代码；历史 / 中转 / 直连三选一 |
| **充值记录查询** | 任意时间范围（精确到秒），开学至今 / 近 30 天 / 今年 / 全部 快选（「开学至今」= 入学年份 9 月 1 日至今） |
| **每人总金额表** | 按充值账号聚合：笔数、金额、占比、首次/最近时间，可给账号加备注 |
| **充值明细表** | 逐笔时间、金额、备注、账号、记录号、外部订单号 |
| **个人充值记录** | 选一个账号，只看他一个人的流水（合计与笔数在表尾） |
| **导出** | 先预览再导出；单表导出 Excel 就是「该表 + 信息」两张 sheet，Markdown 同内容；文件名形如 `充值台账-三号楼_3101_室-每人汇总-2022-09-01~2026-11-10-20261110-031545.xlsx` |
| **已查询人次** | 页面最下方显示「已查询 N 人次」，按设备去重累计，详见 [访问统计](#访问统计) |

备注（给充值的账号起个名字，比如「张三」「隔壁老王」）**只写在你自己的浏览器 `localStorage`**（键名 `wxsc.elec.notes.v1.r<loudongId>_<roomId>`），不会上传到页面所在站点、不会进中转、不会进任何服务器；只有你点「导出」时才会写进你自己下载的那份文件里。换电脑、换浏览器、清站点数据都会看不到，这是预期行为。

## 多用户隔离

页面没有任何后端会话，这是隔离性的来源：

1. 每次查询只携带**你自己这一页**填写的房间参数（`xiaoquId / datasource / loudongId / roomId`），请求之间不共享任何状态。
2. 查询结果只活在当前标签页的内存里，**不写入 localStorage、不进共享缓存、不做 Service Worker 缓存**。
3. `localStorage` 只保存**本机偏好**，共 7 个键，全部在你自己的浏览器里：

   | 键 | 存什么 |
   | --- | --- |
   | `wxsc.elec.cfg.v1` | 当前房间设置（楼栋号/房号/小区/数据源） |
   | `wxsc.elec.channel.v1` | 取数通道（历史数据 / 中转地址 / 直连） |
   | `wxsc.elec.notes.v1.*` | 你给账号起的备注，按房间分开存 |
   | `wxsc.elec.recent.v1` | 本机用过的房间 |
   | `wxsc.elec.range.v1` | 上次选的时间范围 |
   | `wxsc.elec.guide.v1` | 引导是否看完 |
   | `wxsc.elec.enroll.v1` | 入学年份 |
   | `wxsc.elec.device.v1` / `wxsc.elec.counted.v1` / `wxsc.elec.visits.v1` | 访问统计用的设备号、「本机已计入」标记、上次看到的数字 |

4. 中转（Cloudflare Worker / 本地 Node / Deno）是**无状态转发**：不落盘、不记录请求体、不区分用户、不做响应缓存。

因此 A 同学查 3 号楼 101、B 同学同时查 5 号楼 202 时，两个请求各走各的链路，谁也看不到谁的数据。

> 同一台电脑同一个浏览器开两个标签页，会共用「房间设置」这项偏好（因为都存在同一份 localStorage）。结果列表仍然是各自独立的，互不覆盖。

## 数据通道（重要）

学校接口 `https://pay.wxstc.cn` **没有返回 CORS 响应头**，所以从 `*.github.io` 直接 `fetch` 会被浏览器拦下。页面提供三种取数方式（点顶栏 **「中转通道」** 切换）：

| 方式 | 要什么 | 适合谁 |
| --- | --- | --- |
| **`history` 历史数据**（默认） | 什么都不用 | 所有人。打开就能查，页面标注数据截止时间 |
| **`relay` 中转** | 一个能转发 `POST` 的地址 | 想看「此刻」的实时余额/最新流水 |
| **`direct` 直连** | 页面与接口同源（自己反代） | 有服务器的少数人 |

### 历史数据（免查询，默认通道）

`data/` 是直接从真实接口抓下来的台账，页面打开即可查，**不发任何查询请求**。

```
data/meta.json                        总索引：截止时间 / 楼栋 / 房间数 / 记录数
data/index.json                       合并精简索引（24 KB，首屏只读它）
data/loudong/<楼栋>/index.json        该楼栋房间清单：房号 / 笔数 / 金额
data/loudong/<楼栋>/balance.json      该楼栋余额快照：已用 / 已购 / 剩余
data/loudong/<楼栋>/room-<房号>.json  单房间：逐笔流水 + 每人汇总
```

按「变化频率」分层存放，这样每天更新只重传少量文件：

- **每天都可能变**：`meta.json`、`index.json`、每栋一个 `balance.json` —— 共 14 个文件；
- **只有该房间有新充值才变**：`room-<房号>.json`；
- **只有某栋有房间数字变了才变**：`loudong/<楼栋>/index.json`。

如果旧结构把 `cutoff` 与 `balance` 写进每个房间文件，GitHub 上 2035 个 blob 会每天全部作废，一次推送要传 34 MB、耗时半小时；现在日更通常只有十几个文件变化。

### 每天 01:00 自动刷新

`.github/workflows/refresh-data.yml` 每天 **UTC 17:00（北京时间 01:00）** 在 GitHub 的机器上直连上游跑一遍：

```
crawl（增量：先探最新 20 条，没新增就复用本地流水）
  → normalize（重整房号 / 重建两级索引 / 迁移旧结构）
  → build-index（生成 data/index.json）
  → 有变化才 commit，然后自动部署 Pages
```

想立刻刷一次：Actions → **Refresh history data** → `Run workflow`（可填 `loudong` / `limit` 只抓一部分试跑）。

本地手动跑：

```bash
node tools/crawl.mjs                # 增量（默认）；--full 全量、--concurrency 6 并发、--loudong 3 只抓一栋
node tools/normalize-data.mjs       # 规范化 + 重建索引
node tools/build-index.mjs          # 生成 data/index.json
```

### 为什么公共中转不能用

上游只接受 `POST`（`GET` 直接返回 `{"code":417,"msg":"异常：Request method 'GET' not supported"}`），而 2026 年之后绝大多数免费 CORS 代理只转发 `GET`，或者干脆丢弃 `Content-Type`（上游会回 `contentType为空`）。实测 16 个公共代理，可用 **0** 个（`tools/probe-relay.mjs` 可复现）。

所以实时查询只剩**自建**这一条路。

### 先试「自动检测可用中转」

点开「中转通道」→「自动检测可用中转」，页面会并发实测这些候选，谁通就在谁那行点「用它查询」：

| 候选 | 说明 |
| --- | --- |
| **历史数据（离线快照，必可用）** | 永远在第一行，不需要网络，点一下就能查 |
| 本机中转 `127.0.0.1:8787` / `localhost:8787` | 跑过 `node relay/server.mjs` 才会绿 |
| 本机 Deno 中转 `127.0.0.1:8788` | 跑过 `deno run --allow-net relay/deno.ts` 才会绿 |
| 本站同源 | 页面本身由中转/自己的服务器托管时可用 |
| `relay/endpoints.json` 里登记的地址 | 自建好之后欢迎 PR 加一行 |
| 公共代理（allorigins / codetabs） | 只支持 GET，实际基本不可用，仅作兜底 |

全红不代表页面坏了——第一行的历史数据照样能查。

### 三种自建中转（任选一种）

| 方式 | 需要 | 适合 | 文件 |
| --- | --- | --- | --- |
| 本地 Node | 装 Node 18+ | 自己电脑上查实时 | [`relay/server.mjs`](relay/server.mjs) |
| Cloudflare Worker | 免费 CF 账号 | 手机/别人也能用 | [`relay/worker.js`](relay/worker.js) |
| Deno Deploy | 免费 Deno 账号 | 不想装任何东西 | [`relay/deno.ts`](relay/deno.ts) |

#### 方式一：Cloudflare Worker（免费、两步）

1. 打开 [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Worker**；
2. 把 [`relay/worker.js`](relay/worker.js) 全文粘进去 → **Deploy**；
   不想手动复制：页面「中转通道」底部有 **「复制 Worker 代码」**，一键取全文。
3. 得到的 `https://<名字>.<账号>.workers.dev` 填进「中转地址」→「保存并测试」。

#### 方式二：本地 Node 中转（本地完整跑通，零依赖）

```bash
node relay/server.mjs
# 静态站点  http://127.0.0.1:8787/
# 一键开页  http://127.0.0.1:8787/?relay=http://127.0.0.1:8787
```

它同时做三件事：发布仓库根目录为静态站点、把 `/grdp-ele-third-unite/*` 转发到学校接口并补 CORS 头、提供 `/count` 计数接口（见 [访问统计](#访问统计)）。

#### 方式三：Deno Deploy（不想装东西就选这个）

装过 Deno 的可以在本机直接跑（和 Node 版并存，端口 8788）：

```bash
deno run --allow-net relay/deno.ts
# 页面中转地址填 http://127.0.0.1:8788
```

想挂到公网：打开 [dash.deno.com](https://dash.deno.com) → `New Playground` → 把 [`relay/deno.ts`](relay/deno.ts) 全文粘进去 → `Save & Deploy`，
拿到 `https://<name>.deno.dev` 填进「中转地址」即可（免费额度对几个人查询完全够）。

## 部署页面到 GitHub Pages

仓库已开启 Pages，发布方式是 **GitHub Actions**（`.github/workflows/pages.yml`）：推到 `main` 就自动部署。
构建失败会在 Actions 页面写明原因，不会像老的分支发布那样整站变成 503。

新克隆一份时手动开启：`Settings → Pages → Build and deployment → Source: GitHub Actions`。

## 线上打不开时

以前用「分支发布」时遇到过：站点返回 `503 Unicorn`、Actions 里 `Page build failed` / 构建耗时 0 秒。判断与处理：

1. `https://<你的账号>.github.io/<仓库>/` 返回 503，但别的仓库站点正常 → 是本仓库的部署记录坏了，不是你写错了；
2. 到 **Settings → Pages** 重新选一次 `Source: GitHub Actions`（或删掉再重新开），再手动跑一次 `Deploy to GitHub Pages`；
3. 仍失败就看该次 run 的日志，里面会写明是构建还是部署环节。

## 直接带参数打开

```
?relay=https://...           指定中转地址
?mode=history                历史数据（?mode=demo 同义，兼容旧链接）
?range=enroll                时间范围初值：enroll / 30d / year / all（旧的 ?range=month 会按 all 处理）
?loudong=3&room=101          直接指定房间（历史数据模式下会自动查询）
?guide=1                     强制打开使用引导（?guide=0 强制不弹）
?count=<基址>                把「已查询人次」指到自己的计数接口（如 http://127.0.0.1:8787/count）
```

例：`https://jiumooo.github.io/WXSC_elec_bill_Web/?loudong=3&room=101&range=enroll`

## 访问统计

页面最下方那行「**已查询 N 人次**」的口径：

- **什么时候加 1**：第一次**查询成功**时加一次；同一台设备、同一个浏览器只加一次（本机用 `localStorage` 记住已计入）。
- 换设备、换浏览器、清站点数据 → 会再计一次；同一台机器开再多标签页也只会算一次。
- 数字从哪来：默认走公共计数器 `abacus.jasoncameron.dev`（`wxsc-elec/page-visits`，无需注册）。
  如果页面用的是**本机 Node 中转**（`127.0.0.1:8787`），会改打中转自带的 `/count`，数据只留在你这台机器的 `relay/.count.json`；
  也可以用 `?count=<基址>` 指向自己的计数接口。
- 计数失败不影响查询：取不到数字时显示「—」，其余功能照常。
- 只统计「查询过的设备数」，不收集任何个人信息，也没有 cookie 或第三方脚本。

## 更新日志

### 1.2.6

- **新增页脚「已查询 N 人次」**：按设备去重累计，第一次查询成功时 +1，同设备不重复计；默认用公共计数器，自建本机中转时改走中转的 `/count`（数据只在你机器上），也可用 `?count=` 自定义。
- **每日自动抓取时间改到 01:00（北京时间）**：`refresh-data.yml` 的 cron 由 `17 19 * * *` 改为 `0 17 * * *`（UTC）。
- **历史数据模式下「刷新余额」不再假装联网**：按钮改名「重读快照」，提示改为「已重读本地快照（截至 …）」；实时通道下仍是「刷新余额 / 余额已更新」。
- **修掉默认时间范围落到已废弃的「本月」**：没填入学年份默认「全部」，填了默认「开学至今」，四个快选按钮会正确高亮；旧的 `?range=month` 按「全部」处理。
- README 按 1.2.6 现状整篇重写（版本号、目录结构、参数表、隔离说明里的 localStorage 键、已知边界全部与代码对齐）。

### 1.2.5

- **数据更新改成增量，推送不再重传全部**：过去每个房间文件里都写着 `cutoff`（抓取时间戳）和 `balance`（用电/余额），这两样每天都在变，于是 2035 个文件每天全部作废 —— 一次推送 34 MB / 半小时。现在按变化频率拆开：余额挪到每栋一个 `balance.json`，房间文件只留流水。**日更变化的文件从 2049 个降到「14 + 当天有新增充值的房间数」**，实测单栋增量抓 174 间时房间文件写入 0 个。
- **抓取支持增量探测**：先拉最新 20 条与本地比对，没有新增就复用本地流水（`--probe` 可调，`--full` 强制全量）。
- **`queryRoom` 改读 `balance.json`**，旧结构（余额写在房间文件里）仍可回退。
- **局部抓取不再破坏总表**：`--loudong 3` 之前会把 `meta.json` 写成只剩这一栋，现在自动与已有 meta 合并。
- 补回 `meta.json` 的 `timezone`，`balance.json` 的 `cutoff` 统一取 `meta.cutoff`（避免同一天多次 normalize 产生无意义差异）。

### 1.2.4

- **中转检测列表第一行改成「历史数据（离线快照，必可用）」**：真实网络下公共代理经常全红，看着像功能坏了；现在离线台账直接作为第一行候选，点「用它查询」立即切过去。
- **检测文案不再制造焦虑**：全红时提示「这台电脑上没有可用的中转 —— 这不是页面坏了」。
- **抽屉顶部加「房间设置 / 中转通道」两个 tab**：不用先关掉一个再点另一个。
- 失败提示精简（不再出现「数据通道」旧称与超长文案）。

### 1.2.3

- **新增「开学至今」快选**：按入学年份从该年 **9 月 1 日** 查到当前时刻。
- **房间设置里新增「入学年份」输入**（与引导里的年份同步）。
- **手机端适配**：电量四卡窄屏 2×2、输入框 16px 防 iOS 放大、按钮自动平分整行、标签可横向滑动。
- **手机端引导 / 导出预览改成屏幕正中悬浮窗口**（原来贴底）。
- 修掉 `tools/bundle.mjs` 重复执行时不会刷新内联 CSS 的问题。

### 1.2.2

- 修掉历史数据模式下链接直达（`?loudong=3&room=101`）或点「本机用过的房间」解析失败：历史台账的楼栋名是中文（「三号楼」），原来按「取楼栋名里的数字」匹配会拿到空值。
- **修掉「页面偶尔白屏 / 截止时间显示 —」**：GitHub Pages 对同一 IP 的突发并发会随机返回 403，而 ES module 一个文件 403 就整图断链。现在合成 `assets/app.bundle.js`、CSS 内联、`data/index.json` 合并索引、加载失败自动重试；首屏请求从 7 个降到 **3 个**。

### 1.2.1

- **入学年份改为按 9 月 1 日入学计算**（原来是 1 月 1 日）；若该年 9 月 1 日还没到，开始时间退到当前时刻。
- 截止时间统一按北京时间输出（Actions runner 是 UTC），`meta.json` 增加 `timezone: "Asia/Shanghai"`。

### 1.2.0

- **新增历史数据通道并设为默认**：`data/` 按楼栋 → 房间 → 个人分好，打开即查，界面与导出都标注数据截止时间。
- 新增 `tools/crawl.mjs`：一条命令把真实接口的数据抓成本地台账。
- **房间设置改成「先选楼栋、再选房间」两个下拉**，房间只在该楼栋内匹配。
- **中转检测给出可用/不可用的真实原因**，并新增 `relay/endpoints.json` 自建中转登记表。
- 新增「直接用历史数据」一键切换，引导第一步也优先历史数据。

### 1.1.0

- 新增 **4 步使用引导**：选通道 → 填入学年份 → 选楼栋 → 选房间。
- 布局重排：充值记录查询（含三张表）上移到当前房间下面；房间设置、中转通道收进顶栏两个按钮（抽屉面板）。
- 导出按钮移到 tab 行最右侧；导出前先弹预览，且**只导出当前选中的那张表**。

## 目录结构

```
index.html                    页面骨架（CSS 已内联、脚本用 app.bundle.js）
assets/style.css              样式源码（改完跑 tools/bundle.mjs）
assets/api.js                 协议层：RSA 分段加解密、签名、房间解析、充值记录、历史数据读取
assets/xlsx.js                零依赖 xlsx 写入器（ZIP + SpreadsheetML）
assets/export.js              Excel / Markdown 导出与下载
assets/app.js                 页面控制器（状态、渲染、事件、访客计数）
assets/app.bundle.js          上面 4 个模块合成的单文件（页面实际加载的就是它）
data/index.json               首屏合并索引（截止时间 + 每栋房间清单，24 KB）
data/meta.json                历史台账总索引（截止时间 / 楼栋 / 房间 / 记录数）
data/loudong/<楼栋>/index.json      该楼栋房间清单（房号 / 笔数 / 金额）
data/loudong/<楼栋>/balance.json    该楼栋余额快照（每天变，只有 12 个文件）
data/loudong/<楼栋>/room-<房号>.json 单房间：逐笔 + 每人汇总（新增充值才变）
tools/crawl.mjs               抓取真实接口 → 生成本地台账（默认增量，--full 全量）
tools/normalize-data.mjs      规范化房号 + 重建两级索引（可迁移旧结构）
tools/build-index.mjs         生成 data/index.json
tools/bundle.mjs              打单文件 bundle + 内联 CSS（改完 JS/CSS 必须跑一次）
tools/probe-relay.mjs         实测哪些中转可用（16 个公共代理，结论：0 可用）
tools/api-push.mjs            走 GitHub Data API 推送（本机 git push 连不上 github.com 时用）
relay/server.mjs              本地 Node 中转 + 静态服务 + /count 计数接口
relay/worker.js               Cloudflare Worker 中转
relay/deno.ts                 Deno Deploy 中转
relay/endpoints.json          自建中转登记表（检测时一起实测）
relay/wrangler.toml           Worker 配置
.github/workflows/pages.yml        推送即部署
.github/workflows/refresh-data.yml 每天 01:00 抓数据 → 自动提交 → 自动部署
```

> 为什么要打 bundle：ES module 的 `import` 只要有一个文件被 Pages 限流返回 403，整个模块图就崩、页面白屏。合成单文件 + `onerror` 重试后，首屏只剩 **index.html / app.bundle.js / data/index.json** 三个请求。
> 改了 `assets/*.js` 或 `assets/style.css` 之后必须跑一次 `node tools/bundle.mjs`，否则页面加载的还是旧代码。

## 已知边界

- **历史数据是快照**：`data/meta.json` 的 `cutoff` 就是截止时间（当前 `2026-11-10 03:08:47`，北京时间），之后发生的充值不会出现在历史模式里；要最新的就用中转/直连查实时。
- **历史模式下的「重读快照」不会联网**：它只是重新读一次本地文件，数字不会变，这是设计如此，不是按钮失灵。
- 实时接口一次最多取 800 笔充值记录；历史台账抓取时同样按 800 笔上限，更早的记录不在文件里。
- **九号楼几乎没有充值**：149 间里只有 132 笔记录（其余楼栋都是两三万笔），这是真实情况，不是抓取失败。
- 「开学至今 / 近 30 天 / 今年」按**本机时区**计算；「开学至今」的起点固定是入学年份的 **9 月 1 日**。
- 房间编码规则为「楼栋号 + 房间号」拼成 4 位（3 号楼 101 → `3101`）；在「先选楼栋」的下拉里选房间时由页面自动拼好，不用手写。
- 「已查询人次」依赖第三方计数器；它在没人访问时会休眠、唤醒要几秒，也可能哪天停止服务（届时页面显示「—」，其余功能不受影响）。

## 许可

MIT，见 [LICENSE](LICENSE)。数据来自学校缴费平台的公开查询接口，本项目只是把它换成更好用的界面。
