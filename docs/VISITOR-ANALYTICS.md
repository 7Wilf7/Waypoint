# 访问统计

管理页新增「来访」面板：今日浏览、今日估算访客、近 7／30 天浏览与趋势、累计浏览，以及来源、设备、国家／地区、浏览器和页面概况。中英文和四种背景沿用网站偏好。统计失败、未连接与真实零访问分别显示；不会让内容管理等待统计服务。

## 统计口径与隐私

- 浏览量包括公开首页、主要栏目导航、赛事档案，以及实际打开的公开阅读。重复语言渲染不计数；切换到另一篇阅读会计数，但不发送文章标识或标题。它不是微信好友人数。
- 「今日」以 `Asia/Shanghai` 零点为界。独立访客为 Vercel 每日匿名估算；不把每日 UV 相加冒充跨日独立人数。累计使用官方 lifetime count，起点为项目启用统计。
- 管理页及已登录的 owner 不上报。会话核验失败时也不上报。页面重新可见、窗口重新获得焦点或即将计入新的公开路由时先刷新身份，等待期间暂停统计，以覆盖在另一标签登录和内置浏览器缺少焦点事件的情况；不加定时心跳。首次会话读与原管理入口检查共用，此后的有效导航会多一次只读会话请求，匿名请求不读取 Blob；页面切换本身不等待它。隐藏页面待可见后才记录；访问者关闭统计、启用 Do Not Track 或 Global Privacy Control 后停止新上报。
- SDK 仅发送白名单虚拟路径 `/visits/<source>/<page>`，不发送真实查询参数、阅读 ID 或 hash。来源只允许 `direct`、`moments`、`wechat`、`other`。入口来源在当前页面生命周期内保留，不写入浏览器身份记录。
- 管理页「复制朋友圈链接」生成 `/?from=moments`。带标记链接转发后的访问也归入这一来源，不能证明每次访问真的发生在朋友圈。未标记的微信内置浏览器归入「微信内打开」；其它外部页面归入「其他来源」，不会展示个人来源 URL。
- 不要求微信登录，不显示昵称、头像、OpenID、个人访客列表或精确位置。不做跨站追踪。Vercel 本身仍会处理请求、来源页面、大致城市、系统和浏览器版本，并生成每日变化的匿名标识；本站面板仅展示国家级等汇总。不能把这描述为服务商完全不处理 IP 或只收集国家。
- 页脚「隐私与访问统计」解释以上范围，并提供此浏览器的停用选项。唯一新增持久浏览器项为访问偏好 `waypoint-analytics-opt-out`；已有汇总不会因停用而被删除。

普通网页不能从朋友圈静默取得访客昵称和头像。认证服务号的 `snsapi_base` 可在微信规则允许的条件下静默取得 OpenID，仍不等于昵称／头像，也需要账号和授权域名等前提；`snsapi_userinfo` 涉及网页授权。本实现采用匿名概况和分享标记，没有接入微信 OAuth。

## 服务与启用

采用官方 `@vercel/analytics` 和 Web Analytics API，不对每次来访写入私有 Blob。统计接口 `GET /api/manage/analytics?days=7|30` 先通过既有 owner 身份核验，再访问固定项目；不能从浏览器选择项目、团队或任意时间范围。响应 `no-store`，服务端有 60 秒有界内存缓存；命中缓存也重新验证 owner。

Vercel Hobby 当前包含每月 50,000 次团队共享事件、一个月明细窗口；达到免费额度后统计暂停，不自动升级或产生超额事件费用。本实现不依赖付费的 UTM 分组或 custom events。额度、版本及套餐应在实际启用时再次核对。

正式启用前须获准发布、启用项目 Web Analytics，并在 **Production 服务端环境**配置：

| 变量 | 用途 |
| --- | --- |
| `WAYPOINT_ANALYTICS_TOKEN` | 可查询该项目的 Vercel access token，使用合适的最小作用域和有效期；不把本机 CLI 凭据自动复制到部署 |
| `WAYPOINT_ANALYTICS_PROJECT_ID` | 固定的 `prj_…` 项目 ID |
| `WAYPOINT_ANALYTICS_TEAM_ID` | 团队项目的 `team_…` ID；个人项目可省略 |

这些值不会输出到前端。构建只有在 `VERCEL_ENV=production` 且 token／项目 ID 均已配置时才开启前端采集；本地和 Preview 默认关闭。SDK 也不会因为仅打开管理页就注入。缺少配置或项目未启用时，管理页显示「尚未连接」。凭据失效、限流、查询错误或无法可靠还原时间序列时显示读取失败，不伪装成零访问。

启用免费 Web Analytics 需要账号本人在控制台或交互终端确认；当前 CLI 的非交互模式会返回 `confirmation_required`。CLI OAuth 登录也不能创建查询令牌，实际调用返回 `403 Cannot create tokens for this app.`。应由账号本人在 [Access Tokens](https://vercel.com/account/settings/tokens) 创建仅限本项目的令牌，并保存到 Production 的 `WAYPOINT_ANALYTICS_TOKEN`，不要把令牌发到聊天、加入 Git 或替换为本机短期 CLI 凭据。

每次报告最多 14 次官方查询。按小时分成不超过四天的片段，避免 API 的 100 行上限吞掉 30 天趋势；随后按广州日界汇总。其他维度取前 100 项，服务商的剩余项归入「其他」。不读取内容目录或保存访客明细。

今日和期间 PV 统一来自小时趋势；今日 UV 来自独立的每日范围查询。服务商没有跨查询共同快照保证，迟到数据可能让这些估算短暂不同步，不因此把正常报告判成失败。

部署沿用 [公开内容交付约定](PUBLIC-CONTENT.md)：重新核对当前主分支和生产配置，需要重新导出真实公开内容时先批准并暂停写入，不能把本地虚构数据或旧快照推上生产。

## 发布前验证记录

2026-10-10，发布授权前的只读核对显示：现有团队为 Hobby，项目 Web Analytics 尚未启用。以下为独立候选 worktree 的发布前验证，不作为正式发布成功或线上已连接的证明；正式状态须以本次部署和现场查询证据为准。

`npm run check` 覆盖 owner 权限、撤销会话后的缓存拒绝、日期边界、白名单路径、隐藏页面、关闭统计、DNT／GPC、计数错误和语言完整性。实际浏览器使用虚构数据验证桌面、320 像素窄屏、四主题、键盘明细、语言切换、加载失败、空数据、未连接、复制分享链接及退出时清除待返回数据。双标签复验确认：另一标签登录后，原公开页有效导航不再增加记录；退出后恢复匿名计数。

官方 SDK 的实际上报被本地服务接收，已核对当前网址查询参数和阅读 ID 不进入负载。不同本地端口的外部来源复验中，浏览器默认来源策略仅传递来源 origin，SDK 的非空 referrer 保留该 origin；不能把这一样本推论为所有外部网站的 referrer 都会去除路径／查询。服务商可能处理来源页面，已经在页脚隐私说明中披露。

候选的本地证据保存在忽略的 `.local/verification/visitors/`，收尾时可归档到主 checkout 的 `verification/visitor-analytics-release/`。其中截图中的数字是虚构示例；不代表真实访客。发布前本地验证未覆盖成功的线上查询、自然访客数据、微信真机、Safari 和实体手机，不能据此宣称这些检查已通过。

依据：[Vercel 查询 API](https://vercel.com/docs/analytics/web-analytics-api)、[API 分组与上限](https://vercel.com/docs/rest-api/web-analytics/aggregates-page-views)、[隐私](https://vercel.com/docs/analytics/privacy-policy)、[套餐与额度](https://vercel.com/docs/analytics/limits-and-pricing)、[微信网页授权](https://developers.weixin.qq.com/doc/service/guide/h5/auth)。
