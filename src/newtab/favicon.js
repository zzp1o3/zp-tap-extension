// favicon 取地址：统一走 Google s2/favicons（HTTPS，对 newtab override 页稳定可用）。
// chrome://favicon2 在 override 页面常被 CSP 拦截，不再使用。
export function getFaviconUrl(pageUrl) {
  let host = "";
  try { host = new URL(pageUrl).hostname; } catch { return ""; }
  if (!host) return "";
  return `https://www.google.com/s2/favicons?sz=32&domain=${encodeURIComponent(host)}`;
}