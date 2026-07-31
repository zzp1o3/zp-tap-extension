# 项目约定

## 推送规则（重要）

**未经用户测试通过，禁止推送到远程仓库。**

- 代码改动完成后：本地提交（commit）即可，**不要 `git push`**。
- 重建 `dist/` 和 zip、上传 GitHub Release、push 远程——全部等用户测试通过并明确说"可以推送/OK"之后再做。
- 用户说"没测试通过则不要先推送"（2026-07-31）。

## 发布流程（用户测试通过后）

1. `git push`
2. 重建 dist：`cp` 变更文件到 `dist/` 对应路径
3. 打包：`powershell -Command "Compress-Archive -Path 'dist\*' -DestinationPath 'tap-newtab.zip' -Force"`
4. 上传 release：`gh release upload v0.1.1 tap-newtab.zip --clobber`
