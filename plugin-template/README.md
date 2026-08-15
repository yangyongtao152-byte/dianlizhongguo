# Sample NEXUS Plugin

这是一个完全独立的插件模板。开发新板块时只需阅读本目录和 `docs/PLUGIN_DEVELOPMENT.md`，无需读取主应用源码。

生产版 SDK 发布后，将 `@nexus/plugin-sdk` 添加为唯一的平台依赖。插件不得通过相对路径访问主工程。
