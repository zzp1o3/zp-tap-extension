// 早期聚焦脚本：抢在 Chrome 抢占地址栏焦点之前，让页面拿到焦点。
//
// 为什么单独一个普通脚本（非 module）：
//   main.js 是 <script type="module">，浏览器会等到 DOMContentLoaded 之后
//   才执行 module——对本地扩展页而言几乎等于 load 之后，Chrome 抢地址栏
//   焦点就发生在这个窗口。本脚本在 <head> 同步加载，DOMContentLoaded 一
//   触发立即 focus，比 module 脚本早，有机会抢在 Chrome 之前。
//
// 只在页面加载期抢（DOMContentLoaded + load 各一次），之后放手不骚扰用户。
(function () {
  function claim() {
    var el = document.getElementById("focus-anchor");
    if (el) el.focus();
  }

  // 首次机会：DOMContentLoaded（早于 load，module 脚本尚未执行）
  document.addEventListener("DOMContentLoaded", claim, { once: true });

  // 二次机会：load 后若焦点不在页面（被 Chrome 抢走/无焦点），补抢一次。
  // 仅在页面加载期，不是持续骚扰。
  window.addEventListener("load", function () {
    var ae = document.activeElement;
    var lost = !ae || ae === document.body || ae === document.documentElement;
    if (lost) claim();
  });
})();