// 存储层：壁纸走 IndexedDB，其它配置走 chrome.storage.local。
//
// IndexedDB 名 "tap-newtab"，仓库 "wallpapers"，键为壁纸 id（时间戳串）。
// 每条记录：{ id, name, blob, createdAt, width, height }
//   存 Blob 可直接转 ObjectURL，省内存且类型友好。
//
// 轮播与轮播模式也属于配置，键 "wallpaper.config"：
//   { mode: "per-open" | "interval", intervalSec: number, currentId: string|null }

const DB_NAME = "tap-newtab";
const STORE = "wallpapers";
const CFG_KEY = "wallpaper.config";

let _dbp = null;
function db() {
  if (_dbp) return _dbp;
  _dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(STORE)) {
        d.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbp;
}

// 保存一张壁纸（传入已压缩的 Blob）
export async function putWallpaper(record) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function delWallpaper(id) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function listWallpapers() {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getWallpaper(id) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// 把上传的图片 File 压缩到约 maxSize 以内（长边限 maxEdge）。
// 输出 JPEG Blob（壁纸场景无须保留透明通道）。
export async function compressImage(file, { maxEdge = 1920, maxSize = 2 * 1024 * 1024 } = {}) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  // 逐步降质直到体积达标；起始 0.85
  let quality = 0.85;
  let blob = await canvasToBlob(canvas, "image/jpeg", quality);
  while (blob && blob.size > maxSize && quality > 0.45) {
    quality -= 0.1;
    blob = await canvasToBlob(canvas, "image/jpeg", quality);
  }
  return {
    blob,
    width: w,
    height: h,
  };
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob(
      (b) => resolve(b),
      type,
      quality
    );
  });
}

// ---- 壁纸配置（chrome.storage.local）----

const DEFAULT_WPCFG = { mode: "per-open", intervalSec: 30, currentId: null };

export async function loadWallpaperConfig() {
  const got = await chrome.storage.local.get(CFG_KEY);
  const cfg = got[CFG_KEY] || {};
  return { ...DEFAULT_WPCFG, ...cfg };
}

export async function saveWallpaperConfig(patch) {
  const cur = await loadWallpaperConfig();
  const next = { ...cur, ...patch };
  await chrome.storage.local.set({ [CFG_KEY]: next });
  return next;
}