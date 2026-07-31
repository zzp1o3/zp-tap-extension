// 主入口：键盘监听/唤出/Esc/壁纸渲染/轮播/搜索引擎切换下拉与 Ctrl+↑↓/回车判定/建议面板联动。
//
// 状态机（body.dataset.state）：
//   idle   —— 纯壁纸，无可视控件
//   active —— 搜索框可见 + 建议面板可见（可选）
// 触发：字符键 → active；Esc → clear → idle
//
// 注意唤出tiden：先用 hidden 的 input 始终聚焦，"打字"由 keydown 在 document 层捕获并填入文字内容，
// 这样可规避"输入框未聚焦导致首字丢失"的问题（IME 也会因此把字符正常 commit 进框）。

import {
  loadConfig, saveConfig, buildSearchUrl, shortcutGroup,
} from "./engines.js";
import {
  loadWallpaperConfig, listWallpapers, getWallpaper, saveWallpaperConfig,
} from "./storage.js";
import { buildSuggestions, renderSuggestions, moveSelection, foldHistoryByDomain, HISTORY_PER_DOMAIN } from "./suggestions.js";
import { isDirectUrl, toDirectUrl } from "./url-detect.js";

let cfg = null;
let wpCfg = null;
let wallpapers = []; // [{id,name,createdAt,width,height}]（不含 blob，按需取）
let currentWpObjectUrl = null;
let intervalTimer = null;
let shortcutIndex = 0; // 快捷组内当前指针

const $input = document.getElementById("q");
const $box = document.getElementById("search-box");
const $panel = document.getElementById("suggestions");
const $engine = document.getElementById("engine-name");
const $engineList = document.getElementById("engine-list");
const $gear = document.getElementById("gear");
const $settingsFrame = document.getElementById("settings-frame");

// ---------- 引擎 ----------

function currentEngine() {
  return cfg.engines.find((e) => e.id === cfg.defaultId) || cfg.engines[0];
}

function renderEngineName() {
  $engine.textContent = currentEngine().name;
}

function openEngineList() {
  $engineList.innerHTML = "";
  cfg.engines.forEach((e) => {
    const opt = document.createElement("div");
    opt.className = "engine-opt" + (e.id === cfg.defaultId ? " active" : "");
    opt.textContent = e.name;
    opt.addEventListener("click", () => {
      cfg.defaultId = e.id;
      saveConfig(cfg);
      renderEngineName();
      closeEngineList();
    });
    $engineList.appendChild(opt);
  });
  $engineList.classList.remove("hidden");
}

function closeEngineList() {
  $engineList.classList.add("hidden");
}

// Ctrl+↑/↓ 在快捷组内循环
async function cycleShortcut(dir) {
  const group = shortcutGroup(cfg);
  if (group.length === 0) return;
  shortcutIndex = (shortcutIndex + dir + group.length) % group.length;
  cfg.defaultId = group[shortcutIndex].id;
  saveConfig(cfg);
  renderEngineName();
}

// ---------- 唤出/收框 ----------

function activate() {
  document.body.dataset.state = "active";
  $box.classList.remove("hidden");
  $input.focus();
  loadEmptyPanel();
}

function deactivate() {
  document.body.dataset.state = "idle";
  $box.classList.add("hidden");
  $panel.classList.add("hidden");
  closeEngineList();
  $input.value = "";
  if (document.activeElement === $input) $input.blur();
}

// ---------- 建议 ----------

let debounceTimer = null;
function onInput() {
  const q = $input.value;
  clearTimeout(debounceTimer);
  if (!q.trim()) {
    loadEmptyPanel();
    return;
  }
  debounceTimer = setTimeout(async () => {
    const items = await buildSuggestions(q);
    renderSuggestions($panel, items, { onSelect: openItem, query: q });
  }, 150);
}

// 空查询面板：常用书签 + 最近历史
async function loadEmptyPanel() {
  const items = await buildEmptySuggestions();
  renderSuggestions($panel, items, { onSelect: openItem, query: "" });
}

async function buildEmptySuggestions() {
  // 最近书签：取最近添加的若干
  let bms = [];
  let hist = [];
  try {
    bms = await new Promise((r) =>
      chrome.bookmarks.getRecent(8, (res) => r(Array.isArray(res) ? res : []))
    );
  } catch {}
  try {
    const startTime = Date.now() - 30 * 24 * 60 * 60 * 1000;
    hist = await new Promise((r) =>
      chrome.history.search({ text: "", maxResults: 200, startTime }, (res) => r(Array.isArray(res) ? res : []))
    );
  } catch {}
  const folded = foldHistoryByDomain(hist, HISTORY_PER_DOMAIN);
  const out = [];
  // 书签 4 + 历史 4
  for (const b of bms.slice(0, 4)) {
    out.push({ type: "bookmark", title: b.title || b.url, url: b.url, lastVisitTime: b.dateAdded, visitCount: 1 });
  }
  for (const h of folded.slice(0, 4)) {
    out.push({ type: "history", title: h.title || h.url, url: h.url, lastVisitTime: h.lastVisitTime, visitCount: h.visitCount });
  }
  return out;
}

function selectedItem() {
  const sel = $panel.querySelector(".sug-row.selected");
  return sel ? sel.dataset.url : null;
}

// ---------- 跳转 ----------

function openItem(it) {
  if (!it || !it.url) return;
  location.href = it.url;
}

function submitQuery() {
  const q = $input.value.trim();
  if (!q) return;
  // URL 检测优先于选中行：输入像 URL 时始终直达，避免被预选的历史项劫持。
  if (isDirectUrl(q)) {
    location.href = toDirectUrl(q);
    return;
  }
  const sel = $panel.querySelector(".sug-row.selected");
  if (sel) {
    const url = sel.dataset.url;
    if (url) { location.href = url; return; }
  }
  location.href = buildSearchUrl(currentEngine(), q);
}

// ---------- 键盘 ----------

document.addEventListener("keydown", (e) => {
  // Esc 任何时候 → 回 idle
  if (e.key === "Escape") {
    deactivate();
    return;
  }
  // Ctrl+↑/↓ 切换快捷组（仅 active 态）
  if (e.ctrlKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
    if (document.body.dataset.state === "active") {
      e.preventDefault();
      cycleShortcut(e.key === "ArrowUp" ? -1 : 1);
    }
    return;
  }
  if (document.body.dataset.state === "active") {
    // 上下键导航建议
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      moveSelection($panel, e.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      submitQuery();
      return;
    }
    // 引擎_list 打开时点击或者 tab 切换不需要在这里处理
    return;
  }
  // idle 态：字符键唤出（含 IME 字符）。功能键不触发。
  // 判定：单字符可打印键、且无 Ctrl/Alt/Meta
  // IME 起始 keydown 的 e.key===「Process」（非单字符），也要唤出，
  // 否则中文输入法首字落不进框。唤出后 input 已聚焦，IME 文本会正常 commit。
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  if ((e.key.length === 1 && !e.key.match(/\s/)) || e.key === "Process") {
    activate();
  }
});

$input.addEventListener("input", onInput);
$input.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { deactivate(); }
});

// 引擎名点击 → 下拉
$engine.addEventListener("click", (e) => {
  e.stopPropagation();
  if ($engineList.classList.contains("hidden")) openEngineList();
  else closeEngineList();
});
document.addEventListener("click", (e) => {
  if (!$engineList.contains(e.target) && e.target !== $engine) closeEngineList();
});

// ---------- 设置 ----------

$gear.addEventListener("click", () => {
  $settingsFrame.src = "settings/settings.html";
  $settingsFrame.classList.remove("hidden");
});
window.addEventListener("message", (e) => {
  if (e.data === "tap:settings-close") {
    $settingsFrame.src = "";
    $settingsFrame.classList.add("hidden");
  } else if (e.data === "tap:settings-changed") {
    init(); // 配置变更后重新加载
  }
});

// ---------- 壁纸 ----------

async function renderWallpaper() {
  if (wallpapers.length === 0) {
    document.body.style.removeProperty("--wp");
    return;
  }
  let id = null;
  if (wpCfg.mode === "per-open") {
    id = wallpapers[0].id;
  } else {
    // interval 模式也按 currentId.getNext
    id = wpCfg.currentId || wallpapers[0].id;
  }
  const rec = await getWallpaper(id);
  if (!rec) return;
  if (currentWpObjectUrl) URL.revokeObjectURL(currentWpObjectUrl);
  currentWpObjectUrl = URL.createObjectURL(rec.blob);
  document.body.style.setProperty("--wp", `url("${currentWpObjectUrl}")`);
}

function startIntervalIfNeeded() {
  stopInterval();
  if (wpCfg.mode === "interval" && wallpapers.length > 1) {
    intervalTimer = setInterval(async () => {
      const idx = wallpapers.findIndex((w) => w.id === (wpCfg.currentId || wallpapers[0].id));
      const next = wallpapers[(idx + 1) % wallpapers.length];
      wpCfg.currentId = next.id;
      await saveWallpaperConfig({ currentId: next.id });
      renderWallpaper();
    }, Math.max(5, wpCfg.intervalSec || 30) * 1000);
  }
}

function stopInterval() {
  if (intervalTimer) { clearInterval(intervalTimer); intervalTimer = null; }
}

// ---------- 初始化 ----------

async function init() {
  cfg = await loadConfig();
  wpCfg = await loadWallpaperConfig();
  const all = await listWallpapers();
  wallpapers = all.sort((a, b) => a.createdAt - b.createdAt);
  renderEngineName();
  await renderWallpaper();
  startIntervalIfNeeded();
}

init();

// 暴露给设置面板用（同源 iframe 可访问 parent 的变量，但模块作用域不暴露到 window）
// 这里通过 postMessage 通信，无需暴露。