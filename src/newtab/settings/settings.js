// 设置面板：引擎增删/拖拽排序/快捷组 N；壁纸上传/删除；轮播模式。
// 与主页面通过 postMessage("tap:settings-close"/"tap:settings-changed") 通信。

import { loadConfig, saveConfig } from "../engines.js";
import {
  listWallpapers, putWallpaper, delWallpaper, compressImage,
  loadWallpaperConfig, saveWallpaperConfig, getWallpaper,
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
const $intervalLabel = document.querySelector(".row .interval");

// ---- 引擎 ----

function renderEngines() {
  $list.innerHTML = "";
  cfg.engines.forEach((e) => {
    const li = document.createElement("li");
    li.className = "engine-item";
    li.draggable = true;
    li.dataset.id = e.id;
    li.innerHTML = `
      <span class="handle" title="拖拽排序">⋮⋮</span>
      <span class="name"></span>
      <span class="url"></span>
      <button class="del" type="button">删除</button>
    `;
    li.querySelector(".name").textContent = e.name + (e.id === cfg.defaultId ? " ·" : "");
    li.querySelector(".url").textContent = e.url;
    li.querySelector(".del").addEventListener("click", () => {
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
    li.addEventListener("dragstart", () => { dragId = li.dataset.id; li.classList.add("dragging"); });
    li.addEventListener("dragend", () => { li.classList.remove("dragging"); clearOver(); });
    li.addEventListener("dragover", (e) => { e.preventDefault(); clearOver(); li.classList.add("drag-over"); });
    li.addEventListener("dragleave", () => li.classList.remove("drag-over"));
    li.addEventListener("drop", (e) => {
      e.preventDefault();
      li.classList.remove("drag-over");
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
  function clearOver() { $list.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over")); }
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
  for (const w of wallpapers) {
    const card = document.createElement("div");
    card.className = "wp-card";
    const rec = await getForThumb(w.id);
    if (rec) {
      const img = document.createElement("img");
      const u = URL.createObjectURL(rec.blob);
      thumbUrls.add(u);
      img.src = u;
      img.alt = w.name;
      card.appendChild(img);
    }
    const btn = document.createElement("button");
    btn.className = "del"; btn.textContent = "删除";
    btn.addEventListener("click", async () => {
      await delWallpaper(w.id);
      wallpapers = (await listWallpapers()).sort((x, y) => x.createdAt - y.createdAt);
      renderWallpapers();
      notifyChanged();
    });
    card.appendChild(btn);
    $wpGrid.appendChild(card);
  }
}

async function getForThumb(id) {
  return await getWallpaper(id);
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
document.getElementById("close").addEventListener("click", () => parent.postMessage("tap:settings-close", "*"));
document.getElementById("done").addEventListener("click", () => parent.postMessage("tap:settings-close", "*"));

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