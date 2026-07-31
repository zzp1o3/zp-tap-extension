# zptap

极简舒适的新标签页。打开即聚焦，打字即搜索，一键直达你收藏和常去的地方。

|![img.png](img.png) | ![img_1.png](img_1.png)  | ![img_2.png](img_2.png)  |
|---|---|---|
|![img_3.png](img_3.png) |   |   |

## 为什么用 zptap

- **打开即聚焦**：新标签页一打开，光标已在搜索框等你。直接打字，无需点击。
- **极简舒适**：默认只有一张安静的背景，没有广告、没有信息流、没有打扰。
- **书签与历史，一键直达**：输入时智能混排你的书签和浏览历史，frecency 打分（频次 × 近期 × 命中位置 × 书签加权），同域名只取最常访问的一条——**你想去的地方永远排在最前**。
- **回车即达**：选中建议直达该 URL；输入像域名（含 TLD）直接进站；其余用当前引擎搜索。

## 特性

### 搜索
- 7 个预设引擎：必应 / 哔哩哔哩 / GitHub / 百度 / 知乎 / Google / Yandex
- 支持自定义任意引擎（名称 + `{q}` URL 模板）并拖拽排序
- 下拉选择 + **Ctrl+↑/Ctrl+↓** 在快捷组内循环
- 常驻搜索框或「打字才出现」两种模式，随你喜欢

### 背景
- 图片 / 视频背景，本地上传或远程 URL
- 客户端自动压缩图片；视频原样保存并自动抓取首帧缩略图
- 轮播模式：每次打开换一张 / 定时切换 / 固定
- 每张卡片可勾选参与轮播、或设为固定背景
- 深色 / 浅色 / 随系统主题，切换有平滑渐变

### 细节
- **favicon 四源回退**：Chrome 本地缓存 → 国内 CDN → Google → 首字母徽章，图标永不缺席
- **约束保护**：至少保留一个轮播项、一个固定项、一个引擎，删光自动回退默认
- 全部数据存于本机，无账号、不上传

## 安装

Chrome / Edge → `chrome://extensions` → 开发者模式 → 加载已解压的扩展程序 → 选择仓库根目录。

或从 [Releases](https://github.com/zzp1o3/zp-tap-extension/releases) 下载 zip 解压后加载。

打开新标签页即可使用。

## 权限

| 权限 | 用途 |
|------|------|
| `bookmarks` | 搜索书签生成直达建议 |
| `history` | 搜索浏览历史生成直达建议 |
| `storage` | 存储引擎列表、快捷组、主题、壁纸配置 |
| `unlimitedStorage` | IndexedDB 壁纸/视频配额冗余 |
| `favicon` | 启用 Chrome 内置 favicon API（四源回退第一级） |

## 目录结构

```
manifest.json
zptop.html                        新标签页主入口（根目录）
_locales/                         i18n（中/英）
icons/                            扩展图标（由 icons/zp-tap.png 派生）
scripts/gen_icons.py              图标生成脚本
src/background/sw.js              MV3 service worker（点击图标打开页面）
src/newtab/
  launch.html launch.js           启动页（立即重定向到 zptop.html，实现打开即聚焦）
  focus-init.js                   早期聚焦脚本
  main.js                         主逻辑
  tailwind.css                    Tailwind 产物（已提交，直接可用）
  tailwind.input.css              Tailwind 源文件 + 主题变量
  engines.js                      搜索引擎配置
  storage.js                      IndexedDB + chrome.storage 封装
  suggestions.js                  搜索建议 + 打分 + 渲染
  url-detect.js                   URL 判定器
  favicon.js                      四源 favicon 回退
  settings/
    settings.html settings.js     右侧抽屉设置面板
```

## 开发

- 纯原生 HTML/JS，无运行时构建依赖，`npm install` 仅用于修改样式后重生成 Tailwind CSS。
- 修改 `tailwind.input.css` 后：`npm install && npm run build:css`
- 重派生图标：`uv run --with=pillow python scripts/gen_icons.py`

## License

MIT
