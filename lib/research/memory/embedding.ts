/**
 * 私有记忆的语义表示（package 04 → package 05）。
 *
 * 默认走真实向量 provider（本地 Ollama 嵌入模型，如 nomic-embed-text / bge-m3），
 * 能召回无词面重叠的真同义（car→automobile、车辆→汽车）。Ollama 不可用时**明确降级**
 * 到确定性的本地字符 n-gram 哈希嵌入，并把 degraded 状态暴露给上层，绝不静默冒充语义。
 *
 * 索引 API 是异步的（真实嵌入模型是网络调用），通过 `SemanticEmbedder` 统一入口。
 */

export type Embedding = number[];
/** 嵌入函数：同步（确定性本地）或异步（真实模型）皆可。 */
export type EmbedFn = (text: string) => Embedding | Promise<Embedding>;
export type SemanticEmbeddingStatus = "semantic" | "degraded" | "unavailable";

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
 * 本地降级语义表示：分语言的特征哈希嵌入（带符号哈希）。
 *
 * - 中文（CJK）：无分词，直接取字符 bigram / trigram。
 * - 英文（拉丁）：整词 + 词内字符 trigram（整词让无关文本余弦≈0，trigram 捕捉 morphology）。
 * - 带符号哈希让随机碰撞相互抵消，共享特征的文本对齐到正方向。
 *
 * 离线、确定性、跨语言。这是**降级兜底**，不是默认语义路径。
 */
export function hashedCharNgramEmbedding(text: string, dim = 256): Embedding {
  const norm = text.toLowerCase();
  const vec = new Float64Array(dim);
  const features: string[] = [];

  const cjkSegments = norm.match(/[\u4e00-\u9fff]+/g) ?? [];
  for (const seg of cjkSegments) {
    for (let i = 0; i < seg.length - 1; i += 1) features.push(seg.slice(i, i + 2));
    for (let i = 0; i < seg.length - 2; i += 1) features.push(seg.slice(i, i + 3));
  }

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

function isFiniteEmbedding(value: unknown): value is Embedding {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "number" && Number.isFinite(item));
}

/** 两个已 L2 归一化向量的余弦相似度（等于点积）。 */
export function cosineSimilarity(a: Embedding, b: Embedding): number {
  if (a.length !== b.length) {
    throw new Error(`Embedding dimension mismatch: ${a.length} != ${b.length}`);
  }
  const n = a.length;
  let dot = 0;
  for (let i = 0; i < n; i += 1) dot += a[i] * b[i];
  return dot;
}

/** Ollama `/api/embed` 神经网络嵌入（真实向量）。 */
export function ollamaEmbedding(
  model: string,
  baseUrl = "http://127.0.0.1:11434",
  fetchImpl: typeof fetch = fetch,
): (text: string) => Promise<Embedding> {
  return async (text: string): Promise<Embedding> => {
    const response = await fetchImpl(`${baseUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: text }),
    });
    if (!response.ok) throw new Error(`Ollama embed failed: HTTP ${response.status}`);
    const json = (await response.json()) as { embeddings?: unknown[] };
    const vector = json.embeddings?.[0];
    if (!isFiniteEmbedding(vector)) throw new Error("Ollama embed returned malformed vector");
    return vector;
  };
}

/**
 * 语义嵌入器：优先真实向量（Ollama），失败后**明确降级**到本地字符 n-gram。
 * 提供 `degraded` / `provider` 状态供上层审计（绝不静默冒充语义）。
 */
export interface SemanticEmbedder {
  embed(text: string): Promise<Embedding>;
  readonly status: SemanticEmbeddingStatus;
  readonly degraded: boolean;
  readonly provider: string;
  readonly message?: string;
}

export interface SemanticEmbedderOptions {
  /** Ollama 嵌入模型（默认 nomic-embed-text，多语可换 bge-m3）。 */
  model?: string;
  baseUrl?: string;
  /** 降级兜底（默认 hashedCharNgramEmbedding；设为 null 表示不可降级）。 */
  fallback?: EmbedFn | null;
  /** 网络层（测试注入 mock）。 */
  fetchImpl?: typeof fetch;
  /** 是否启用 Ollama（测试环境默认 false，直接走降级，避免真实网络）。 */
  useOllama?: boolean;
}

export function createSemanticEmbedder(options: SemanticEmbedderOptions = {}): SemanticEmbedder {
  const model = options.model ?? "nomic-embed-text";
  const baseUrl = options.baseUrl ?? "http://127.0.0.1:11434";
  const fallback = options.fallback === undefined ? hashedCharNgramEmbedding : options.fallback;
  const fetchImpl = options.fetchImpl ?? fetch;
  const useOllama =
    options.useOllama ?? !(process.env.VITEST === "true" || process.env.NODE_ENV === "test");

  let status: SemanticEmbeddingStatus = useOllama ? "semantic" : "degraded";
  let message: string | undefined = useOllama ? undefined : "Ollama embedding is disabled; using char-ngram fallback";
  let expectedDim: number | null = null;

  function validate(vector: unknown, source: string): Embedding {
    if (!isFiniteEmbedding(vector)) throw new Error(`${source} returned malformed vector`);
    if (expectedDim === null) {
      expectedDim = vector.length;
      return vector;
    }
    if (vector.length !== expectedDim) {
      throw new Error(`${source} dimension mismatch: ${vector.length} != ${expectedDim}`);
    }
    return vector;
  }

  async function embedViaOllama(text: string): Promise<Embedding> {
    const response = await fetchImpl(`${baseUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: text }),
    });
    if (!response.ok) throw new Error(`Ollama embed failed: HTTP ${response.status}`);
    const json = (await response.json()) as { embeddings?: unknown[] };
    const vector = json.embeddings?.[0];
    return validate(vector, "Ollama embed");
  }

  async function embedViaFallback(text: string): Promise<Embedding> {
    if (!fallback) throw new Error("No fallback embedding provider configured");
    const vector = fallback(text);
    return validate(vector instanceof Promise ? await vector : vector, "Fallback embed");
  }

  return {
    async embed(text) {
      if (status === "semantic") {
        try {
          return await embedViaOllama(text);
        } catch (error) {
          message = error instanceof Error ? error.message : "Ollama embed failed";
          try {
            const vector = await embedViaFallback(text);
            status = "degraded"; // 明确降级，后续都走本地兜底
            return vector;
          } catch (fallbackError) {
            status = "unavailable";
            message = fallbackError instanceof Error ? fallbackError.message : message;
            throw fallbackError;
          }
        }
      }
      if (status === "degraded") {
        try {
          return await embedViaFallback(text);
        } catch (error) {
          status = "unavailable";
          message = error instanceof Error ? error.message : "Fallback embed failed";
          throw error;
        }
      }
      throw new Error(message ?? "Semantic embedder is unavailable");
    },
    get status() {
      return status;
    },
    get degraded() {
      return status !== "semantic";
    },
    get provider() {
      if (status === "semantic") return `ollama:${model}`;
      if (status === "degraded") return "char-ngram";
      return "unavailable";
    },
    get message() {
      return message;
    },
  };
}
