/**
 * Package composition / integration bootstrap（P01 侧绑定入口）。
 *
 * 把各责任包暴露的跨包端口绑定到全局 runtime，让 package 05（工作台）经
 * `queryTopicLibrary()` / `readMemorySummary()` 拿到真实实现。
 *
 * 幂等：重复调用只绑定一次。
 */

import { bindSourceTransparentCatalogAdapter } from "@/lib/federation/catalogPortAdapter";
import { bindMemoryReadPort, defaultMemoryReadPort } from "@/lib/research/memory";

const runtime = globalThis as unknown as { __packageCompositionBound?: boolean };

export function integratePackages(): void {
  if (runtime.__packageCompositionBound) return;

  // Package 02 → package 05：来源透明目录端口（searchTopic / live|partial|unavailable）
  bindSourceTransparentCatalogAdapter();

  // Package 04 → package 05：私有记忆读端口（search / listInferredPreferences）
  bindMemoryReadPort(defaultMemoryReadPort);

  runtime.__packageCompositionBound = true;
}
