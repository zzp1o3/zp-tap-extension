# Tap 新标签页

一个极简的 Chrome / Edge 新标签页扩展。

## 特性

- **极简默认态**：打开新标签页只见一张壁纸，无可视控件。
- **打字即唤出**：按下任意字符键即唤出顶部搜索框与建议面板；功能键不触发。
- **国内搜索引擎切换**：
  - 预置：百度 / 必应中国版 / 搜狗 / 360 / 知乎 / 微博 / 哔哩哔哩
  - 支持自定义任意引擎（名称 + 含 `{q}` 的 URL 模板）并拖拽排序
  - 下拉选择器 + **Ctrl+↑/Ctrl+↓** 在「快捷组」内循环（快捷组 = 排序后的前 N 项，N 可在设置中配置）
- **智能直达**：搜索建议混排书签与浏览历史，统一 `frecency` 打分（频次 × 最近访问衰减 × 命中位置 × 书签加权），历史按域名折叠取最近 2-3 条。
- **回车语义**：输入被判定为 URL → 直达该站点；否则用当前引擎搜索。
- **自定义轮播壁纸**：上传本地图片，自动压缩后存于本机 IndexedDB，无外网依赖；支持「每次打开换一张」与「定时间隔切换」两种模式。
- 全部数据存于本地，不联网、不上传、无账号。

## 安装（开发模式）

1. 克隆仓库：`git clone <repo-url>`
2. 打开 Chrome，进入 `chrome://extensions`
3. 开启右上角「开发者模式」
4. 点击「加载已解压的扩展程序」，选择本仓库根目录
5. 打开一个新标签页即可看到效果

## 权限说明

| 权限 | 用途 |
|------|------|
| `bookmarks` | 搜索书签生成直达建议 |
| `history` | 搜索浏览历史生成直达建议 |
| `storage` | 存储引擎列表、快捷组、壁纸配置 |
| `unlimitedStorage` | 壁纸可能较大，避开 `storage.local` 的 10MB 限制（壁纸实际存 IndexedDB，此项为冗余保险） |
| `favicon` | 在建议项旁展示站点图标 |

所有数据仅存于本机，扩展不发起任何外部网络请求（favicon 由浏览器内置 `chrome://favicon2` 解析）。

## 目录结构

```
manifest.json
icons/                   扩展图标（由 icons/zp-tap.png 派生）
scripts/gen_icons.py     图标生成脚本（开发用）
src/newtab/
  index.html main.js     新标签页
  tailwind.css           Tailwind 产物（已提交，改样式后用 npm run build:css 重生成）
  tailwind.input.css     Tailwind 源与主题
  engines.js storage.js suggestions.js url-detect.js favicon.js
  settings/
    settings.html settings.js
src/background/sw.js      MV3 service worker（占位）
_locales/                 i18n（中/英，Chrome 要求置于扩展根目录）
package.json              devDependencies: tailwindcss（仅开发时用）
```

## 开发

- 纯原生 HTML/JS，无运行时构建；扩展直接加载本目录即可。
- 样式基于 **Tailwind CSS v4**（已预生成 `src/newtab/tailwind.css` 并提交，加载即可用）。
  修改样式后重生成：`npm install && npm run build:css`（或 `./node_modules/.bin/tailwindcss -i src/newtab/tailwind.input.css -o src/newtab/tailwind.css --content "src/newtab/**/*.html,src/newtab/**/*.js"`）。
- 图标来自 `icons/zp-tap.png`，重新派生各尺寸：`uv run --with=pillow python scripts/gen_icons.py`。

- 纯原生 HTML/JS，运行时无构建；样式经 Tailwind 预生成。

## License

MIT