// 搜索引擎表 + 自定义引擎存取 + 快捷组逻辑。
//
// 引擎结构：{ id: string, name: string, url: string }
//   url 模板含 {q} 占位，搜索时替换为 encodeURIComponent 后的查询词。
//   所有引擎均可删除；删光时自动回退必应。
//
// 配置（chrome.storage.local，键 "engines.config"）：
//   {
//     engines: [...],          // 全部引擎（含预设与自定义），顺序即全排序顺序
//     defaultId: "baidu",      // 默认引擎 id
//     shortcutCount: 2         // 快捷组 = 排序后的前 N 项
//   }
// 首次无配置时返回默认预设。

export const DEFAULT_ENGINES = [
  { id: "bing",    name: "必应",    url: "https://cn.bing.com/search?q={q}" },
  { id: "bilibili",name: "哔哩哔哩", url: "https://search.bilibili.com/all?keyword={q}" },
  { id: "github",  name: "GitHub",  url: "https://github.com/search?q={q}" },
  { id: "baidu",   name: "百度",    url: "https://www.baidu.com/s?wd={q}" },
  { id: "zhihu",   name: "知乎",    url: "https://www.zhihu.com/search?q={q}&type=content" },
  { id: "google",  name: "Google",  url: "https://www.google.com/search?q={q}" },
  { id: "yandex",  name: "Yandex",  url: "https://yandex.com/search/?text={q}" },
];

// 删除全部引擎后的默认回退引擎（仅 bing）
export const FALLBACK_ENGINES = [
  { id: "bing", name: "必应", url: "https://cn.bing.com/search?q={q}" },
];

const DEFAULT_CONFIG = {
  engines: DEFAULT_ENGINES.slice(),
  defaultId: "bing",
  shortcutCount: 3,
};

const KEY = "engines.config";

// 合并：以本地配置为准；若用户从未存过则回默认；引擎为空时回退 bing
export async function loadConfig() {
  const got = await chrome.storage.local.get(KEY);
  const cfg = got[KEY];
  if (!cfg || !Array.isArray(cfg.engines) || cfg.engines.length === 0) {
    return structuredClone(DEFAULT_CONFIG);
  }
  return {
    engines: cfg.engines.length > 0 ? cfg.engines : structuredClone(FALLBACK_ENGINES),
    defaultId: cfg.defaultId || cfg.engines?.[0]?.id || "bing",
    shortcutCount: typeof cfg.shortcutCount === "number" ? cfg.shortcutCount : 2,
  };
}

export async function saveConfig(cfg) {
  await chrome.storage.local.set({ [KEY]: cfg });
}

// 构造查询 URL
export function buildSearchUrl(engine, query) {
  return engine.url.replace(/\{q\}/g, encodeURIComponent(query));
}

// 快捷组 = 排序后前 shortcutCount 项（至少 1）
export function shortcutGroup(cfg) {
  const n = Math.max(1, Math.min(cfg.shortcutCount || 1, cfg.engines.length));
  return cfg.engines.slice(0, n);
}