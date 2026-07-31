// 搜索建议核心：frecency 打分 + 历史按域名折叠 + UI 渲染。
//
// 数据源：chrome.bookmarks.search(text) 与 chrome.history.search({text, maxResults, startTime})
// 打分公式：
//   score = weight(type) * recencyDecay(lastVisitDays, halfLife=7d)
//           * matchPositionBonus(text, target) * log(visitCount+1)
//   书签 weight=1.6, 历史 weight=1.0
//   recencyDecay = exp(-d/halfLife)
//   matchPositionBonus: 标题/URL 以查询词开头=1.0, 子串命中=0.5, 否则 0.3（仍可能因历史命中而被搜到）
// 历史按域名折叠：同域名取最近 2-3 条（HISTORY_PER_DOMAIN），按域名最近访问排序。

import { getFaviconUrl, getCdnFaviconUrl } from "./favicon.js";

export const MAX_SUGGESTIONS = 8;

const BOOKMARK_WEIGHT = 1.6;
const HISTORY_WEIGHT = 1.0;
const HALF_LIFE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

// refDate 用于测试稳定；默认调用时为当前时间
export function scoreItem({ type, title, url, lastVisitTime, visitCount, query }, refDate = Date.now()) {
  const q = (query || "").toLowerCase();
  const t = (title || "").toLowerCase();
  const u = (url || "").toLowerCase();
  let position = 0.3;
  if (q && (t.startsWith(q) || u.startsWith(q))) position = 1.0;
  else if (q && (t.includes(q) || u.includes(q))) position = 0.5;
  const weight = type === "bookmark" ? BOOKMARK_WEIGHT : HISTORY_WEIGHT;
  const days = (refDate - (lastVisitTime || refDate)) / DAY_MS;
  const recency = Math.exp(-days / HALF_LIFE_DAYS);
  const freq = Math.log((visitCount || 1) + 1);
  return weight * recency * position * freq / 10;
}

function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// 折叠历史：同域名只取 visitCount 最高的那一条，按域名最近访问排序
export function foldHistoryByDomain(historyItems) {
  const byDomain = new Map();
  for (const it of historyItems) {
    const d = domainOf(it.url);
    if (!d) continue;
    if (!byDomain.has(d)) { byDomain.set(d, it); continue; }
    const cur = byDomain.get(d);
    if ((it.visitCount || 0) > (cur.visitCount || 0)) byDomain.set(d, it);
  }
  const result = Array.from(byDomain.values());
  result.sort((a, b) => (b.lastVisitTime || 0) - (a.lastVisitTime || 0));
  return result;
}

// 取 bookmark + history，混排打分，返回 ≤ MAX_SUGGESTIONS 条
export async function buildSuggestions(query, refDate = Date.now()) {
  const q = (query || "").trim();
  if (!q) return [];
  const [bms, hist] = await Promise.all([
    chromeBookmarks(q),
    chromeHistory(q),
  ]);
  const folded = foldHistoryByDomain(hist);
  const scored = [];
  for (const b of folded) {
    scored.push({
      type: "history",
      title: b.title || domainOf(b.url) || b.url,
      url: b.url,
      lastVisitTime: b.lastVisitTime,
      visitCount: b.visitCount,
      score: scoreItem({ type: "history", title: b.title, url: b.url, lastVisitTime: b.lastVisitTime, visitCount: b.visitCount, query: q }, refDate),
    });
  }
  for (const b of bms) {
    scored.push({
      type: "bookmark",
      title: b.title || b.url,
      url: b.url,
      lastVisitTime: b.dateAdded || refDate,
      visitCount: 1,
      score: scoreItem({ type: "bookmark", title: b.title, url: b.url, lastVisitTime: b.dateAdded, visitCount: 1, query: q }, refDate),
    });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_SUGGESTIONS);
}

function chromeBookmarks(q) {
  return new Promise((resolve) => {
    try {
      chrome.bookmarks.search(q, (res) => resolve(Array.isArray(res) ? res : []));
    } catch {
      resolve([]);
    }
  });
}

function chromeHistory(q) {
  return new Promise((resolve) => {
    try {
      // 近 90 天
      const startTime = Date.now() - 90 * DAY_MS;
      chrome.history.search({ text: q, maxResults: 2000, startTime }, (res) =>
        resolve(Array.isArray(res) ? res : [])
      );
    } catch {
      resolve([]);
    }
  });
}

// ---- UI 渲染 ----

// favicon 加载失败时的首字母徽章
function makeLetterBadge(it) {
  let letter = "?";
  try { letter = new URL(it.url).hostname.replace(/^www\./, "")[0] || "?"; } catch {}
  const span = document.createElement("span");
  span.className = "sug-icon " + ICON_CLASS + " flex items-center justify-center text-[12px] uppercase";
  span.style.color = "var(--tp-tx-dim)";
  span.style.background = "var(--tp-select)";
  span.textContent = letter;
  return span;
}

// 书签标记 SVG（lucide star）内联，颜色 currentColor
const STAR_SVG = `<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" stroke="none" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;

const ROW_CLASS = [
  "flex", "items-center", "gap-3", "px-3", "py-2", "rounded-xl",
  "cursor-pointer", "transition-all", "duration-200", "ease-in-out",
  "hover:bg-[var(--tp-hover)]", "hover:scale-[1.01]",
  "text-[var(--tp-tx)]",
].join(" ");
const ROW_SELECTED = "bg-[var(--tp-select)]";
const ICON_CLASS = [
  "w-5", "h-5", "rounded", "flex-none",
].join(" ");
const TEXT_CLASS = "flex-1 min-w-0 relative";
const TITLE_CLASS = "text-[14px] truncate text-[var(--tp-tx-3)]";
const SUB_CLASS = "text-[12px] truncate text-[var(--tp-tx-dim)]";
const MARK_CLASS = "absolute -top-0.5 right-0 text-amber-300/90";

// 渲染建议列表到容器。返回清理函数。
// 注意：不预选第 0 行 —— 默认 Enter 走"用当前引擎搜索该词"，
// 用户需按上下键或鼠标选中某行后才走"直达该 URL"。
export function renderSuggestions(container, items, { onSelect, query }) {
  container.innerHTML = "";
  if (!items || items.length === 0) {
    container.classList.add("hidden");
    return () => {};
  }
  container.classList.remove("hidden");
  const frag = document.createDocumentFragment();
  items.forEach((it, idx) => {
    const row = document.createElement("div");
    row.className = "sug-row " + ROW_CLASS;
    row.dataset.url = it.url;
    row.dataset.idx = String(idx);

    const icon = document.createElement("img");
    icon.className = "sug-icon " + ICON_CLASS;
    icon.src = getFaviconUrl(it.url);
    icon.alt = "";
    icon.loading = "lazy";
    let _fallback = 0;
    icon.onerror = () => {
      _fallback++;
      if (_fallback === 1) {
        // Chrome _favicon 失败 → 国内 CDN
        const cdn = getCdnFaviconUrl(it.url);
        if (cdn) { icon.src = cdn; return; }
      }
      // 全部失败 → 字母徽章
      icon.replaceWith(makeLetterBadge(it));
    };

    const text = document.createElement("div");
    text.className = "sug-text " + TEXT_CLASS;
    const title = document.createElement("div");
    title.className = "sug-title " + TITLE_CLASS;
    title.textContent = it.title || it.url;
    const sub = document.createElement("div");
    sub.className = "sug-sub " + SUB_CLASS;
    sub.textContent = it.url;
    text.appendChild(title);
    text.appendChild(sub);

    if (it.type === "bookmark") {
      const mark = document.createElement("span");
      mark.className = "sug-mark " + MARK_CLASS;
      mark.title = "书签";
      mark.innerHTML = STAR_SVG;
      text.appendChild(mark);
    }

    row.appendChild(icon);
    row.appendChild(text);
    row.addEventListener("click", () => onSelect(it));
    row.addEventListener("mouseenter", () => {
      container.querySelectorAll(".sug-row.selected").forEach((el) => {
        el.classList.remove("selected");
        el.classList.remove(ROW_SELECTED);
      });
      row.classList.add("selected");
      row.classList.add(ROW_SELECTED);
    });
    row.addEventListener("mouseleave", () => {
      row.classList.remove("selected");
      row.classList.remove(ROW_SELECTED);
    });
    frag.appendChild(row);
  });
  container.appendChild(frag);
  return () => {};
}

// 改变选中项（上下键导航）。返回当前选中项数据或 null。
// 未选中时第一次按方向键：ArrowDown 从 0 开始，ArrowUp 从末尾开始。
export function moveSelection(container, dir) {
  const rows = container.querySelectorAll(".sug-row");
  if (!rows.length) return null;
  let i = -1;
  for (let k = 0; k < rows.length; k++) if (rows[k].classList.contains("selected")) { i = k; break; }
  let next;
  if (i === -1) {
    next = dir > 0 ? 0 : rows.length - 1;
  } else {
    next = (i + dir + rows.length) % rows.length;
  }
  rows.forEach((r) => { r.classList.remove("selected"); r.classList.remove(ROW_SELECTED); });
  rows[next].classList.add("selected");
  rows[next].classList.add(ROW_SELECTED);
  rows[next].scrollIntoView({ block: "nearest" });
  return { url: rows[next].dataset.url, idx: next };
}