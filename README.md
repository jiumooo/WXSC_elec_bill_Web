# WXSC_elec_bill_Web

**[👉 点这里直接查：https://jiumooo.github.io/WXSC_elec_bill_Web/](https://jiumooo.github.io/WXSC_elec_bill_Web/)**

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-已部署-2ea44f?logo=github)](https://jiumooo.github.io/WXSC_elec_bill_Web/) [![版本](https://img.shields.io/badge/version-1.2.4-blue)](https://github.com/jiumooo/WXSC_elec_bill_Web)

无锡科技职业技术学院（WXSC）电费查询的纯静态网页版：查当前房间余额、设置房间、按时间范围查充值记录，并把结果导出成 **Excel** 或 **Markdown**。

它脱胎于 AstrBot 插件 `astrbot_plugin_wxsc_elec_bill`——只保留了真正有用的查询能力（去掉了群通知、定时推送、NapCat 之类的机器人侧功能），改成一个可以直接丢进 **GitHub Pages** 的静态站点。

- **版本**：`1.2.0`
- **形态**：纯前端（HTML + CSS + 原生 ES Module），零依赖、零构建步骤
- **线上地址（点击即用）**：[https://jiumooo.github.io/WXSC_elec_bill_Web/](https://jiumooo.github.io/WXSC_elec_bill_Web/)
- **开箱能查**：仓库自带按楼栋 / 房间/ 个人分好的**离线历史台账**（`data/`），不用中转、不用联网查询

---

## 快速开始

打开 **[https://jiumooo.github.io/WXSC_elec_bill_Web/](https://jiumooo.github.io/WXSC_elec_bill_Web/)**，第一次会弹出 **4 步使用引导**，跟着点完就能查到自己的房间：

1. **选通道**：点「**直接用历史数据**」最快——仓库里已经放好真实台账，离线可查，页面会写明数据截至时间。
   想查「此刻」的实时数据，再点「检测可用中转」自建一条（见 [数据通道](#数据通道重要)）。
2. **填入学年份**：比如 2022，查询开始时间会自动设成 `2022-09-01 00:00:00`（**按 9 月 1 日入学算**）。
3. **选楼栋**：下拉里是全部楼栋和各自房间数，选你住的那栋。
4. **选房间**：房间下拉会按所选楼栋自动匹配，选好即自动查询并退出引导，直接进主界面。

之后想再进引导：页面底部 **「重新查看使用引导」**；想跳过：引导右上角「跳过」。
顶栏右侧跟着版本号的两个按钮是 **「房间设置」** 和 **「中转通道」**，点开是抽屉面板，改完关掉即可。

主界面上半部分是 **当前房间**（余额），下半部分是 **充值记录查询**：选时间范围 → 「查询」→
在「每人总金额表 / 充值明细表 / 个人充值记录」之间切换 → 点右上角 **「导出 Excel」/「导出 Markdown」**。
导出前会先弹 **预览**，确认内容（表头、行数、文件名）后再点「确认导出」——**当前是哪张表，预览和导出的就是哪张表**。

> 学校接口不带 CORS 头，`*.github.io` 上要查**实时**数据必须先有一个中转（平台限制，不是页面偷懒）；
> 只查历史台账则完全不需要中转。

## 功能

| 模块 | 说明 |
| --- | --- |
| **使用引导** | 首次进入 4 步走完：选通道 → 填入学年份 → 选楼栋 → 选房间，选完自动查询并退出引导 |
| **当前房间** | 剩余电量、已用电量、已购电量、已用比例；一键刷新 |
| **房间设置**（顶栏按钮） | **楼栋下拉 → 房间下拉**（先选楼栋，房间只在该楼内匹配）；小区/校区 ID 与数据源收在「高级」里；记录本机用过的房间，一键切回 |
| **中转通道**（顶栏按钮） | 「直接用历史数据」「自动检测可用中转」、手动填地址、复制 Worker 代码、历史/中转/直连三选一 |
| **充值记录查询** | 任意时间范围（精确到秒），开学至今 / 近 30 天 / 今年 / 全部 快选（「开学至今」= 入学年份 9 月 1 日至今） |
| **每人总金额表** | 按充值账号聚合：笔数、金额、占比、首次/最近时间，可给账号加备注 |
| **充值明细表** | 逐笔时间、金额、备注、账号、记录号、外部订单号 |
| **个人充值记录** | 选一个账号，只看他一个人的流水（合计与笔数在表尾） |
| **导出** | 先预览再导出；单表导出 Excel 就是「该表 + 信息」两张 sheet，Markdown 同内容；文件名形如 `充值台账-三号楼_3101_室-每人汇总-2022-01-01~2026-11-07-20261107-031758.xlsx` |

备注（给充值的账号起个名字，比如「张三」「隔壁老王」）**只写在你自己的浏览器 `localStorage`**（键名 `wxsc.elec.notes.v1.r<loudongId>_<roomId>`），不会上传到页面所在站点、不会进中转、不会进任何服务器；只有你点「导出」时才会写进你自己下载的那份文件里。换电脑、换浏览器、清站点数据都会看不到，这是预期行为。

## 多用户隔离

页面没有任何后端会话，这是隔离性的来源：

1. 每次查询只携带**你自己这一页**填写的房间参数（`xiaoquId / datasource / loudongId / roomId`），请求之间不共享任何状态。
2. 查询结果只活在当前标签页的内存里，**不写 localStorage、不写共享缓存、不做 Service Worker 缓存**。
3. `localStorage` 只保存三项本机偏好：房间设置、数据通道、账号备注——都在你自己的浏览器里。
4. 中转（Cloudflare Worker / 本地 Node）是**无状态转发**：不落盘、不记录请求体、不区分用户、不做响应缓存。

因此 A 同学查 3 号楼 101、B 同学同时查 5 号楼 202 时，两个请求各走各的链路，谁也看不到谁的数据。

> 同一台电脑同一个浏览器开两个标签页，会共用「房间设置」这项偏好（因为都存在同一份 localStorage）。结果列表仍然是各自独立的，互不覆盖。

## 数据通道（重要）

学校接口 `https://pay.wxstc.cn` **没有返回 CORS 响应头**，所以从 `*.github.io` 直接 `fetch` 会被浏览器拦下。页面提供三种取数方式（点顶栏 **「中转通道」** 切换）：

| 通道 | 适用场景 |
| --- | --- |
| `history` 历史数据（默认） | **打开就能查**。读仓库里的 `data/`（真实台账离线快照），不发任何请求、不需要中转；页面会标注数据截至时间 |
| `direct` 直连 | 把页面部署在**同源**环境下（自己的域名 + 反向代理把 `/grdp-ele-third-unite` 转给学校接口），或本机 `node relay/server.mjs` 打开 `http://127.0.0.1:8787/` |
| `relay` 中转 | 查**实时**数据用。仓库里带了两份中转实现，选一个部署，把地址填进去 |

### 历史数据（免查询，默认通道）

`data/` 是爬虫按真实接口抓下来的台账，按**楼栋 → 房间 → 个人**三级存放：

```
data/index.json                      首屏用的合并索引：截止时间 + 每栋房间清单（页面只发 1 个请求）
data/meta.json                       总索引：截止时间、楼栋数、房间数、记录数
data/loudong/3/index.json            3 号楼的房间清单（每间的笔数/金额/余额）
data/loudong/3/room-101.json         3 号楼 101 室：余额快照 + 逐笔充值 + 按人汇总
```

> 为什么要 `data/index.json`：GitHub Pages（Fastly）对同一 IP 的**突发并发**请求会短暂返回 403，页面原来一次拉 `meta + 12 个楼栋索引` 会被限流；合并成一个 24 KB 的索引后首屏只发 1 个请求，且代码里带 403/429 退避重试。

- 每个房间文件里都写明 `cutoff`（**数据截止时间**）与 `balance`（已用/已购/剩余），逐笔记录带 `buyer`（充值账号），并附 `persons`（每人笔数、金额）——所以「精细到个人」是离线也能看的。
- 当前已收录：**12 栋 / 2035 间 / 295696 笔**，数据截止 **2026-11-07 03:51:58**（共 2048 个 JSON，约 28.6 MB）。
- 页面在历史模式下**只读这些静态文件**，不发任何请求，因此人人可用、互不影响，也不会有任何中转依赖。
- 重新抓取（在学校网络里跑，会写满 `data/`）：

```bash
node tools/crawl.mjs --concurrency 6           # 全量 2035 间，约 15 分钟
node tools/crawl.mjs --loudong 3 --limit 20    # 只抓 3 号楼前 20 间，试用
node tools/normalize-data.mjs                  # 把「房间号=完整编码」统一成房号，并重建两个索引
node tools/build-index.mjs                     # 合并成 data/index.json（页面首屏只读它）
```

- 抓完把 `data/` 一起提交即可，Actions 会自动带上（见 `.github/workflows/pages.yml`）。

**不想自己抓？已经配好每天自动刷新**：`.github/workflows/refresh-data.yml` 每天 UTC 19:17（北京时间 03:17）在 GitHub 的机器上直连上游跑一遍 `crawl → normalize`，有变化就提交，随后自动部署。
因为跑在 GitHub 服务器上，**这一步也不需要任何中转**（已实测：runner 直连 `pay.wxstc.cn` 正常，2 间房 3 秒抓完 477 笔）。
想立刻刷一次：Actions → **Refresh history data** → `Run workflow`（可填 `loudong` / `limit` 只抓一部分试跑）。

中转支持两种接法，页面会自动区分：

- `prefix`（默认）：自建 Worker / Node，把 `/grdp-ele-third-unite/...` 原样转发；
- `query`：公共 CORS 代理（`?url=<编码后的完整地址>`），「自动检测」里的公共代理候选走这条。

### 先试「自动检测可用中转」

页面顶栏 **「中转通道」** → **「自动检测可用中转」**，会并发实测这些候选并显示耗时与结果。
**第一行永远是「历史数据（离线快照，必可用）」**——它不需要任何网络，点「用它查询」立即切过去，所以检测结果不会出现「一条都没有」的死局：

| 候选 | 说明 |
| --- | --- |
| **历史数据（离线快照，必可用）** | 仓库里的 `data/` 台账，恒可用；当前正在用它时会标「正在使用」 |
| 输入框 / 上次保存 / 链接参数 | 你自己填过的地址 |
| `http://127.0.0.1:8787`、`http://localhost:8787` | 本机 Node 中转（跑过 `node relay/server.mjs` 才会绿） |
| `http://127.0.0.1:8788` | 本机 Deno 中转（跑过 `deno run --allow-net relay/deno.ts` 才会绿） |
| `relay/endpoints.json` 里登记的地址 | 社区自建中转登记表，欢迎 PR 增行 |
| 本站同源 | 页面本身不是 `*.github.io` 时才有意义（反向代理部署） |
| allorigins / codetabs | 公共代理兜底。**2026 年起基本只支持 GET**，上游只认 POST，检测多半全红，属正常 |

变绿的行点 **「用它查询」** 即切换过去并立刻重查；只剩历史数据一条也不影响使用，想查「此刻」的实时数据再用下面三种自建方式（都免费，5 分钟）。

### 三种自建中转（任选一种）

| 方式 | 需要什么 | 适合谁 | 文件 |
| --- | --- | --- | --- |
| 本地 Node | 有 Node 就行，零依赖 | 只在自己电脑上用 | [`relay/server.mjs`](relay/server.mjs) |
| Cloudflare Worker | 一个免费 CF 账号（网页点两下） | 想给同学一起用 | [`relay/worker.js`](relay/worker.js) |
| Deno Deploy | 一个免费 Deno 账号（网页粘代码） | 不想装任何东西 | [`relay/deno.ts`](relay/deno.ts) |

三者的接口完全一致（都把 `/grdp-ele-third-unite/...` 原样转发），所以页面不用改，填地址就行。

### 方式一：Cloudflare Worker（免费、两步）

**不想装命令行**：登录 Cloudflare → `Workers & Pages` → `Create Worker` → 在页面顶栏「中转通道」里点 **「复制 Worker 代码」** 拿到全文（或直接打开 [`relay/worker.js`](relay/worker.js)）粘进编辑器 → `Deploy`，
得到 `https://xxx.workers.dev`，填进页面「中转地址」点「保存并测试」。

**或者用 wrangler**：

```bash
cd relay
npx wrangler deploy
# 输出形如 https://wxsc-elec-relay.<你的账号>.workers.dev
```

把该地址填进页面的「中转地址」，点「保存并测试」。也可直接带参数打开：
**[https://jiumooo.github.io/WXSC_elec_bill_Web/?relay=https://wxsc-elec-relay.xxx.workers.dev](https://jiumooo.github.io/WXSC_elec_bill_Web/?relay=https://wxsc-elec-relay.xxx.workers.dev)**（把域名换成你自己的）

可选变量（`relay/wrangler.toml`）：`ALLOWED_ORIGIN` 收紧到只允许你的站点，`UPSTREAM_HOST` 换上游。

### 方式二：本地 Node 中转（本地完整跑通，零依赖）

```bash
node relay/server.mjs
# 静态站点  http://127.0.0.1:8787/
# 一键开页  http://127.0.0.1:8787/?relay=http://127.0.0.1:8787
```

它同时发布仓库根目录的静态文件并转发 `/grdp-ele-third-unite/*`，所以本地看到的效果和线上一致。

### 方式三：Deno Deploy（不想装东西就选这个）

装过 Deno 的可以在本机直接跑（和 Node 版并存，端口 8788）：

```bash
deno run --allow-net relay/deno.ts
# 页面中转地址填 http://127.0.0.1:8788
```

想挂到公网：打开 [dash.deno.com](https://dash.deno.com) → `New Playground` → 把 [`relay/deno.ts`](relay/deno.ts) 全文粘进去 → `Save & Deploy`，
拿到 `https://<name>.deno.dev` 填进「中转地址」即可（免费额度对几个人查询完全够）。

### 部署页面到 GitHub Pages

线上站点：**[https://jiumooo.github.io/WXSC_elec_bill_Web/](https://jiumooo.github.io/WXSC_elec_bill_Web/)**

仓库已开启 Pages，发布方式是 **GitHub Actions**（`.github/workflows/pages.yml`）：推到 `main` 就自动部署，
构建失败会在 Actions 页面写明原因，不会像老的分支发布那样整站变成 503。改完直接推：

```bash
git push
```

新克隆一份时手动开启：`Settings → Pages → Build and deployment → Source: GitHub Actions`。

## 线上打不开时

历史上用「分支发布（legacy builder）」时偶发过一次：构建记录被写成 `Page build failed.`（duration 0），
产物不更新，整站返回 GitHub 的 503 `Unicorn!` 页，而同时间别的 `*.github.io` 站点正常——与本仓库内容无关。
现在发布已切到 Actions：`git push` 后到 Actions 页面看 `Deploy to GitHub Pages` 是否成功，成功即上线。

## 直接带参数打开

```
?room=101&loudong=3          指定房间（自动保存为本机设置）
?relay=https://...           指定中转地址
?mode=history                历史数据（?mode=demo 同义，兼容旧链接）
?range=all                   时间范围初值：month / 30d / year / all
?guide=1                     强制打开使用引导（?guide=0 强制不弹）
```

## 更新日志

### 1.2.4

- **中转检测列表的第一行改成「历史数据（离线快照，必可用）」**：以前点「自动检测可用中转」在真实网络下经常 5 条全红（公共代理确实都失效了），看着像功能坏了。现在离线台账直接作为第一行的候选，标「恒可用 · 离线」，点它右边的「用它查询」立即切过去；检测结果也会写明「也可以直接用第一行的历史数据」。
- **检测文案不再制造焦虑**：全红时提示「这台电脑上没有可用的中转 —— 这不是页面坏了：第一行的「历史数据」不要网络、随时能查」，并给出自建中转的两步命令。
- **抽屉顶部加「房间设置 / 中转通道」两个 tab**：开着抽屉就能在两个面板之间切换，不用先关掉再点另一个（原来抽屉遮罩会挡住顶栏按钮）。

### 1.2.3

- **新增「开学至今」快选**：充值记录查询里原来的「本月」换成「开学至今」——按你在「房间设置 / 引导」里填的入学年份，从该年 **9 月 1 日** 一直查到当前时刻（填 2022 就是 `2022-09-01 00:00:00 ~ 现在`）。没填年份时会提示并直接打开房间设置，填完再点即可。
- **房间设置里新增「入学年份」输入**（与引导里的年份同步），换宿舍/复学后随时改。
- **手机端适配**：电量四卡在窄屏自动变 2×2，输入框字号 16px（iOS 聚焦不再放大整页），筛选按钮/导出按钮自动平分整行，三个表头标签改成可横向滑动，表格与备注输入框按屏幕缩放，`380px` 以下再收成单列。
- **手机端引导/导出预览改成屏幕正中的悬浮窗口**（原来是贴底抽屉），上下留白、圆角、内容可滚；弹窗现在会压暗背景，点遮罩可关掉导出预览。
- 修掉 `tools/bundle.mjs` 重复执行时不会刷新内联 CSS 的问题（改样式后重新 `node tools/bundle.mjs` 现在一定生效）。

### 1.2.2

- 修掉历史数据模式下用链接直达（`?loudong=3&room=101`）或点「本机用过的房间」解析失败的问题：历史台账的楼栋名是中文（「三号楼」），原来按「取楼栋名里的数字」匹配楼栋会拿到空值，现在同时按楼栋编号匹配。
- **修掉「页面偶尔白屏/截止时间显示 —」**：GitHub Pages（Fastly）会对同一 IP 的突发并发请求随机返回 403，原来首屏要拉 `meta.json + 12 个楼栋索引 + 4 个 JS`，只要有一个 JS 被 403，ES module 的 import 就断链、整页不执行。现在：①`tools/bundle.mjs` 把 4 个模块合成 `assets/app.bundle.js`、CSS 内联进 `index.html`；②`data/index.json` 把楼栋清单合并成一个 24 KB 文件；③脚本加载失败自动重试 4 次，数据读取对 403/429/5xx 退避重试 5 次。首屏请求从 7 个降到 **3 个**。

### 1.2.1

- **入学年份改为按 9 月 1 日入学计算**：引导里填 2022，查询开始时间自动设成 `2022-09-01 00:00:00`（原来是该年 1 月 1 日）；引导步骤说明、提示文案、README 同步更新。
- 若填的学年还没到 9 月 1 日（例如现在填 2027），开始时间自动退到当前时刻，不会出现「开始晚于结束」的空范围。
- 截止时间统一按北京时间输出（GitHub Actions 的 runner 是 UTC，之前抓出来的时间会差 8 小时），`data/meta.json` 增加 `timezone: "Asia/Shanghai"`。

### 1.2.0

- **新增历史数据通道并设为默认**：`data/` 里是按楼栋 → 房间 → 个人分好的真实台账（含余额快照、逐笔记录、每人汇总），打开页面即可查询，界面与导出都标注**数据截止时间**；不需要任何中转。
- 新增 `tools/crawl.mjs`：一条命令把真实接口的数据抓成本地台账（支持 `--loudong/--limit/--concurrency`）。
- **房间设置改成「先选楼栋、再选房间」两个下拉**，房间只在该楼栋内匹配；修掉旧版「点查询可用房间后楼栋/房间混在一个网格里」的问题。
- **中转检测给出可用/不可用的真实原因**：公共 CORS 代理 2026 年起基本只支持 GET（上游只认 POST），检测会显示「不可用 · 原因」并直接引导到「历史数据」或自建；新增 `relay/endpoints.json` 自建中转登记表。
- 新增「直接用历史数据」一键切换；引导第一步也改成优先历史数据，`?mode=demo` 仍然可用（自动映射到历史数据）。

### 1.1.0

- 新增 **4 步使用引导**：选通道 → 填入学年份（**按 9 月 1 日入学算**，自动把开始时间设成该年 9 月 1 日 00:00:00）→ 选楼栋 → 选房间，选完自动查询并退出引导。
- 布局重排：**充值记录查询**（含三张表）上移到 **当前房间** 下面；三张表与导出按钮合并到同一张卡片。
- **房间设置**、**中转通道** 收进顶栏版本号右侧的两个按钮（抽屉面板），主页面不再铺开；顶部 chip 去掉，只留版本号。
- 「导出 Excel / 导出 Markdown」移到 tab 行最右侧；导出前先弹 **预览**，确认后才下载，且**导出当前选中的那张表**。
- 单表导出 Excel 只生成「该表 + 信息」两张 sheet（旧版固定三张全出）；文件名压缩为 `房间-视图-起~止-时间戳`。

## 目录结构

```
index.html                  页面骨架（CSS 已内联、脚本用 app.bundle.js）
assets/style.css            样式源码（浅色/深色自动跟随系统，改完跑 tools/bundle.mjs）
assets/api.js               协议层：RSA 分段加解密、签名、房间解析、充值记录、历史数据读取
assets/xlsx.js              零依赖 xlsx 写入器（ZIP + SpreadsheetML）
assets/export.js            Excel / Markdown 导出与下载
assets/app.js               页面控制器（状态、渲染、事件）
assets/app.bundle.js        上面 4 个模块合成的单文件（页面实际加载的就是它）
data/index.json             首屏合并索引（截止时间 + 每栋房间清单，24 KB）
data/meta.json              历史台账总索引（截止时间 / 楼栋 / 房间 / 记录数）
data/loudong/<楼栋>/index.json      该楼栋房间清单
data/loudong/<楼栋>/room-<房号>.json 单房间：余额快照 + 逐笔 + 每人汇总
tools/crawl.mjs             抓取真实接口 → 生成本地台账
tools/normalize-data.mjs    规范化房号 + 重建两级索引
tools/build-index.mjs       生成 data/index.json
tools/bundle.mjs            打单文件 bundle + 内联 CSS（改完 JS/CSS 必须跑一次）
relay/worker.js             Cloudflare Worker 中转
relay/wrangler.toml         Worker 配置
relay/server.mjs            本地 Node 中转 + 静态服务
relay/endpoints.json        自建中转登记表（检测时一起实测）
.github/workflows/pages.yml  GitHub Actions 发布流程
```

> 为什么要打 bundle：ES module 的 `import` 只要有一个文件被 Pages 限流返回 403，整个模块图就崩、页面白屏。合成单文件 + `onerror` 重试后，首屏只剩 **index.html / app.bundle.js / data/index.json** 三个请求。

## 已知边界

- **历史数据是快照**：`data/meta.json` 的 `cutoff` 就是截止时间，之后发生的充值不会出现在历史模式里；要最新的就用中转/直连查实时。
- 实时接口一次最多取 800 笔充值记录；历史台账抓取时同样按 800 笔上限，更早的记录不在文件里。
- 「开学至今 / 近 30 天 / 今年」按**本机时区**计算；「开学至今」的起点固定是入学年份的 **9 月 1 日**。
- 房间编码规则为「楼栋号 + 房间号」拼成 4 位（3 号楼 101 → `3101`）；在「先选楼栋」的下拉里选房间时由页面自动拼好，不用手写。

## 许可

MIT，见 [LICENSE](LICENSE)。数据来自学校缴费平台的公开查询接口，本项目只是把它换成更好用的界面。
