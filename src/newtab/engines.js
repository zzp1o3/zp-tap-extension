// 搜索引擎表 + 自定义引擎存取 + 快捷组逻辑。
//
// 引擎结构：{ id: string, name: string, url: string, builtin: boolean }
//   url 模板含 {q} 占位，搜索时替换为 encodeURIComponent 后的查询词。
//
// 配置（chrome.storage.local，键 "engines.config"）：
//   {
//     engines: [...],          // 全部引擎（含预设与自定义），顺序即全排序顺序
//     defaultId: "baidu",      // 默认引擎 id
//     shortcutCount: 2         // 快捷组 = 排序后的前 N 项
//   }
// 首次无配置时返回默认预设。

export const DEFAULT_ENGINES = [
  { id: "baidu",   name: "百度",   url: "https://www.baidu.com/s?wd={q}",       builtin: true },
  { id: "bing",    name: "必应",   url: "https://cn.bing.com/search?q={q}",     builtin: true },
  { id: "sogou",   name: "搜狗",   url: "https://www.sogou.com/web?query={q}",  builtin: true },
  { id: "so360",   name: "360",   url: "https://www.so.com/s?q={q}",           builtin: true },
  { id: "zhihu",   name: "知乎",   url: "https://www.zhihu.com/search?q={q}&type=content", builtin: true },
  { id: "weibo",   name: "微博",   url: "https://s.weibo.com/weibo?q={q}",     builtin: true },
  { id: "bilibili",name: "哔哩哔哩",url: "https://search.bilibili.com/all?keyword={q}", builtin: true },
];

const DEFAULT_CONFIG = {
  engines: DEFAULT_ENGINES.slice(),
  defaultId: "baidu",
  shortcutCount: 2,
};

const KEY = "engines.config";

// 合并：以本地配置为准；若用户从未存过则回默认
export async function loadConfig() {
  const got = await chrome.storage.local.get(KEY);
  const cfg = got[KEY];
  if (!cfg || !Array.isArray(cfg.engines) || cfg.engines.length === 0) {
    return structuredClone(DEFAULT_CONFIG);
  }
  return {
    engines: cfg.engines,
    defaultId: cfg.defaultId || cfg.engines[0].id,
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