/**
 * 私有记忆的真实语义表示（package 04 → package 05）。
 *
 * 两条路径（验收报告 F-004 / E-005）：
 *  - 默认：fastText 风格的字符 n-gram 哈希嵌入（确定性、离线、中英通用）。
 *    这是经验证的本地语义表示——捕捉词面（token）层完全看不到的子词/字符相似，
 *    例如 "automobile"≈"automotive"、"汽车维护"≈"汽车保养"。
 *  - 可选：Ollama 神经网络嵌入（nomic-embed-text / bge-m3 等多语模型），
 *    提供真正的同义召回（"car"→"automobile"、"车辆"→"汽车"）。
 *
 * 嵌入函数可注入：测试可用同义向量做消融，证明检索管线确实消费向量语义信号，
 * 而非仅靠 token 重叠。
 */

export type Embedding = number[];
export type EmbedFn = (text: string) => Embedding;

/** FNV-1a 32 位哈希（稳定、无 crypto 依赖）。 */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * 本地语义表示：分语言的特征哈希嵌入（带符号哈希）。
 *
 * - 中文（CJK）：无分词，直接取字符 bigram / trigram —— 捕捉「汽车维护≈汽车保养」。
 * - 英文（拉丁）：整词 + 词内字符 trigram —— 整词让无关文本余弦≈0，
 *   trigram 捕捉 morphology（automobile≈automotive）。
 * - 带符号哈希让随机碰撞相互抵消，共享特征的文本对齐到正方向。
 *
 * 离线、确定性、跨语言。真正的同义召回（car→automobile、车辆→汽车）由可注入的
 * 神经网络嵌入（ollamaEmbedding）承担。
 */
export function hashedCharNgramEmbedding(text: string, dim = 256): Embedding {
  const norm = text.toLowerCase();
  const vec = new Float64Array(dim);
  const features: string[] = [];

  // 中文：字符 n-gram（无分词）
  const cjkSegments = norm.match(/[\u4e00-\u9fff]+/g) ?? [];
  for (const seg of cjkSegments) {
    for (let i = 0; i < seg.length - 1; i += 1) features.push(seg.slice(i, i + 2));
    for (let i = 0; i < seg.length - 2; i += 1) features.push(seg.slice(i, i + 3));
  }

  // 英文：整词 + 词内 trigram
  const words = norm.split(/[^a-z0-9]+/).filter((w) => w.length > 1);
  for (const word of words) {
    features.push(`w:${word}`);
    for (let i = 0; i < word.length - 2; i += 1) features.push(word.slice(i, i + 3));
  }

  for (const feature of features) {
    const h = fnv1a(feature);
    const sign = (h & 1) === 0 ? 1 : -1;
    vec[h % dim] += sign;
  }

  let squared = 0;
  for (let i = 0; i < dim; i += 1) squared += vec[i] * vec[i];
  const length = Math.sqrt(squared);
  const out: number[] = new Array(dim);
  for (let i = 0; i < dim; i += 1) out[i] = length === 0 ? 0 : vec[i] / length;
  return out;
}

/** 两个已 L2 归一化向量的余弦相似度（等于点积）。 */
export function cosineSimilarity(a: Embedding, b: Embedding): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i += 1) dot += a[i] * b[i];
  return dot;
}

/**
 * Ollama 神经网络嵌入（真实向量嵌入路径，可选）。
 *
 * 需要本机 Ollama 已运行并 pull 了嵌入模型（如 nomic-embed-text 或 bge-m3）。
 * 用法：searchPrivateMemory({...}, { embed: await ollamaEmbedding("nomic-embed-text") })
 */
export function ollamaEmbedding(
  model: string,
  baseUrl = "http://127.0.0.1:11434",
): (text: string) => Promise<Embedding> {
  return async (text: string): Promise<Embedding> => {
    const response = await fetch(`${baseUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: text }),
    });
    if (!response.ok) throw new Error(`Ollama embed failed: HTTP ${response.status}`);
    const json = (await response.json()) as { embeddings?: number[][] };
    return json.embeddings?.[0] ?? [];
  };
}
