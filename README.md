# dsh-computer-use

Desktop-control tools for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH):
screenshot, mouse, keyboard, window management, display info, and clipboard.

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）的桌面操控工具：
截图、鼠标、键盘、窗口管理、显示器信息与剪贴板。

> 本 README 为中英双语：英文原文在前，中文译文紧随其后。
> This README is bilingual: English first, Chinese translation follows.

## Tools 工具

`screen_screenshot`, `screen_mouse_move`, `screen_mouse_click`, `screen_mouse_drag`,
`screen_keyboard_type`, `screen_keyboard_press`, `screen_window_list`, `screen_window_focus`,
`screen_window_get_active`, `screen_display_info`, `screen_clipboard_get`, `screen_clipboard_set`.

共 12 个工具：截图、鼠标移动 / 点击 / 拖拽、键盘输入 / 按键、窗口列表 / 聚焦 / 获取当前窗口、
显示器信息、剪贴板读取 / 写入。

## Install 安装

```sh
# 从本地检出的源码安装 / from a local checkout
dsh plugin --profile web add file:/path/to/dsh-computer-use

# 或直接从 GitHub 安装 / or straight from GitHub
dsh plugin --profile web add github:Febloodfightying/dsh-computer-use
```

之后重启 `dsh web`。 / Restart `dsh web` afterwards.

## System dependencies 系统依赖

`xdotool`, `xclip`, `wmctrl`, `xrandr`, ImageMagick (`import`).

即：xdotool、xclip、wmctrl、xrandr，以及 ImageMagick 的 `import` 命令。

## Security 安全

Every external command runs through `execFileSync` with argument arrays — never
a shell — so tool input can never be interpreted as shell syntax. Keyboard
sequences are validated against a strict token whitelist.

所有外部命令都通过 `execFileSync` 以参数数组方式执行 —— 从不经过 shell ——
因此工具输入永远不会被解释成 shell 语法；键盘序列会按严格的 token 白名单校验。

## Compatibility 兼容性

This plugin declares **no `@deepseek-ai/dsh*` peer dependencies**, so DSH's
profile compatibility preflight (and the plugin market's peer gate) never
denies it, on any runtime version. Tested against DSH 0.1.0-rc.8 and 0.2.0-rc.2.

本插件**不声明任何 `@deepseek-ai/dsh*` peer 依赖**，所以在任何运行时版本下，
DSH 的 profile 兼容性预检（以及插件市场的 peer 门禁）都不会拒绝它。
已在 DSH 0.1.0-rc.8 与 0.2.0-rc.2 上测试通过。

`@deepseek-ai/dsh-attachment` is imported as a namespace and
`isAttachmentError` is feature-detected at load time, so runtimes that predate
that export keep working. `apply()` checks `ctx.tools.register` and
`ctx.systemPrompt.section` and throws a descriptive error if a future DSH
version renames either seam.

`@deepseek-ai/dsh-attachment` 以命名空间方式导入，`isAttachmentError` 在加载时做特性探测，
因此早于该导出的旧运行时仍可正常工作。`apply()` 会检查 `ctx.tools.register` 与
`ctx.systemPrompt.section`，如果未来 DSH 版本重命名了这两个接缝，会抛出带说明的错误。

## License 许可

MIT — see [LICENSE](LICENSE).

MIT —— 见 [LICENSE](LICENSE)。
