import fs from "node:fs/promises";
import os from "node:os";

let previousCpu = os.cpus().map((cpu) => ({ ...cpu.times }));

export async function collectSystemMetrics({
  dataPath,
  getGpuInfo = async () => null,
  getGpuFeatureStatus = () => ({}),
} = {}) {
  const current = os.cpus();
  let idleDelta = 0;
  let totalDelta = 0;
  current.forEach((cpu, index) => {
    const previous = previousCpu[index] || cpu.times;
    const total = Object.values(cpu.times).reduce(
      (sum, value) => sum + value,
      0,
    );
    const oldTotal = Object.values(previous).reduce(
      (sum, value) => sum + value,
      0,
    );
    idleDelta += Math.max(0, cpu.times.idle - previous.idle);
    totalDelta += Math.max(0, total - oldTotal);
  });
  previousCpu = current.map((cpu) => ({ ...cpu.times }));

  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  let gpuName = "GPU 型号不可用";
  let gpuStatus = {};
  try {
    const info = await getGpuInfo();
    gpuName =
      info?.gpuDevice?.[0]?.deviceString ||
      info?.gpuDevice?.[0]?.vendorString ||
      gpuName;
  } catch {
    /* GPU information is optional on virtual machines and some drivers. */
  }
  try {
    gpuStatus = getGpuFeatureStatus() || {};
  } catch {
    /* Keep the rest of the telemetry available if GPU probing fails. */
  }

  let diskTotal = 0;
  let diskFree = 0;
  try {
    const disk = await fs.statfs(dataPath || os.homedir());
    diskTotal = Number(disk.blocks) * Number(disk.bsize);
    diskFree = Number(disk.bavail) * Number(disk.bsize);
  } catch {
    /* Disk metrics are optional on unsupported filesystems. */
  }

  return {
    ok: true,
    cpu: Math.max(
      0,
      Math.min(
        100,
        totalDelta > 0 ? Math.round((1 - idleDelta / totalDelta) * 100) : 0,
      ),
    ),
    cpuName: current[0]?.model?.trim() || "CPU",
    cpuCores: current.length,
    memoryUsed: Math.max(0, totalMemory - freeMemory),
    memoryTotal: totalMemory,
    gpuName,
    gpuStatus,
    diskUsed: Math.max(0, diskTotal - diskFree),
    diskTotal,
    uptimeSeconds: Math.round(os.uptime()),
    platform: `${os.type()} ${os.release()} · ${os.arch()}`,
    hostname: os.hostname(),
    checkedAt: Date.now(),
  };
}
