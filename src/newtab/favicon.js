// favicon 多源回退：
//   1. Chrome 内置 _favicon（本机缓存，零延迟，需 favicon 权限）
//   2. 国内 CDN favicon.cccyun.cc（无 VPN 首选）
//   3. Google s2/favicons（VPN 用户更高质量）
//   4. 字母徽章（纯 CSS，永不失败）
//
// 在 img 的 onerror 链式回退到下一源。

// Chrome 扩展 _favicon API（需 manifest "favicon" 权限）
export function getChromeFaviconUrl(pageUrl) {
  try {
    const extId = chrome?.runtime?.id;
    if (extId) {
      // MV3 favicon 权限的公开 API
      return `chrome-extension://${extId}/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=32`;
    }
  } catch {}
  return "";
}

// 国内 CDN 备用
export function getCdnFaviconUrl(pageUrl) {
  let host = "";
  try { host = new URL(pageUrl).hostname; } catch { return ""; }
  if (!host) return "";
  return `https://favicon.cccyun.cc/${encodeURIComponent(host)}`;
}

// Google s2 favicons（VPN 用户高质量备用）
export function getGoogleFaviconUrl(pageUrl) {
  let host = "";
  try { host = new URL(pageUrl).hostname; } catch { return ""; }
  if (!host) return "";
  return `https://www.google.com/s2/favicons?sz=32&domain=${encodeURIComponent(host)}`;
}

// 主入口：返回 chrome favicon URL
export function getFaviconUrl(pageUrl) {
  return getChromeFaviconUrl(pageUrl);
}