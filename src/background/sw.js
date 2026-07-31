// MV3 service worker：点击扩展图标打开 Tap 页面（普通扩展页，非 newtab override）。
// 普通页导航时浏览器不抢地址栏焦点，页面可像 ChatGPT 一样 autofocus 秒聚焦。

self.addEventListener("install", () => {});

chrome.action.onClicked.addListener(() => {
  const url = chrome.runtime.getURL("src/newtab/index.html");
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const current = tabs[0];
    if (current?.id !== undefined) {
      chrome.tabs.update(current.id, { url });
    } else {
      chrome.tabs.create({ url });
    }
  });
});