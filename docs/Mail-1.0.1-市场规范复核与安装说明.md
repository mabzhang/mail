# Mail 1.0.1 市场规范复核与安装说明

本次以历史检索确认的最新独立邮件助手 v15（1.0.0-zenx.beta.15）为原始基线，已完成手册改造并追加最新市场规范复核。最新可安装交付为 **Mail 1.0.1**，新 id 为 `mail`。

## 当前规范与核对范围

2026-11-03 在线读取并锁定市场 main 提交 `c60489fc461cb5b20a1eca4adfb6a9977cb5411d`，提交日期 2026-11-02 11:24:56 UTC；封包后再次联网确认 main 未变化。[本次固定版本的官方投稿指南](https://github.com/liliMozi/hana-marketplace/blob/c60489fc461cb5b20a1eca4adfb6a9977cb5411d/CONTRIBUTING.md)。

八份文件逐一按 Git blob SHA 保存并复核：CONTRIBUTING.md、registry.json、approvals.json、.github/PULL_REQUEST_TEMPLATE.md、scripts/extension-market-sync.mjs、index.v2.json、market-export.json、README.md。规范快照见源码验证包的 `market/spec/`。索引按结构、登记冲突与相关字段检查，没有把无关 App 的大段数据重复灌入审查，也没有手改生成索引。

## 差异、处理与仍需完成的投稿步骤

| 项目 | 复核结果与处理 |
|---|---|
| manifest / 身份 | manifestVersion 2；id=mail、name=Mail；manifest、package、entry 版本统一为 1.0.1。 |
| 更高语义版本 | 由本地交付 1.0.0 升至 1.0.1，保留旧 ZIP，不替换同版本产物。 |
| App 图标 / Logo | 随包 256×256 SVG 信封图标；官方 packer 将其规范化成 entry 的 PNG。应用内已统一该 Logo。 |
| 导航与卡片封面 | ui/assets/nav.svg 和 960×600 的 cover.svg 均为本地静态资源；清晰区分导航入口与卡片展示作用；实际解码通过。 |
| 旧公司内容与默认资料 | 未发现旧品牌、个人机器路径或专用邮箱服务商残留；账号、主机、模型、署名、企业域名和快捷短语为空。保留正常 UI、SSL 端口、日历功能与法律声明。 |
| 打包文件名 | 官方输出 app-mail-1.0.1.zip 与 app-mail-1.0.1.entry.json；ZIP 根目录直接是 manifest.json。 |
| entry 不可手改 | 原封保留 `{{BASE_URL}}/app-mail-1.0.1.zip`、大小和 SHA-256，真实下载地址由市场生成。说明中已补明此约束。 |
| registry | 当前登记中尚无 app/mail；准备 kind、id、publisher 一致的登记生成器，实际公开作者仓库仍需填写。未虚构账号。 |
| approvals | 生成器照抄官方 entry 的 archive.sha256，建议 tag=v1.0.1；商店介绍写入静态 readme，不使用远程介绍图片。 |
| PR 材料 | 已按当前模板补齐基本信息、图标、四张界面截图、测试口径、五项能力及外部服务说明；实际仓库 / Release / 安装结果留待真实完成后填写。 |
| 自动同步 / 索引 | 只读规范快照；测试直接导入未修改的官方同步器，在内存生成 fixture 索引。没有手改 index.v2.json。 |
| 正式 Release | 尚未公开发布；实际公开作者仓库、非 draft / prerelease Release 与附件可访问性，仍需在发布后核验。 |
| 市场范围与审核 | 此仓库为 Global 市场；中国大陆市场独立审核。PR 合并及工作流成功才代表上架，本地通过不等于市场批准。 |

## 安装

需要 Hana **1.5.48-beta 或更新版本**。在扩展市场的「已安装」页选择从 ZIP 安装，导入 `app-mail-1.0.1.zip`，核对并批准权限后打开 Mail。安装包已包含运行依赖，无需 npm 安装。

新装后在设置填写自己的邮箱、IMAP / SMTP 主机与端口、授权码，再从 Hana 模型目录选定模型。默认不自动总结、不访问外部天气。邮箱授权码仅在 App 后台本次运行的内存中，后台重载后需重新填写。缓存、草稿、联系人、日历与总结位于 App 私有数据目录，整个目录并未加密。

Mail 使用独立 id，不会自动迁移旧邮件助手的数据。旧 App 与旧交付保留；本次没有安装到你的真实 Hana，也没有改动旧用户数据。

## 权限和外部服务

申请 `app/tools.expose-to-model`、`app/runtime.execute`、`app/runtime.native`、`app/runtime.network`、`app/models.infer`。三项 Agent 工具只读。受管 native Node 后台连接用户填写的 IMAP / SMTP 服务器；Hana HTTP 天气白名单不限制 native 邮箱连接。

选定邮件文字会在主动总结、润色、回复和风格学习时交给用户选择的模型，费用依模型配置。开启自动总结后也会触发推理。Mail 不保存模型 API 密钥。天气默认关闭，启用后访问 www.nmc.cn / api.met.no；主动按 IP 选城市访问 myip.ipip.net，不读取设备定位。邮件远程图片默认阻止，主动加载时访问对应网站。

## 本次已执行的验证

- 207 项业务回归通过，0 失败、0 跳过；74 项脚本/内联模块语法检查通过。
- 10 项 UI 检查通过，页面异常 0；Logo、导航图标和封面实际解码通过；四张隔离环境截图已人工查看。
- 官方最终 ZIP 静态 + isolated smoke 通过：后台入口 loaded，页面 200，SDK 握手 passed，资源失败与渲染异常均为 0。保留一条动态资源无法由静态分析完全证明的通用 warning；文档入口未测。
- Node.js 24.15.0 直接导入当前市场未修改的同步器，13 项离线契约测试全部通过，包括实际 ZIP 大小/hash、身份、文件名、正式 Release 条件、篡改 ZIP、降级和同版本替包拒绝。GitHub API / 附件响应是本地 fixture，未冒充正式 Release 联网检查。
- 登记生成脚本的 fixture 输出通过官方 registry / approvals 解析器；生成器不发布、不安装、不改索引。
- ZIP CRC、安全路径、无符号链接、无用户数据、无测试目录、source/release/archive 字节一致，以及官方 entry hash/size 均通过。
- 依赖与 SDK 保持已验证的原始来源；完整明细见验证回执和逐文件审查报告。

未验证：真实 Hana 安装、真实邮箱收发、真实模型调用、Windows / Linux native 后台、公开仓库与 Release、市场维护者审核。截图展示隔离宿主的空账号状态，后台启动提示不代表真实邮箱已连通。未产生真实发信或模型费用。

## 交付与继续开发

- `app-mail-1.0.1.zip`：可导入 Hana 的官方安装包。
- `app-mail-1.0.1.entry.json`：同次官方打包元数据，投稿时与 ZIP 原样上传为 Release 附件。
- `Mail-1.0.1-源码与验证.zip`：完整运行源码、测试、逐文件审查、官方验证、规范快照、离线契约测试和界面截图。
- `Mail-1.0.1-市场投稿材料.zip`：图标/导航/封面 SVG+PNG、四张截图、静态商店介绍、PR 草稿、登记记录生成脚本和使用说明。

完整投稿步骤见材料包《投稿准备说明》。不要把源码或材料 ZIP 当作 App 安装包，也不要把图片文件提交到市场目录仓库。

安装包：4,396,842 字节，2,013 文件。SHA-256：`cd56cbdcbe8021115febd7cffe0304faaee5b8d69ce6dd0eaea61cbd23bb43be`。
