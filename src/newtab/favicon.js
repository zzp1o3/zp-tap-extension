// favicon 取地址。优先使用 Chrome 扩展自带 favicon 服务（chrome-extension:// 协议），
// 失败回退到 Google s2/favicons。
export function getFaviconUrl(pageUrl) {
  try {
    const u = new URL(pageUrl);
    // Chrome 内置：chrome://favicon/size/.../https://site
    // MV3 下用 chrome://favicon2 更稳；但该协议仅扩展自身页面可用。
    if (chrome?.runtime?.getURL) {
      return `chrome://favicon2/?sz=32&page_url=${encodeURIComponent(u.origin)}`;
    }
  } catch {}
  const host = (() => {
    try { return new URL(pageUrl).hostname; } catch { return ""; }
  })();
  if (!host) return "";
  return `https://www.google.com/s2/favicons?sz=32&domain=${encodeURIComponent(host)}`;
}