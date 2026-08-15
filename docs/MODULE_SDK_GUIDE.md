# NEXUS 独立板块开发规范 v1

后续开发者不需要读取主体项目。开发、测试并交付一个 UTF-8 JSON 文件，扩展名为 .nexus-module；用户在“独立模块中心”上传后即可安装或按 ID 原位更新。

## 模块包结构

    {
      "schemaVersion": "1",
      "manifest": {
        "id": "com.example.weather",
        "name": "Weather Module",
        "version": "1.0.0",
        "title": "实时天气",
        "source": "OPEN API",
        "description": "模块说明",
        "defaultSize": { "w": 4, "h": 4 },
        "permissions": ["network:https://api.example.com"],
        "actions": ["weather.refresh"]
      },
      "view": {
        "html": "<!doctype html><html>...</html>"
      }
    }

必填项：schemaVersion、manifest.id、manifest.name、manifest.version、manifest.title、manifest.defaultSize、view.html。

限制：

- 文件不超过 2 MB。
- defaultSize.w/h 为 2–12 的整数。
- manifest.id 只能包含字母、数字、点、下划线和连字符；更新时必须保持不变。
- 密钥绝不能写入模块包。

## 隔离运行

view.html 在不带同源权限的 sandbox iframe 中运行，不能读取 Node、Electron、父页面 DOM、本机文件或主项目状态。模块通过 postMessage 与主体通信：

    addEventListener("message", (event) => {
      if (event.data?.type === "nexus.context") {
        const { theme, locale, accent, width, height } = event.data.payload;
      }
    });

    parent.postMessage(
      { type: "nexus.action", action: "weather.refresh", payload: {} },
      "*"
    );

模块只能请求 manifest.actions 已声明的动作。主体负责权限确认、密钥代理、审计、超时和错误回传。

## 自适应要求

    html, body, #app {
      width: 100%;
      height: 100%;
      margin: 0;
      overflow: auto;
    }

- 包含 viewport meta。
- 支持 320px 最小宽度。
- 不使用固定窗口尺寸。
- 内容显示不全时必须允许纵向滚动。
- 优先使用 --nexus-bg、--nexus-text、--nexus-muted、--nexus-accent。
- 位置、尺寸、锁定、悬浮、三层级由主体统一管理。

## 安装和更新

1. 在独立仓库开发板块 HTML。
2. 将 HTML 内联到 view.html，静态小资源使用 data URL。
3. 保存为 模块名.nexus-module。
4. 在 NEXUS 底部选择“独立模块”→“选择模块包”。
5. 在“添加板块”中把新模块加入任意工作空间。
6. 更新时提升 version，保持 manifest.id，重新上传即可。

模块中心内置“复制说明”“下载说明”“下载模板”三个按钮，可直接取得本规范和可运行的最小模块。
