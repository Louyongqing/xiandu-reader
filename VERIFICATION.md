# 验证记录

日期：2026-10-24（Asia/Shanghai）

## PASS

- `npm test`：3 个文件、12 项测试通过。覆盖编码、章节提取、分页字符连续性、字号变化后定位、持久化、去重、删除、EPUB spine 顺序、嵌套 FB2 正文、外部资源路径及压缩包大小限制。
- `npm run format:check`：通过。
- `npm run build`：TypeScript 检查及 Vite 正式构建通过。
- `cargo fmt --check --manifest-path src-tauri/Cargo.toml`：通过。
- `cargo check --offline`：通过。
- `npm run tauri -- build --no-bundle`：Windows x64 release 编译成功。因 crates.io 在当前网络直连超时，构建使用本机 Cargo 缓存及锁文件；Tauri Rust 2.10.3 与 JS API 2.10.x 对齐。
- `npm audit --json`：全部依赖报告 0 个已知漏洞。
- 浏览器正式构建验收通过：本地批量导入、中文编码、去重、错误提示、目录、前后翻页、跨章、书签、主题、字号重排、340 × 560 布局、工作便签、重新载入后的续读、滚动位置恢复、PDF 绘制与缩放、收藏与删除。页面异常 0、请求失败 0、外部请求 0。
- `tests/run-native.ps1`：在真正的 release Tauri / WebView2 窗口中验证启动、置顶权限、翻页、便签与标题切换、文件选择入口、EPUB / MOBI / AZW3 / PDF 导入、PDF 翻页。实际逻辑视口为 420 × 780，本机缩放比例 1.5。页面异常 0、控制台错误 0。
- 实际 MOBI / AZW3 文件通过导入测试；外部格式样本仅保存在系统临时目录，不随交付程序分发。
- 导入脚本 / 外部图片测试确认未执行书中脚本，也没有对书中外部地址发起请求。阅读界面只渲染纯文本；Tauri 没有 shell、文件系统与 HTTP 插件权限。
- 原生测试使用独立临时 WebView2 目录，完成后关闭测试进程并恢复调试环境变量。交付程序未配置远程调试。
- 项目开始时为空目录且不是 Git 仓库。已按最终文件清单检查本次新增代码、配置、测试与产物，没有现存用户代码需要合并；依赖、构建输出和测试证据已在 `.gitignore` 中排除。

## 交付物

- `release/闲读.exe`：8,140,288 bytes。
- SHA-256：`C5696CC3A3775DABE779E3E2175CED61FDA5C8B8221D5426CC38AD39B8B2AE8F`。
- `release/使用说明.txt`。
- 完整源码与开发命令见 `README.md`。

## 证据与边界

- 浏览器记录：`test-results/browser-report.json`；原生记录：`test-results/native-report.json`；截图保存在相同目录。
- 构建会输出 sax 可选 Node stream 被浏览器外部化的提示，实际 Kindle Worker 导入和阅读通过；Windows 链接器创建库 / 导出对象的提示不影响构建成功。
- NOT VERIFIED：其他操作系统和其他 Windows 设备没有运行测试。本次交付是已在当前 Windows 机器验证的 x64 便携程序。
- NOT VERIFIED：NSIS 安装器与代码签名未构建；交付使用便携版。
- 格式支持面向普通未加密小说，不能由样本通过推断所有第三方文件均兼容。电子书文字格式不还原复杂排版和内页插图；PDF 保留原页。

## 自动接章更新（2026-10-24）

- 原因：书籍正文已完整保存在本地，但滚动视图只挂载当前章，滚动事件仅保存偏移；到章尾没有后续正文可读。
- 修复：滚动视图提前挂载下一章，保留可见内容及前后相邻章节，裁剪远处章节时保留可见文字的位置；目录、进度条、书签和续读使用章节内正文偏移。分页模式在空闲时预排下一章，尺寸、字号、行距或字体改变后重新计算，并取消过期预排任务。
- `npm test`：12 项通过；`npm run format:check`、`npm run build`、`git diff --check` 均通过。
- `python tests/reading_continuity.py`：浏览器通过。覆盖滚轮自动跨章、反复前后跨章时文字不跳动、书签跳转、重载后续读、目录和进度条、键盘滚动、工作便签切换、字体/行距/340 × 560 窗口变化后定位，以及分页模式整章拼接与原文逐字一致。
- 连续滚动读完 40 个短章节，所有章节均经过视口，浏览器最多同时挂载 8 章、原生窗口最多 7 章；末章正确停止并显示 100%。
- `python tests/ui_checks.py`：原有导入、阅读、书架和 PDF 流程通过，页面异常、请求失败和外部请求均为 0。
- `$env:CARGO_NET_OFFLINE='true'; npm run tauri -- build --no-bundle`：Windows x64 正式构建通过。
- `./tests/run-native.ps1`：真实 Tauri / WebView2 的原有原生检查和新增连续阅读回归全部通过；页面异常与控制台错误均为 0。测试使用独立临时书架，完成后关闭测试进程。
- 新增正文通过 React 文本节点渲染，未引入 HTML 注入、远程请求、额外权限、依赖或数据库变更。
- 新版程序位于 `src-tauri/target/release/xiandu-reader.exe`。原 `release/` 和 GitHub Release 的 v0.1.0 产物没有替换，本节不改变上方初次交付物的记录。
- 连续阅读证据：`test-results/continuity-browser-report.json`、`test-results/continuity-native-report.json`，对应截图为 `continuous-browser.png`、`continuous-native.png`。
- NOT VERIFIED：其他系统和 Windows 设备未运行本次更新；没有发布新 GitHub Release。
