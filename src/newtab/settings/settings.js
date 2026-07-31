// 设置面板：引擎增删/拖拽排序/快捷组 N；壁纸上传/删除；轮播模式。
// 与主页面通过 postMessage("tap:settings-close"/"tap:settings-changed") 通信。

import { loadConfig, saveConfig } from "../engines.js";
import {
  listWallpapers, putWallpaper, delWallpaper, compressImage, probeVideo, captureVideoPoster,
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
const CHECK_SVG = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`;

// ---- 引擎 ----

const ENGINE_ITEM_CLASS = [
  "flex", "items-center", "gap-2.5", "px-2.5", "py-2", "rounded-xl",
  "border", "transition-all", "duration-200", "ease-in-out",
].join(" ");

function renderEngines() {
  $list.innerHTML = "";
  cfg.engines.forEach((e) => {
    const li = document.createElement("li");
    li.className = "engine-item " + ENGINE_ITEM_CLASS;
    li.style.background = "var(--tp-input)";
    li.style.borderColor = "var(--tp-line)";
    li.draggable = true;
    li.dataset.id = e.id;
    li.innerHTML = `
      <span class="handle cursor-grab select-none" style="color:var(--tp-tx-dim)" title="拖拽排序">${GRIP_SVG}</span>
      <span class="name text-[14px] flex-none w-[110px] truncate" style="color:var(--tp-tx-3)"></span>
      <span class="url text-[12px] flex-1 truncate" style="color:var(--tp-tx-dim)"></span>
      <button class="del transition-all duration-300 ease-in-out hover:scale-110 hover:text-red-400" style="color:var(--tp-tx-dim)" type="button" title="删除">${TRASH_SVG}</button>
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
    li.addEventListener("dragover", (e) => { e.preventDefault(); clearOver(); li.style.borderColor = "var(--tp-tx)"; });
    li.addEventListener("dragleave", () => { li.style.borderColor = ""; });
    li.addEventListener("drop", (e) => {
      e.preventDefault();
      li.style.borderColor = "";
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
  function clearOver() { $list.querySelectorAll(".engine-item").forEach((el) => { el.style.borderColor = ""; }); }
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
    card.className = "relative rounded-xl overflow-hidden border";
    card.style.borderColor = "var(--tp-line)";
    card.style.background = "var(--tp-upload)";
    card.style.aspectRatio = "16 / 10";

    // 缩略图
    if (w.blob && w.type !== "video") {
      const img = document.createElement("img");
      const u = URL.createObjectURL(w.blob);
      thumbUrls.add(u);
      img.src = u; img.alt = w.name;
      img.className = "w-full h-full object-cover block";
      card.appendChild(img);
    } else if (w.url && w.type !== "video") {
      // URL 图片：直接用 URL 作 img src，浏览器加载 = 本地上传同等效果
      const img = document.createElement("img");
      img.src = w.url; img.alt = w.url;
      img.className = "w-full h-full object-cover block";
      img.onerror = () => {
        img.remove();
        card.appendChild(makePlayOverlay(w));
      };
      card.appendChild(img);
    } else if (w.poster) {
      // 视频有 poster 缩略图：显示图片 + 播放三角
      const img = document.createElement("img");
      const u = URL.createObjectURL(w.poster);
      thumbUrls.add(u);
      img.src = u; img.alt = w.name;
      img.className = "w-full h-full object-cover block";
      card.appendChild(img);
      const play = document.createElement("div");
      play.className = "pointer-events-none absolute inset-0 flex items-center justify-center";
      play.innerHTML = PLAY_SVG;
      card.appendChild(play);
    } else {
      // 视频无 poster：播放图标叠加
      card.appendChild(makePlayOverlay(w));
    }
    if (w.type === "video") {
      const badge = document.createElement("span");
      badge.className = "absolute top-1 left-1 px-1.5 py-0.5 rounded text-[10px]";
      badge.style.background = "var(--tp-badge)";
      badge.style.color = "var(--tp-tx)";
      badge.textContent = "视频";
      card.appendChild(badge);
    }

    // 轮播勾选框
    const cb = document.createElement("button");
    cb.className = "absolute bottom-1 left-1 px-1.5 py-0.5 rounded text-[10px] transition-all duration-300 ease-in-out hover:scale-110 flex items-center gap-0.5";
    cb.style.background = w.carousel !== false ? "var(--tp-glass2)" : "var(--tp-badge)";
    cb.style.color = "var(--tp-tx)";
    cb.innerHTML = (w.carousel !== false ? CHECK_SVG : "") + " 轮播";
    cb.title = "参与轮播";
    cb.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      w.carousel = w.carousel === false;
      await putWallpaper(w);
      renderWallpapers();
      notifyChanged();
    });
    card.appendChild(cb);

    // 固定勾选框
    const fb = document.createElement("button");
    fb.className = "absolute bottom-1 left-[70px] px-1.5 py-0.5 rounded text-[10px] transition-all duration-300 ease-in-out hover:scale-110 flex items-center gap-0.5";
    fb.style.background = w.fixed ? "var(--tp-glass2)" : "var(--tp-badge)";
    fb.style.color = "var(--tp-tx)";
    fb.innerHTML = (w.fixed ? CHECK_SVG : "") + " 固定";
    fb.title = "固定背景（固定模式下显示此项）";
    fb.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      w.fixed = !w.fixed;
      await putWallpaper(w);
      renderWallpapers();
      notifyChanged();
    });
    card.appendChild(fb);

    // 删除
    const btn = document.createElement("button");
    btn.className = "absolute top-1 right-1 px-2 py-0.5 rounded-md text-[12px] transition-all duration-300 ease-in-out hover:scale-110";
    btn.style.background = "var(--tp-badge)";
    btn.style.color = "var(--tp-tx)";
    btn.innerHTML = TRASH_SVG;
    btn.title = "删除";
    btn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
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

function makePlayOverlay(w) {
  const div = document.createElement("div");
  div.className = "w-full h-full flex flex-col items-center justify-center text-[11px] gap-1 px-1";
  div.style.color = "var(--tp-tx-dim)";
  const name = w.name || w.url || "";
  const el = document.createElement("span");
  el.className = "truncate max-w-full";
  el.textContent = name;
  div.appendChild(el);
  const play = document.createElement("div");
  play.className = "pointer-events-none absolute inset-0 flex items-center justify-center";
  play.innerHTML = PLAY_SVG;
  div.appendChild(play);
  return div;
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

// 上传视频（不压缩，原样存。首帧异步抓取为 poster 缩略图）
$videoFile.addEventListener("change", async () => {
  const files = Array.from($videoFile.files || []);
  for (const f of files) {
    const [meta, poster] = await Promise.all([
      probeVideo(f).catch(() => ({ width: 0, height: 0 })),
      captureVideoPoster(f).catch(() => undefined),
    ]);
    const id = "video-" + Date.now() + "-" + Math.floor(Math.random() * 1e6);
    await putWallpaper({ id, name: f.name, type: "video", blob: f, poster, width: meta.width, height: meta.height, createdAt: Date.now() });
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
  // 切换模式时重置 currentIndex
  saveWallpaperConfig({ mode: wpCfg.mode, currentIndex: 0 });
  notifyChanged();
});

$wpInterval.addEventListener("change", () => {
  const sec = Math.max(5, parseInt($wpInterval.value, 10) || 30);
  wpCfg.intervalSec = sec;
  saveWallpaperConfig({ intervalSec: sec });
  notifyChanged();
});

// ---- 主题 ----

async function applyTheme(theme) {
  // 保存到 chrome.storage，通知父页立即生效
  await chrome.storage.local.set({ theme });
  document.querySelectorAll(".theme-btn").forEach((b) => {
    b.style.background = b.dataset.theme === theme ? "var(--tp-select)" : "transparent";
    b.style.color = b.dataset.theme === theme ? "var(--tp-tx)" : "var(--tp-tx-dim)";
  });
  parent.postMessage("tap:settings-changed", "*");
}
document.querySelectorAll(".theme-btn").forEach((b) => {
  b.addEventListener("click", () => applyTheme(b.dataset.theme));
});

// ---- 通信 ----

function notifyChanged() { parent.postMessage("tap:settings-changed", "*"); }
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") parent.postMessage("tap:settings-close", "*");
});

// ---- 初始化 ----

async function init() {
  // 主题按钮高亮
  const th = (await chrome.storage.local.get("theme")).theme || "system";
  document.querySelectorAll(".theme-btn").forEach((b) => {
    b.style.background = b.dataset.theme === th ? "var(--tp-select)" : "transparent";
    b.style.color = b.dataset.theme === th ? "var(--tp-tx)" : "var(--tp-tx-dim)";
  });

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