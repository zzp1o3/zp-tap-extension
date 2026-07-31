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
  loadWallpaperConfig, listWallpapers, putWallpaper, saveWallpaperConfig,
} from "./storage.js";
import { buildSuggestions, renderSuggestions, moveSelection, foldHistoryByDomain } from "./suggestions.js";
import { isDirectUrl, toDirectUrl } from "./url-detect.js";

let cfg = null;
let wpCfg = null;
let wallpapers = []; // 媒体项 [{id,name,type:"image"|"video",blob?,url?,createdAt,...}]，含 blob
let currentWpObjectUrl = null; // 当前图片用的 ObjectURL（视频用 src 直连）
let intervalTimer = null;
let shortcutIndex = 0; // 快捷组内当前指针

const $input = document.getElementById("q");
const $box = document.getElementById("search-box");
const $panel = document.getElementById("suggestions");
const $engine = document.getElementById("engine-name");
const $engineList = document.getElementById("engine-list");
const $gear = document.getElementById("gear");
const $gearWrap = document.getElementById("gear-wrap");
const $gearTab = document.getElementById("gear-tab");
// 背景层
const $wallpaper = document.getElementById("wallpaper");
const $settingsFrame = document.getElementById("settings-frame");
const $settingsDrawer = document.getElementById("settings-drawer");
const $settingsOverlay = document.getElementById("settings-overlay");
const $settingsPanel = document.getElementById("settings-panel");
const $settingsClose = document.getElementById("settings-close");

let settingsOpen = false;
function openSettings() {
  if (settingsOpen) return;
  $settingsFrame.src = "settings/settings.html";
  $settingsDrawer.classList.remove("pointer-events-none");
  // 下一帧再触发过渡，确保初始 translate-x-full 已生效
  requestAnimationFrame(() => {
    $settingsPanel.classList.remove("translate-x-full");
    $settingsOverlay.style.opacity = "1";
  });
  settingsOpen = true;
}
function closeSettings() {
  if (!settingsOpen) return;
  $settingsPanel.classList.add("translate-x-full");
  $settingsOverlay.style.opacity = "0";
  settingsOpen = false;
  setTimeout(() => { if (!settingsOpen) $settingsFrame.src = ""; }, 320);
  $settingsDrawer.classList.add("pointer-events-none");
}

// ---------- UI 配置（搜索框/齿轮显隐） ----------

const UI_KEY = "ui.config";
const DEFAULT_UI = { hideSearchBox: false, hideGear: false };

async function loadUiConfig() {
  const got = await chrome.storage.local.get(UI_KEY);
  return { ...DEFAULT_UI, ...(got[UI_KEY] || {}) };
}

// 应用搜索框显隐：
//   hideSearchBox=false → 常驻显示（建议仍输入才出）
//   hideSearchBox=true  → 隐藏，输入才唤出（现状）
function applySearchBoxMode(ui) {
  if (ui.hideSearchBox) {
    deactivate();
  } else {
    document.body.dataset.state = "active";
    $box.classList.remove("hidden");
  }
}

// 应用齿轮显隐：
//   hideGear=false → 齿轮常驻（半透明）
//   hideGear=true  → 齿轮藏在右侧，贴边留触发箭头，悬停滑出
function applyGearMode(ui) {
  if (ui.hideGear) {
    $gearWrap.classList.add("hidden");
    // 齿轮藏起：translate-x 移出屏幕，箭头可见
    $gear.style.transform = "translateX(140%)";
    $gear.style.opacity = "0.35";
    $gearTab.classList.remove("hidden");
  } else {
    $gear.style.transform = "";
    $gear.style.opacity = "";
    $gearTab.classList.add("hidden");
    $gearWrap.classList.remove("hidden");
  }
}

// 齿轮悬停滑出/滑回（仅隐藏模式生效）
$gearTab.addEventListener("mouseenter", () => {
  $gear.style.transform = "translateX(0)";
  $gear.style.opacity = "1";
});
$gearWrap.addEventListener("mouseleave", () => {
  if (uiConfig.hideGear) {
    $gear.style.transform = "translateX(140%)";
    $gear.style.opacity = "0.35";
  }
});

// ---------- 引擎 ----------

function currentEngine() {
  return cfg.engines.find((e) => e.id === cfg.defaultId) || cfg.engines[0];
}

function renderEngineName() {
  $engine.innerHTML = "";
  const label = document.createElement("span");
  label.textContent = currentEngine().name;
  const chevron = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  chevron.setAttribute("viewBox", "0 0 24 24");
  chevron.setAttribute("width", "14");
  chevron.setAttribute("height", "14");
  chevron.setAttribute("fill", "none");
  chevron.setAttribute("stroke", "currentColor");
  chevron.setAttribute("stroke-width", "2");
  chevron.setAttribute("stroke-linecap", "round");
  chevron.setAttribute("stroke-linejoin", "round");
  chevron.innerHTML = `<path d="m6 9 6 6 6-6"/>`;
  chevron.style.opacity = "0.7";
  $engine.appendChild(label);
  $engine.appendChild(chevron);
}

const ENGINE_OPT_CLASS = [
  "px-3", "py-2", "rounded-xl", "cursor-pointer", "text-[14px]", "whitespace-nowrap",
  "transition-all", "duration-200", "ease-in-out",
].join(" ");
const ENGINE_OPT_DEFAULT = "text-[var(--tp-tx-3)] hover:bg-[var(--tp-hover)]";
const ENGINE_OPT_ACTIVE = "bg-[var(--tp-glass2)] text-[var(--tp-tx)]";
const ENGINE_OPT_INACTIVE = ENGINE_OPT_DEFAULT;

function openEngineList() {
  $engineList.innerHTML = "";
  cfg.engines.forEach((e) => {
    const opt = document.createElement("div");
    const extra = e.id === cfg.defaultId ? ENGINE_OPT_ACTIVE : ENGINE_OPT_INACTIVE;
    opt.className = "engine-opt " + ENGINE_OPT_CLASS + " " + extra;
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
let suggestionSeq = 0; // 版本守卫，防止旧异步结果覆盖新输入
function onInput() {
  const q = $input.value;
  clearTimeout(debounceTimer);
  if (!q.trim()) {
    suggestionSeq++; // 使任何在途的异步结果作废
    loadEmptyPanel();
    return;
  }
  const seq = ++suggestionSeq;
  debounceTimer = setTimeout(async () => {
    if (seq !== suggestionSeq) return; // 已被更新的输入取代
    const items = await buildSuggestions(q);
    if (seq !== suggestionSeq) return; // await 期间输入又变了
    renderSuggestions($panel, items, { onSelect: openItem, query: q });
  }, 150);
}

// 空查询面板：常用书签 + 最近历史。带版本守卫，避免与 onInput 的异步结果互相覆盖。
async function loadEmptyPanel() {
  const seq = suggestionSeq;
  const items = await buildEmptySuggestions();
  if (seq !== suggestionSeq) return;
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
  const folded = foldHistoryByDomain(hist);
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
  // 1）用户主动选中建议行 → 直达该 URL
  const sel = $panel.querySelector(".sug-row.selected");
  if (sel) {
    const url = sel.dataset.url;
    if (url) { location.href = url; return; }
  }
  // 2）输入像 URL → 直达该地址
  if (isDirectUrl(q)) {
    location.href = toDirectUrl(q);
    return;
  }
  // 3）否则用当前引擎搜索
  location.href = buildSearchUrl(currentEngine(), q);
}

// ---------- 键盘 ----------

document.addEventListener("keydown", (e) => {
  // Esc：常驻模式清空输入隐藏建议；隐藏模式回 idle
  if (e.key === "Escape") {
    if (uiConfig.hideSearchBox) {
      deactivate();
    } else {
      $input.value = "";
      $panel.classList.add("hidden");
      closeEngineList();
      $input.blur();
    }
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
  // idle 态：字符键唤出（含 IME）。功能键不触发。
  // 需用户先点页面或打字触发；Chrome 新标签页会聚焦地址栏而非页面，无法自动抢。
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

$gear.addEventListener("click", openSettings);
$settingsClose.addEventListener("click", closeSettings);
$settingsOverlay.addEventListener("click", closeSettings);
window.addEventListener("message", (e) => {
  if (e.data === "tap:settings-close") {
    closeSettings();
  } else if (e.data === "tap:settings-changed") {
    // 配置变更：仅刷新 UI 显隐（不动轮播/壁纸状态）
    uiConfig = await loadUiConfig();
    applySearchBoxMode(uiConfig);
    applyGearMode(uiConfig);
  }
});

// ---------- 背景媒体（图片 / 视频 / URL）----------

const $videoBg = document.getElementById("video-bg");

// 隐藏视频层，恢复图片层。
function hideVideo() {
  $videoBg.pause();
  if ($videoBg.src && $videoBg.src.startsWith("blob:")) URL.revokeObjectURL($videoBg.src);
  $videoBg.src = ""; // 清空走正常 unload，不用 removeAttribute（避免 autoplay 不触发）
  $videoBg.classList.add("hidden");
}
function hideImage() {
  if (currentWpObjectUrl) { URL.revokeObjectURL(currentWpObjectUrl); currentWpObjectUrl = null; }
  $wallpaper.style.removeProperty("background-image");
}

// 获取当前媒体索引。per-open 模式每打开新标签页进一位（在 init 里递增后调用）；
// interval 模式定时在 startInterval 内递增。
function pickMedia() {
  if (wallpapers.length === 0) return null;
  if (wpCfg.mode === "fixed") {
    const items = fixedItems(wallpapers);
    return items.length > 0 ? items[0] : wallpapers[0];
  }
  const items = carouselItems(wallpapers);
  const pool = items.length > 0 ? items : wallpapers;
  const idx = ((wpCfg.currentIndex ?? 0) + pool.length) % pool.length;
  return pool[idx];
}

async function renderMedia() {
  hideVideo();
  hideImage();
  $wallpaper.style.display = ""; // 恢复壁纸层（上轮若是视频，display 为 none）
  if (wallpapers.length === 0) return;

  const item = pickMedia();
  if (!item) return;

  if (item.type === "video") {
    // 视频模式：隐藏 wallpaper 层，显示 video 层
    $wallpaper.style.display = "none";
    $videoBg.classList.remove("hidden");
    const src = item.blob ? URL.createObjectURL(item.blob) : (item.url || "");
    if (!$videoBg.src || $videoBg.src !== src) {
      $videoBg.src = src;
      $videoBg.load();
    }
    // 静音视频通常允许 autoplay；loadeddata 后尝试播放更稳
    const tryPlay = () => $videoBg.play().catch(() => {});
    if ($videoBg.readyState >= 2) { tryPlay(); } else {
      $videoBg.addEventListener("loadeddata", tryPlay, { once: true });
      setTimeout(tryPlay, 300); // 超时兜底
    }
  } else {
    // 图片模式：恢复 wallpaper 层，隐藏视频
    $wallpaper.style.display = "";
    let src = "";
    if (item.blob) {
      currentWpObjectUrl = URL.createObjectURL(item.blob);
      src = currentWpObjectUrl;
    } else if (item.url) {
      src = item.url;
    }
    if (src) $wallpaper.style.setProperty("--wp", `url("${src}")`);
  }
}

function startIntervalIfNeeded() {
  stopInterval();
  if (wpCfg.mode === "interval") {
    const items = carouselItems(wallpapers);
    if (items.length > 1) {
      intervalTimer = setInterval(async () => {
        wpCfg.currentIndex = ((wpCfg.currentIndex ?? 0) + 1) % items.length;
        await saveWallpaperConfig({ currentIndex: wpCfg.currentIndex });
        renderMedia();
      }, Math.max(5, wpCfg.intervalSec || 30) * 1000);
    }
  }
}

function stopInterval() {
  if (intervalTimer) { clearInterval(intervalTimer); intervalTimer = null; }
}

// ---------- 初始化 ----------

// 取参与轮播/固定的媒体项
function carouselItems(all) {
  return all.filter((w) => w.carousel !== false);
}
function fixedItems(all) {
  return all.filter((w) => w.fixed === true);
}

let uiConfig = DEFAULT_UI;

async function init() {
  // 主题
  const th = await chrome.storage.local.get("theme");
  document.documentElement.dataset.theme = th.theme || "system";

  // UI 显隐配置
  uiConfig = await loadUiConfig();
  applySearchBoxMode(uiConfig);
  applyGearMode(uiConfig);

  cfg = await loadConfig();
  wpCfg = await loadWallpaperConfig();
  const all = await listWallpapers();
  wallpapers = all.sort((a, b) => a.createdAt - b.createdAt);
  // 首次使用：自动添加一张默认背景
  if (wallpapers.length === 0) {
    const defaultBg = {
      id: "default-bg",
      name: "默认风景",
      type: "image",
      url: "https://imgtu.bzee.cn/photo/pic/ziran/fengjing/12527AvS8lbDaswWqdq3BLJYr.webp",
      carousel: true,
      fixed: false,
      createdAt: Date.now(),
    };
    await putWallpaper(defaultBg);
    wallpapers = [defaultBg];
  }
  // 确保旧数据有 carousel 默认值
  for (const w of wallpapers) {
    if (w.carousel === undefined) { w.carousel = true; }
  }
  renderEngineName();

  // fixed 模式：不递增，直接用第一个参与轮播的项
  if (wpCfg.mode === "fixed") {
    wpCfg.currentIndex = 0;
    await saveWallpaperConfig({ currentIndex: 0 });
  } else if (wpCfg.mode === "per-open") {
    const items = carouselItems(wallpapers);
    if (items.length > 0) {
      wpCfg.currentIndex = ((wpCfg.currentIndex ?? 0) + 1) % items.length;
      await saveWallpaperConfig({ currentIndex: wpCfg.currentIndex });
    }
  }
  await renderMedia();
  startIntervalIfNeeded();
}

init();