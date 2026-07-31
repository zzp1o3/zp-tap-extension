// 存储层：背景媒体（图片/视频）走 IndexedDB，其它配置走 chrome.storage.local。
//
// IndexedDB 名 "tap-newtab"，仓库 "wallpapers"（保留旧名以兼容已有数据），键为 id（时间戳串）。
// 每条记录（媒体项）：
//   { id, name, type: "image" | "video", createdAt, blob?, url?, width?, height? }
//   - blob：本地文件经压缩(图片)或直存(视频)后的 Blob。
//   - url ：远程 URL（无 blob）。
// 两者择一：本地有 blob，远程用 url。
//
// 配置（chrome.storage.local，键 "wallpaper.config"，已迁移到 currentIndex 语义）：
//   { mode: "per-open" | "interval", intervalSec: number,
//     currentId: string|null,   // 旧字段，保留以兼容；优先用 currentIndex
//     currentIndex: number      // per-open/interval 轮播的当前序列位置
//   }

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

// 读取本地视频元数据（resolution、duration），const 不压缩直接存。
// 视频压缩成本高且质量损失大，故原样保存，由浏览器解码。
export async function probeVideo(file) {
  const url = URL.createObjectURL(file);
  try {
    const meta = await new Promise((resolve, reject) => {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.muted = true;
      v.src = url;
      v.onloadedmetadata = () => resolve({
        width: v.videoWidth || 0,
        height: v.videoHeight || 0,
        duration: v.duration || 0,
      });
      v.onerror = () => reject(new Error("无法读取视频元数据"));
    });
    return meta;
  } finally {
    // 元数据已读，可释放（实际播放另起 ObjectURL）
    URL.revokeObjectURL(url);
  }
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

// ---- 配置（chrome.storage.local）----

const DEFAULT_WPCFG = { mode: "per-open", intervalSec: 30, currentId: null, currentIndex: 0 };

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