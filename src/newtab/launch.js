// 启动页重定向：让地址栏显示完整 URL，避免 Chrome 因地址栏为空而抢占焦点。
//
// Chrome 逻辑：新标签页 override 加载时地址栏为空 → 聚焦地址栏（等待用户输入）；
// 若地址栏已显示 URL（导航到普通页），焦点归页面。通过立即重定向到实际页面
// (zptop.html)，地址栏获得 chrome-extension://.../zptop.html URL，页面即可保住焦点。
(function () {
  try {
    const target = chrome.runtime.getURL("zptop.html");
    if (location.href !== target) {
      location.replace(target);
    }
  } catch (e) {
    // 失败则留在启动页，页面本身也可用
  }
})();