/**
 * 队友03 模块目录 — lib/wormhole/
 * 冻结接口：实现 lib/types.ts 中的 WormholeEngine。
 *
 * 待实现文件：
 *   generate.ts — 虫洞候选生成（落点必须有资源或 living book）
 *   score.ts    — novelty/noveltyFit/bridge/quality/diversity/final 评分
 *   paths.ts    — 概念图路径查找
 *
 * 评分公式以设计文档 §10 为准：
 *   final = 0.40*bridge + 0.30*noveltyFit + 0.20*quality + 0.10*diversity
 *   bridge < 0.35 拒绝；无落点资源拒绝。
 *
 * 接入方式：orchestrator.ts 搜索 "INTEGRATION POINT [队友03]"。
 */
export type { WormholeEngine } from "@/lib/types";
