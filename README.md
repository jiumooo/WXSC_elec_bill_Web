# WXSC_elec_bill_Web

**[👉 点这里直接查：https://jiumooo.github.io/WXSC_elec_bill_Web/](https://jiumooo.github.io/WXSC_elec_bill_Web/)**

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-已部署-2ea44f?logo=github)](https://jiumooo.github.io/WXSC_elec_bill_Web/) [![版本](https://img.shields.io/badge/version-1.0.0-blue)](https://github.com/jiumooo/WXSC_elec_bill_Web)

无锡科技职业技术学院（WXSC）电费查询的纯静态网页版：查当前房间余额、设置房间、按时间范围查充值记录，并把结果导出成 **Excel** 或 **Markdown**。

它脱胎于 AstrBot 插件 `astrbot_plugin_wxsc_elec_bill`——只保留了真正有用的查询能力（去掉了群通知、定时推送、NapCat 之类的机器人侧功能），改成一个可以直接丢进 **GitHub Pages** 的静态站点。

- **版本**：`1.0.0`
- **形态**：纯前端（HTML + CSS + 原生 ES Module），零依赖、零构建步骤
- **线上地址（点击即用）**：[https://jiumooo.github.io/WXSC_elec_bill_Web/](https://jiumooo.github.io/WXSC_elec_bill_Web/)

---

## 快速开始

打开 **[https://jiumooo.github.io/WXSC_elec_bill_Web/](https://jiumooo.github.io/WXSC_elec_bill_Web/)**，然后：

1. **先给页面一个取数通道**：展开页面底部「数据通道与部署说明」→ 点 **「自动检测可用中转」**，
   页面会并发实测「已保存的地址 / 链接参数 / 本机 Node 中转 / 本站同源 / 公共代理」，
   可用的那几行会变绿，点 **「用它查询」** 就切换过去了（地址只记在本机）。
   都没有可用的话，再按下面 [数据通道](#数据通道重要) 两分钟搭一个。
   也可以直接带参数打开：`?relay=https://你的中转地址`。
2. 填 **楼栋号 + 房间号** → 「保存并重新解析」，余额立刻出来。
   不确定房间号？点 **「查询可用房间」**：不填楼栋号先列出全部楼栋，填了就直接列出该楼所有房间，点一下房间号就自动查询。
3. 选时间范围 → 「查询」→ 在「每人总金额表 / 充值明细 / 个人充值记录」之间切换 → 「导出 Excel」或「导出 Markdown」。

> 学校接口不带 CORS 头，所以线上（GitHub Pages）第一次打开必须先配一个中转地址，这一步是平台限制，不是页面偷懒。

## 功能

| 模块 | 说明 |
| --- | --- |
| **当前房间** | 剩余电量、已用电量、已购电量、已用比例；一键刷新 |
| **房间设置** | 楼栋号 + 房间号（自动拼成完整房间编码去匹配），小区/校区 ID 与数据源可改；**「查询可用房间」** 可列出楼栋与该楼全部房间，点房间号直接查询；记录本机用过的房间，一键切回 |
| **充值记录查询** | 任意时间范围（精确到秒），本月 / 近 30 天 / 今年 / 全部 快选 |
| **每人总金额表** | 按充值账号聚合：笔数、金额、占比、首次/最近时间，可给账号加备注 |
| **充值明细表** | 逐笔时间、金额、备注、账号、记录号、外部订单号 |
| **个人充值记录** | 选一个账号，只看他一个人的流水 |
| **导出** | Excel（`每人汇总` / `充值明细` / `信息` 三张表）与 Markdown（同内容，适合贴群里或存档） |

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

学校接口 `https://pay.wxstc.cn` **没有返回 CORS 响应头**，所以从 `*.github.io` 直接 `fetch` 会被浏览器拦下。页面因此提供三种取数方式（在页面底部「数据通道与部署说明」里切换）：

| 通道 | 适用场景 |
| --- | --- |
| `direct` 直连 | 把页面部署在**同源**环境下（自己的域名 + 反向代理把 `/grdp-ele-third-unite` 转给学校接口），或本机 `node relay/server.mjs` 打开 `http://127.0.0.1:8787/` |
| `relay` 中转 | **GitHub Pages 推荐**。仓库里带了两份中转实现，选一个部署，把地址填进去 |
| `demo` 示例数据 | 只想看界面/导出格式，不发任何真实请求（页面会明确标注「示例数据」） |

中转支持两种接法，页面会自动区分：

- `prefix`（默认）：自建 Worker / Node，把 `/grdp-ele-third-unite/...` 原样转发；
- `query`：公共 CORS 代理（`?url=<编码后的完整地址>`），「自动检测」里的公共代理候选走这条。

### 先试「自动检测可用中转」

页面底部点 **「自动检测可用中转」**，会并发实测这些候选并显示耗时与结果：

| 候选 | 说明 |
| --- | --- |
| 输入框 / 上次保存 / 链接参数 | 你自己填过的地址 |
| `http://127.0.0.1:8787`、`http://localhost:8787` | 本机 Node 中转（跑过 `node relay/server.mjs` 才会绿） |
| 本站同源 | 页面本身不是 `*.github.io` 时才有意义（反向代理部署） |
| allorigins / corsproxy.io / codetabs | 公共代理，实测多半已失效，只当兜底 |

变绿的行点 **「用它查询」** 即切换过去并立刻重查；全红就用下面两种自建方式，5 分钟搞定、免费。

### 方式一：Cloudflare Worker（免费、两步）

**不想装命令行**：登录 Cloudflare → `Workers & Pages` → `Create Worker` → 在页面底部「数据通道」里点 **「复制 Worker 代码」** 拿到全文（或直接打开 [`relay/worker.js`](relay/worker.js)）粘进编辑器 → `Deploy`，
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
?mode=demo                   示例数据
?range=all                   时间范围初值：month / 30d / year / all
```

## 目录结构

```
index.html                  页面骨架
assets/style.css            样式（浅色/深色自动跟随系统）
assets/api.js               协议层：RSA 分段加解密、签名、房间解析、充值记录
assets/xlsx.js              零依赖 xlsx 写入器（ZIP + SpreadsheetML）
assets/export.js            Excel / Markdown 导出与下载
assets/app.js               页面控制器（状态、渲染、事件）
relay/worker.js             Cloudflare Worker 中转
relay/wrangler.toml         Worker 配置
relay/server.mjs            本地 Node 中转 + 静态服务
.github/workflows/pages.yml  GitHub Actions 发布流程
```

## 已知边界

- 充值记录接口一次最多取 800 笔（页面按此拉取后按时间范围过滤）；房间历史超过 800 笔时更早的记录不会出现在结果里。
- 「本月 / 今年」按**本机时区**计算。
- 房间编码规则为「楼栋号 + 房间号」拼成 4 位（3 号楼 101 → `3101`）；匹配不到时页面会列出该楼栋的可用房间示例，照抄即可。

## 许可

MIT，见 [LICENSE](LICENSE)。数据来自学校缴费平台的公开查询接口，本项目只是把它换成更好用的界面。
