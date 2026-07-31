// 设置面板：引擎增删/拖拽排序/快捷组 N；壁纸上传/删除；轮播模式。
// 与主页面通过 postMessage("tap:settings-close"/"tap:settings-changed") 通信。

import { loadConfig, saveConfig } from "../engines.js";
import {
  listWallpapers, putWallpaper, delWallpaper, compressImage,
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

// ---- 壁纸 ----

const thumbUrls = new Set();

async function renderWallpapers() {
  // 先 revoke 旧的 object URL，避免泄漏
  for (const u of thumbUrls) URL.revokeObjectURL(u);
  thumbUrls.clear();
  $wpGrid.innerHTML = "";
  // wallpapers 已含完整 blob（listWallpapers 走 getAll），无需逐张再读 IndexedDB
  for (const w of wallpapers) {
    const card = document.createElement("div");
    card.className = "relative rounded-xl overflow-hidden border border-white/10";
    card.style.aspectRatio = "16 / 10";
    if (w.blob) {
      const img = document.createElement("img");
      const u = URL.createObjectURL(w.blob);
      thumbUrls.add(u);
      img.src = u;
      img.alt = w.name;
      img.className = "w-full h-full object-cover block";
      card.appendChild(img);
    }
    const btn = document.createElement("button");
    btn.className = "absolute top-1 right-1 px-2 py-0.5 rounded-md bg-black/55 text-white text-[12px] transition-all duration-300 ease-in-out hover:bg-black/75 hover:scale-110";
    btn.innerHTML = TRASH_SVG;
    btn.title = "删除";
    btn.addEventListener("click", async () => {
      await delWallpaper(w.id);
      wallpapers = (await listWallpapers()).sort((x, y) => x.createdAt - y.createdAt);
      // 删除的若是当前轮播壁纸，清掉 currentId，避免 main.js 还指向已删 id
      wpCfg = await loadWallpaperConfig();
      if (wpCfg.currentId === w.id) {
        wpCfg = await saveWallpaperConfig({ currentId: null });
      }
      renderWallpapers();
      notifyChanged();
    });
    card.appendChild(btn);
    $wpGrid.appendChild(card);
  }
}

$wpFile.addEventListener("change", async () => {
  const files = Array.from($wpFile.files || []);
  for (const f of files) {
    const { blob, width, height } = await compressImage(f);
    const id = "wp-" + Date.now() + "-" + Math.floor(Math.random() * 1e6);
    await putWallpaper({ id, name: f.name, blob, width, height, createdAt: Date.now() });
  }
  $wpFile.value = "";
  wallpapers = (await listWallpapers()).sort((x, y) => x.createdAt - y.createdAt);
  renderWallpapers();
  notifyChanged();
});

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