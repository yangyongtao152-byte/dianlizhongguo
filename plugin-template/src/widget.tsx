import type { WidgetProps } from "@nexus/plugin-sdk";

export function SampleWidget({ context, settings }: WidgetProps) {
  return (
    <section aria-label="示例插件">
      <h2>{String(settings.title ?? "示例板块")}</h2>
      <p>插件存储空间：{context.pluginId}</p>
    </section>
  );
}
