// 设置面板：引擎增删/拖拽排序/快捷组 N；壁纸上传/删除；轮播模式。
// 与主页面通过 postMessage("tap:settings-close"/"tap:settings-changed") 通信。

import { loadConfig, saveConfig } from "../engines.js";
import {
  listWallpapers, putWallpaper, delWallpaper, compressImage, probeVideo,
  loadWallpaperConfig, saveWallpaperConfig,
} from "../storage.js";

let cfg = null;
let wpCfg = null;
let wallpapers = [];

const $list = document.getElementById("engine-list");
const $count = document.getElementById("shortcut-count");
const $add = document.getElementById("add-engine");
const $newName = document.getElementById("new-name");
const $newUrl = document.getElementById("new-url");
const $wpFile = document.getElementById("wp-file");
const $wpGrid = document.getElementById("wp-grid");
const $wpMode = document.getElementById("wp-mode");
const $wpInterval = document.getElementById("wp-interval");
const $intervalLabel = document.querySelector("label.interval");
const $videoFile = document.getElementById("video-file");
const $mediaUrl = document.getElementById("media-url");
const $addUrl = document.getElementById("add-url");

// lucide 图标内联
const GRIP_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>`;
const TRASH_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;

// ---- 引擎 ----

const ENGINE_ITEM_CLASS = [
  "flex", "items-center", "gap-2.5", "px-2.5", "py-2", "rounded-xl",
  "border", "border-white/10", "bg-[#14161b]",
  "transition-all", "duration-200", "ease-in-out",
].join(" ");

function renderEngines() {
  $list.innerHTML = "";
  cfg.engines.forEach((e) => {
    const li = document.createElement("li");
    li.className = "engine-item " + ENGINE_ITEM_CLASS;
    li.draggable = true;
    li.dataset.id = e.id;
    li.innerHTML = `
      <span class="handle text-white/50 cursor-grab select-none" title="拖拽排序">${GRIP_SVG}</span>
      <span class="name text-[14px] text-white/95 flex-none w-[110px] truncate"></span>
      <span class="url text-[12px] text-white/55 flex-1 truncate"></span>
      <button class="del text-white/55 transition-all duration-300 ease-in-out hover:scale-110 hover:text-red-400" type="button" title="删除">${TRASH_SVG}</button>
    `;
    li.querySelector(".name").textContent = e.name + (e.id === cfg.defaultId ? " ·" : "");
    li.querySelector(".url").textContent = e.url;
    li.querySelector(".del").addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (e.builtin) { alert("内置引擎不可删除，可将其排序到下方以移出快捷组。"); return; }
      const idx = cfg.engines.findIndex((x) => x.id === e.id);
      if (idx >= 0) {
        cfg.engines.splice(idx, 1);
        if (cfg.defaultId === e.id) cfg.defaultId = cfg.engines[0]?.id;
        saveConfig(cfg);
        renderEngines();
        notifyChanged();
      }
    });
    $list.appendChild(li);
  });
  $count.value = cfg.shortcutCount;
  enableDrag();
}

function enableDrag() {
  let dragId = null;
  $list.querySelectorAll(".engine-item").forEach((li) => {
    li.addEventListener("dragstart", () => { dragId = li.dataset.id; li.style.opacity = 0.4; });
    li.addEventListener("dragend", () => { li.style.opacity = ""; clearOver(); });
    li.addEventListener("dragover", (e) => { e.preventDefault(); clearOver(); li.classList.add("border-white/40"); });
    li.addEventListener("dragleave", () => li.classList.remove("border-white/40"));
    li.addEventListener("drop", (e) => {
      e.preventDefault();
      li.classList.remove("border-white/40");
      const targetId = li.dataset.id;
      if (!dragId || dragId === targetId) return;
      const from = cfg.engines.findIndex((x) => x.id === dragId);
      const to = cfg.engines.findIndex((x) => x.id === targetId);
      if (from < 0 || to < 0) return;
      const [moved] = cfg.engines.splice(from, 1);
      cfg.engines.splice(to, 0, moved);
      saveConfig(cfg);
      renderEngines();
      notifyChanged();
    });
  });
  function clearOver() { $list.querySelectorAll(".border-white/40").forEach((el) => el.classList.remove("border-white/40")); }
}

// 点击某行设为默认
$list.addEventListener("click", (e) => {
  if (e.target.closest(".del")) return;
  const li = e.target.closest(".engine-item");
  if (!li) return;
  const id = li.dataset.id;
  cfg.defaultId = id;
  saveConfig(cfg);
  renderEngines();
  notifyChanged();
});

$count.addEventListener("change", () => {
  cfg.shortcutCount = Math.max(1, Math.min(9, parseInt($count.value, 10) || 1));
  saveConfig(cfg);
  notifyChanged();
});

$add.addEventListener("click", () => {
  const name = $newName.value.trim();
  const url = $newUrl.value.trim();
  if (!name || !url) { alert("请填写名称与 URL 模板。"); return; }
  if (!url.includes("{q}")) { alert("URL 模板需包含 {q} 占位以接收查询词。"); return; }
  const id = "custom-" + name.replace(/\s+/g, "-").toLowerCase() + "-" + Date.now();
  cfg.engines.push({ id, name, url, builtin: false });
  // 不强制设为默认：新增引擎排在末尾，是否进快捷组由用户排序决定。
  saveConfig(cfg);
  $newName.value = ""; $newUrl.value = "";
  renderEngines();
  notifyChanged();
});

// ---- 背景媒体 ----

const thumbUrls = new Set();

// 视频图标 SVG（小型播放三角）
const PLAY_SVG = `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" stroke="none" class="opacity-80 drop-shadow-lg" aria-hidden="true"><polygon points="6 4 20 12 6 20 6 4"/></svg>`;

async function renderWallpapers() {
  for (const u of thumbUrls) URL.revokeObjectURL(u);
  thumbUrls.clear();
  $wpGrid.innerHTML = "";
  for (const w of wallpapers) {
    const card = document.createElement("div");
    card.className = "relative rounded-xl overflow-hidden border border-white/10 bg-white/[0.03]";
    card.style.aspectRatio = "16 / 10";

    // 卡片内容：本地 blob 显示缩略图；远程 url 仅显示标签
    if (w.blob) {
      if (w.type === "video") {
        // 视频 blob：用 createElement('video') 替代截图？
        // 不加：播放缩略图由 canvas 第一帧抓取 cost 高。
        // 仅显示名称 + 播放图标
        const label = document.createElement("div");
        label.className = "w-full h-full flex flex-col items-center justify-center text-white/50 text-[11px] gap-1 px-1";
        label.innerHTML = `<span class="truncate max-w-full">${escapeHTML(w.name)}</span>`;
        card.appendChild(label);
        const play = document.createElement("div");
        play.className = "absolute inset-0 flex items-center justify-center";
        play.innerHTML = PLAY_SVG;
        card.appendChild(play);
      } else {
        const img = document.createElement("img");
        const u = URL.createObjectURL(w.blob);
        thumbUrls.add(u);
        img.src = u;
        img.alt = w.name;
        img.className = "w-full h-full object-cover block";
        card.appendChild(img);
      }
    } else if (w.url) {
      const label = document.createElement("div");
      label.className = "w-full h-full flex flex-col items-center justify-center text-white/55 text-[11px] gap-0.5 px-2";
      label.innerHTML = `<span class="text-white/80 text-[12px]">${w.type === "video" ? "视频" : "图片"} URL</span><span class="truncate max-w-full">${escapeHTML(w.url)}</span>`;
      card.appendChild(label);
    }
    if (w.type === "video") {
      const badge = document.createElement("span");
      badge.className = "absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/55 text-white/80 text-[10px]";
      badge.textContent = "视频";
      card.appendChild(badge);
    }
    const btn = document.createElement("button");
    btn.className = "absolute top-1 right-1 px-2 py-0.5 rounded-md bg-black/55 text-white text-[12px] transition-all duration-300 ease-in-out hover:bg-black/75 hover:scale-110";
    btn.innerHTML = TRASH_SVG;
    btn.title = "删除";
    btn.addEventListener("click", async () => {
      await delWallpaper(w.id);
      wallpapers = (await listWallpapers()).sort((x, y) => x.createdAt - y.createdAt);
      wpCfg = await loadWallpaperConfig();
      if (wpCfg.currentId === w.id) {
        wpCfg = await saveWallpaperConfig({ currentId: null, currentIndex: 0 });
      }
      renderWallpapers();
      notifyChanged();
    });
    card.appendChild(btn);
    $wpGrid.appendChild(card);
  }
}

function escapeHTML(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

// 上传图片
$wpFile.addEventListener("change", async () => {
  const files = Array.from($wpFile.files || []);
  for (const f of files) {
    const { blob, width, height } = await compressImage(f);
    const id = "wp-" + Date.now() + "-" + Math.floor(Math.random() * 1e6);
    await putWallpaper({ id, name: f.name, type: "image", blob, width, height, createdAt: Date.now() });
  }
  $wpFile.value = "";
  wallpapers = (await listWallpapers()).sort((x, y) => x.createdAt - y.createdAt);
  renderWallpapers();
  notifyChanged();
});

// 上传视频（不压缩，原样存，IDB 配额够）
$videoFile.addEventListener("change", async () => {
  const files = Array.from($videoFile.files || []);
  for (const f of files) {
    const meta = await probeVideo(f).catch(() => ({ width: 0, height: 0 }));
    const id = "video-" + Date.now() + "-" + Math.floor(Math.random() * 1e6);
    await putWallpaper({ id, name: f.name, type: "video", blob: f, width: meta.width, height: meta.height, createdAt: Date.now() });
  }
  $videoFile.value = "";
  wallpapers = (await listWallpapers()).sort((x, y) => x.createdAt - y.createdAt);
  renderWallpapers();
  notifyChanged();
});

// 添加远程 URL
$addUrl.addEventListener("click", async () => {
  const u = $mediaUrl.value.trim();
  if (!u) return;
  const isVideo = /\.(mp4|webm|ogg|mov|mkv)(\?.*)?$/i.test(u) || /video/i.test(u);
  const id = "url-" + Date.now() + "-" + Math.floor(Math.random() * 1e6);
  await putWallpaper({ id, name: decode(u), type: isVideo ? "video" : "image", url: u, createdAt: Date.now() });
  $mediaUrl.value = "";
  wallpapers = (await listWallpapers()).sort((x, y) => x.createdAt - y.createdAt);
  renderWallpapers();
  notifyChanged();
});

function decode(u) {
  try { const p = new URL(u); return p.hostname + p.pathname.slice(0, 30); } catch { return u.slice(0, 40); }
}

$wpMode.addEventListener("change", () => {
  wpCfg = { ...wpCfg, mode: $wpMode.value };
  if (wpCfg.mode === "interval") $intervalLabel.classList.remove("hidden");
  else $intervalLabel.classList.add("hidden");
  saveWallpaperConfig({ mode: wpCfg.mode });
  notifyChanged();
});

$wpInterval.addEventListener("change", () => {
  const sec = Math.max(5, parseInt($wpInterval.value, 10) || 30);
  wpCfg.intervalSec = sec;
  saveWallpaperConfig({ intervalSec: sec });
  notifyChanged();
});

// ---- 通信 ----

function notifyChanged() { parent.postMessage("tap:settings-changed", "*"); }
// 关闭由外层抽屉的关闭按钮负责（settings.html 内无独立关闭按钮）。
// Esc 关闭支持：
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") parent.postMessage("tap:settings-close", "*");
});

// ---- 初始化 ----

async function init() {
  cfg = await loadConfig();
  wpCfg = await loadWallpaperConfig();
  wallpapers = (await listWallpapers()).sort((x, y) => x.createdAt - y.createdAt);
  renderEngines();
  $wpMode.value = wpCfg.mode;
  $wpInterval.value = wpCfg.intervalSec || 30;
  if (wpCfg.mode === "interval") $intervalLabel.classList.remove("hidden");
  renderWallpapers();
}

init();