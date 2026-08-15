// 独立插件只能从 @nexus/plugin-sdk 导入公开能力。
// 这里展示目标 API；主工程内部实现不属于插件契约。
import { definePlugin } from "@nexus/plugin-sdk";
import { SampleWidget } from "./widget";

export default definePlugin({
  activate(context) {
    const unregisterWidget = context.widgets.register("sample.overview", SampleWidget);
    const unregisterAction = context.actions.register("sample.refresh", async () => {
      await context.events.publish("sample.data.refresh-requested", {});
      return { ok: true };
    });

    return () => {
      unregisterAction();
      unregisterWidget();
    };
  },
});
