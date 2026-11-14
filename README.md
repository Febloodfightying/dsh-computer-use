# dsh-computer-use

Desktop-control tools for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH):
screenshot, mouse, keyboard, window management, display info, and clipboard.

## Tools

`screen_screenshot`, `screen_mouse_move`, `screen_mouse_click`, `screen_mouse_drag`,
`screen_keyboard_type`, `screen_keyboard_press`, `screen_window_list`, `screen_window_focus`,
`screen_window_get_active`, `screen_display_info`, `screen_clipboard_get`, `screen_clipboard_set`.

## Install

```sh
# from a local checkout
dsh plugin --profile web add file:/path/to/dsh-computer-use

# or straight from GitHub
dsh plugin --profile web add github:Febloodfightying/dsh-computer-use
```

Restart `dsh web` afterwards.

## System dependencies

`xdotool`, `xclip`, `wmctrl`, `xrandr`, ImageMagick (`import`).

## Security

Every external command runs through `execFileSync` with argument arrays — never
a shell — so tool input can never be interpreted as shell syntax. Keyboard
sequences are validated against a strict token whitelist.

## Compatibility

This plugin declares **no `@deepseek-ai/dsh*` peer dependencies**, so DSH's
profile compatibility preflight (and the plugin market's peer gate) never
denies it, on any runtime version. Tested against DSH 0.1.0-rc.8 and 0.2.0-rc.2.

`@deepseek-ai/dsh-attachment` is imported as a namespace and
`isAttachmentError` is feature-detected at load time, so runtimes that predate
that export keep working. `apply()` checks `ctx.tools.register` and
`ctx.systemPrompt.section` and throws a descriptive error if a future DSH
version renames either seam.

## License

MIT — see [LICENSE](LICENSE).
