# NEXUS 源码开发与发布手册 v0.4.9

## 1. 技术栈与要求

- Node.js `>=22.13.0`
- npm（使用仓库内 `package-lock.json` 锁定依赖）
- React 19、TypeScript、Vite/Vinext
- Electron 43、electron-builder、NSIS
- Windows 10/11；macOS 构建必须在 macOS 主机上执行

首次安装依赖：

```powershell
npm ci
```

源码包不包含 `node_modules`。`@deepseek-ai/dsh` 会按 lockfile 从 npm 安装；不需要附带本地克隆的 DeepSeek Harness 仓库。

## 2. 目录说明

```text
app/                 React 工作台、板块、主题和前端运行时
desktop/             Electron 主进程、preload、语音和 Harness Supervisor
packages/            Kernel、Plugin SDK、Provider 与 Voice 领域边界
providers/           Provider 适配实现或定义
integrations/        外部系统接入
plugin-template/     独立原生插件模板
schemas/             模块/插件清单 Schema
scripts/             Harness 运行时准备和构建脚本
tests/               Web、桌面布局、Provider、系统监控和 Harness 冒烟测试
docs/                用户、架构、API、模块及发布文档
build/installer.nsh  Windows 安装升级逻辑
```

`dist/`、`dist-desktop/`、`release/`、`harness-runtime-stage/`、`.vinext/`、`.wrangler/` 都是生成目录，不属于源码。

## 3. 本地运行

验证桌面静态资源并启动 Electron：

```powershell
npm run desktop:build:web
npm run desktop:open
```

只调试前端页面时：

```powershell
npm run desktop:dev
```

`desktop:dev` 启动 Vite 开发页面；当前 Electron 主进程默认读取 `dist-desktop/index.html`，因此验证 IPC、系统监控、加密凭据、Harness 和语音时应先执行 `desktop:build:web` 再执行 `desktop:open`。

## 4. 质量检查

提交或发布前执行：

```powershell
npm run lint
npm test
npm run test:desktop-layout
npm run test:provider-chat
npm run test:system-metrics
npm run test:harness
npm run test:harness:packaged
```

桌面布局测试覆盖默认板块无重叠、拖动保存、跨工作空间移动、目标主题继承、万年历黄历、提醒创建、设置中心和原生全屏。Provider 测试覆盖加密 Key 状态、唯一音色入口、真实测试反馈和对话自动滚底。

涉及真实付费 API 的测试应使用专门测试账户或 mock，不要把 Key 写入测试文件。

## 5. Windows 打包

```powershell
npm run desktop:build:win
```

输出位于 `release/`：

```text
NEXUS-Voice-Console-Setup-<version>-x64.exe
```

构建会先生成前端，再把 Harness 所需依赖递归复制到短路径 `harness-runtime-stage/r/node_modules`，最后由 electron-builder 生成 NSIS 安装包。

安装器升级策略：验证目标目录同时存在 NEXUS 主程序和卸载器后，只关闭 NEXUS 自身进程并替换程序目录；不会删除 `%APPDATA%\nexus-voice-console`。正式分发前应配置 Windows 代码签名证书。

## 6. macOS 打包

在 macOS 主机执行：

```bash
npm ci
npm run desktop:build:mac
```

输出 DMG 与 ZIP。正式发布必须使用 Apple Developer ID 签名、Hardened Runtime、麦克风权限说明和 Apple Notarization；Windows 上不能生成可正式分发的签名 macOS 包。

## 7. 版本发布流程

1. 更新 `package.json` 与 `package-lock.json` 版本。
2. 更新界面底部 Kernel 版本和 README 变更记录。
3. 执行全部质量检查。
4. 备份测试机用户数据。
5. 在旧版仍运行时执行新版安装器，验证自动升级和数据保留。
6. 启动两次应用，确认只有一个根主进程实例。
7. 计算安装包 SHA-256，随发布记录交付。

## 8. 密钥与交付安全

打源码包时必须排除：

```text
node_modules/
release/
dist/
dist-desktop/
harness-runtime-stage/
artifacts/
.git/
.env*
*.pem
%APPDATA%/nexus-voice-console/
```

交付前使用 `rg` 检查 `API_KEY`、`Authorization`、`Bearer`、`secrets.json` 等敏感内容。代码中的请求头名称和占位字符串可以保留，真实值不得出现。

## 9. 扩展开发边界

普通看板板块优先使用 `.nexus-module`，开发者只需阅读 [独立模块开发说明](MODULE_SDK_GUIDE.md)。需要后台进程、原生权限、Provider、Agent Adapter 或 Kernel 事件时才开发原生插件，并遵循 [Plugin API](PLUGIN_DEVELOPMENT.md)。插件不得导入 `app/` 内部文件，也不得直接读取其他 Provider 密钥。
