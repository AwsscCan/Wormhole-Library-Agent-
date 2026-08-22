/**
 * 责任包02 实验脚本：排序矩阵 + 隐私状态矩阵
 *
 * 运行方式：
 *   node node_modules/tsx/dist/cli.mjs scripts/experiment-ranking.ts
 */

import { seedCatalogAdapter } from "@/lib/catalog/seedCatalogAdapter";
import { livingLibraryService } from "@/lib/matching/livingLibrary";
import { canShowLivingBook, toLivingBookCard, toPersonMatchCard } from "@/lib/matching/consent";
import seedBooks from "@/data/seed-living-books.json";
import type { TaskType, Level, LanguagePref } from "@/lib/types";

async function main() {
  // ─────────────────────────────────────────────
  // 实验一：TaskType 对排序的影响
  // ─────────────────────────────────────────────
  console.log("=".repeat(60));
  console.log("实验一：TaskType 对排序的影响");
  console.log("固定条件：概念=c_ai_agent，level=undergraduate，language=any，Top-4");
  console.log("=".repeat(60));

  const taskTypes: TaskType[] = ["course", "project", "research", "exam"];
  for (const taskType of taskTypes) {
    const results = await seedCatalogAdapter.searchCatalog({
      query: "",
      conceptIds: ["c_ai_agent"],
      taskType,
      level: "undergraduate" as Level,
      language: "any" as LanguagePref,
      limit: 4,
    });
    console.log(`\ntaskType = ${taskType}:`);
    results.forEach((r, i) => {
      console.log(`  ${i + 1}. [${r.type}] ${r.title.slice(0, 40).padEnd(40)} | ${r.language} | ${r.difficulty}`);
    });
  }

  // ─────────────────────────────────────────────
  // 实验二：Language 偏好对排序的影响
  // ─────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("实验二：Language 偏好对排序的影响");
  console.log("固定条件：概念=c_ai_agent，task=research，level=graduate，Top-4");
  console.log("=".repeat(60));

  const languages: LanguagePref[] = ["zh", "en", "any"];
  for (const language of languages) {
    const results = await seedCatalogAdapter.searchCatalog({
      query: "",
      conceptIds: ["c_ai_agent"],
      taskType: "research" as TaskType,
      level: "graduate" as Level,
      language,
      limit: 4,
    });
    console.log(`\nlanguage = ${language}:`);
    results.forEach((r, i) => {
      console.log(`  ${i + 1}. [${r.language}] ${r.title.slice(0, 40).padEnd(40)} | ${r.type} | ${r.difficulty}`);
    });
  }

  // ─────────────────────────────────────────────
  // 实验三：隐私状态对 Living Library 展示的影响
  // ─────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("实验三：隐私状态对 Living Library 展示的影响");
  console.log("数据：7 个虚构人物，覆盖全部 4 种 consentState");
  console.log("=".repeat(60));

  console.log("\n所有人物的 consent 处理结果：\n");
  console.log(
    "  人物ID".padEnd(26) +
    "consentState".padEnd(32) +
    "推荐可见  " +
    "card.mode     " +
    "matchCard.mode"
  );
  console.log("  " + "-".repeat(100));

  for (const lb of (seedBooks as any).livingBooks) {
    const profile = {
      id: lb.id,
      displayMode: lb.displayMode,
      displayName: lb.displayName ?? undefined,
      headline: lb.headline,
      consentState: lb.consentState,
      conceptIds: lb.conceptIds,
      expertiseLevel: lb.expertiseLevel,
      willingTypes: lb.willingTypes,
      availabilityNote: lb.availabilityNote,
    };

    const visible = canShowLivingBook(profile);
    const card = visible ? toLivingBookCard(profile) : null;
    const matchCard = visible ? toPersonMatchCard(profile, ["bridge"], "reason", 0.8) : null;

    const visibleStr = visible ? "✅ 可见  " : "❌ 过滤  ";
    const cardMode = card ? card.displayMode.padEnd(14) : "—".padEnd(14);
    const matchMode = matchCard ? matchCard.displayMode : "—";

    console.log(
      `  ${lb.id.padEnd(24)}${lb.consentState.padEnd(32)}${visibleStr}  ${cardMode}${matchMode}`
    );
  }

  // 边界用例演示
  console.log("\n--- 边界用例 ---");

  // 边界1：searchLivingBooks 全部 private/paused
  const emptyResult = await livingLibraryService.searchLivingBooks({
    conceptIds: [],
    limit: 5,
  });
  const filteredCount = emptyResult.filter(
    (c) => c.displayMode === "anonymous" || c.displayMode === "named"
  ).length;
  console.log(`\n边界1：searchLivingBooks（空概念）返回 ${emptyResult.length} 人（其中 private/paused 已自动过滤）`);

  // 边界2：anonymous 人物的 card 不含 displayName
  const anonProfile = (seedBooks as any).livingBooks.find(
    (b: any) => b.consentState === "discoverable_anonymous"
  );
  if (anonProfile) {
    const anonCard = toLivingBookCard({
      id: anonProfile.id,
      displayMode: anonProfile.displayMode,
      displayName: anonProfile.displayName ?? undefined,
      headline: anonProfile.headline,
      consentState: anonProfile.consentState,
      conceptIds: anonProfile.conceptIds,
      expertiseLevel: anonProfile.expertiseLevel,
      willingTypes: anonProfile.willingTypes,
      availabilityNote: anonProfile.availabilityNote,
    });
    console.log(`边界2：anonymous 人物 card.displayName = ${anonCard.displayName ?? "undefined（正确，未泄露）"}`);
  }

  // 边界3：named 人物的 PersonMatchCard 强制匿名
  const namedProfile = (seedBooks as any).livingBooks.find(
    (b: any) => b.consentState === "discoverable_named"
  );
  if (namedProfile) {
    const matchC = toPersonMatchCard(
      {
        id: namedProfile.id,
        displayMode: namedProfile.displayMode,
        displayName: namedProfile.displayName ?? undefined,
        headline: namedProfile.headline,
        consentState: namedProfile.consentState,
        conceptIds: namedProfile.conceptIds,
        expertiseLevel: namedProfile.expertiseLevel,
        willingTypes: namedProfile.willingTypes,
        availabilityNote: namedProfile.availabilityNote,
      },
      ["bridge"],
      "reason",
      0.9,
    );
    console.log(
      `边界3：named 人物 PersonMatchCard.displayMode = ${matchC.displayMode}（推荐卡联系前强制匿名）`,
    );
  }

  console.log("\n✅ 实验脚本执行完毕");
}

main().catch((err) => {
  console.error("脚本执行失败：", err);
  process.exit(1);
});
