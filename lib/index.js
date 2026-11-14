import { execSync } from "node:child_process";
import { existsSync, writeFileSync, unlinkSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { isAttachmentError } from "@deepseek-ai/dsh-attachment";

// =========================================================================
// Utility helpers
// =========================================================================

function run(cmd, timeoutMs) {
  if (timeoutMs === undefined) timeoutMs = 30000;
  try {
    return execSync(cmd, {
      encoding: "utf-8",
      timeout: timeoutMs,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (err) {
    const stderr = (err.stderr && err.stderr.toString().trim()) || "";
    const stdout = (err.stdout && err.stdout.toString().trim()) || "";
    const msg = stderr || stdout || err.message;
    throw new Error("Command failed: " + cmd + "\n" + msg);
  }
}

function requireTool(name, installHint) {
  try {
    execSync("which " + name, { encoding: "utf-8", stdio: "pipe" });
  } catch {
    throw new Error('Required tool "' + name + '" is not installed. ' + (installHint || ""));
  }
}

function text(content) {
  return [{ type: "text", text: content }];
}

function takeScreenshot(display) {
  const tmpFile = join(tmpdir(), "dsh-computer-use-" + Date.now() + ".png");
  try {
    const dispArg = display ? " -display " + display : "";
    run("import" + dispArg + ' -window root "' + tmpFile + '"', 10000);
    if (!existsSync(tmpFile)) throw new Error("Screenshot file was not created");
    return readFileSync(tmpFile);
  } finally {
    try { unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

function getDisplay() {
  try {
    return run("echo $DISPLAY") || ":0";
  } catch {
    return ":0";
  }
}


// =========================================================================
// Tool: screen_screenshot
// =========================================================================
function screenshotTool(ctx) {
  return defineTool({
    name: "screen_screenshot",
    description:
      "Capture a screenshot of the current desktop. Returns the image that the AI can see. Use this to understand what is on screen before performing other actions.",
    parameters: {},
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          image: {
            type: "object",
            additionalProperties: false,
            required: true,
            properties: {
              attachmentId: { type: "string", required: true },
              mediaType: { type: "string", required: true, enum: ["image/png", "image/jpeg", "image/webp", "image/gif"] },
              bytes: { type: "integer", required: true },
              width: { type: "integer", required: true },
              height: { type: "integer", required: true },
              name: { type: "string" },
            },
          },
          width: { type: "integer", required: true },
          height: { type: "integer", required: true },
        },
      },
      render: (_args, value) => [
        { type: "text", text: "Desktop screenshot captured: " + value.image.width + "x" + value.image.height + "px " + value.image.mediaType + " (" + value.image.bytes + " bytes)" },
        { type: "image", attachment: value.image },
      ],
    },
    isConcurrencySafe: () => true,
    async execute() {
      requireTool("import", "Install ImageMagick: sudo apt install imagemagick");
      const display = getDisplay();
      const data = takeScreenshot(display);
      const attachments = ctx.get("attachments");
      if (attachments === void 0) throw new Error("screen_screenshot: no attachment service is mounted");
      let ref;
      try {
        ref = await attachments.saveImage({ data, mediaType: "image/png", name: "desktop-screenshot.png" });
      } catch (err) {
        if (!isAttachmentError(err)) throw err;
        if (err.code === "IMAGE_DIMENSION_TOO_LARGE") throw new Error("screen_screenshot: the screen exceeds the " + attachments.imageLimits.maxImageDimension + "px dimension limit; resize the display and retry");
        if (err.code === "IMAGE_TOO_MANY_PIXELS") throw new Error("screen_screenshot: the screen exceeds the " + attachments.imageLimits.maxImagePixels + "-pixel limit; resize the display and retry");
        if (err.code === "IMAGE_TOO_LARGE") throw new Error("screen_screenshot: the screenshot exceeds the deployment's image byte limit; resize the display and retry");
        if (err.code === "IMAGE_TYPE_MISMATCH") throw new Error("screen_screenshot: captured image type was not accepted by this deployment");
        throw err;
      }
      return {
        image: {
          attachmentId: ref.attachmentId,
          mediaType: ref.mediaType,
          bytes: ref.bytes,
          width: ref.width,
          height: ref.height,
          ...(ref.name === void 0 ? {} : { name: ref.name }),
        },
        width: ref.width,
        height: ref.height,
      };
    },
  });
}

// =========================================================================
// Tool: screen_mouse_move
// =========================================================================
function mouseMoveTool() {
  return defineTool({
    name: "screen_mouse_move",
    description:
      "Move the mouse cursor to absolute screen coordinates (x, y). Use screen_screenshot first to see the current screen layout.",
    parameters: {
      x: { type: "integer", required: true, description: "Target X coordinate (0 = left edge of screen)." },
      y: { type: "integer", required: true, description: "Target Y coordinate (0 = top edge of screen)." },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          x: { type: "integer", required: true },
          y: { type: "integer", required: true },
          success: { type: "boolean", required: true },
        },
      },
      render: (_args, value) =>
        text(value.success ? "Moved cursor to (" + value.x + ", " + value.y + ")" : "Failed to move cursor"),
    },
    async execute(args) {
      requireTool("xdotool", "Install xdotool: sudo apt install xdotool");
      run("xdotool mousemove " + args.x + " " + args.y);
      return { x: args.x, y: args.y, success: true };
    },
  });
}

// =========================================================================
// Tool: screen_mouse_click
// =========================================================================
function mouseClickTool() {
  return defineTool({
    name: "screen_mouse_click",
    description:
      "Click a mouse button at the current cursor position. Defaults to left click. Use after screen_mouse_move to click on a specific target.",
    parameters: {
      button: { type: "string", enum: ["left", "middle", "right"], description: "Mouse button to click (default: left)." },
      clicks: { type: "integer", description: "Number of clicks (1=single, 2=double, default: 1)." },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          button: { type: "string", required: true },
          clicks: { type: "integer", required: true },
          success: { type: "boolean", required: true },
        },
      },
      render: (_args, value) => {
        const label = value.clicks > 1 ? value.clicks + "x " + value.button : value.button;
        return text(value.success ? label + " click performed" : "Click failed");
      },
    },
    async execute(args) {
      requireTool("xdotool", "Install xdotool: sudo apt install xdotool");
      const btn = args.button || "left";
      const clicks = args.clicks || 1;
      const btnMap = { left: 1, middle: 2, right: 3 };
      const btnNum = btnMap[btn] || 1;
      for (let i = 0; i < clicks; i++) {
        run("xdotool click " + btnNum);
      }
      return { button: btn, clicks, success: true };
    },
  });
}

// =========================================================================
// Tool: screen_mouse_drag
// =========================================================================
function mouseDragTool() {
  return defineTool({
    name: "screen_mouse_drag",
    description:
      "Press and hold a mouse button, move to destination coordinates, then release. Useful for dragging files, selecting text, or moving windows.",
    parameters: {
      startX: { type: "integer", required: true, description: "Starting X coordinate." },
      startY: { type: "integer", required: true, description: "Starting Y coordinate." },
      endX: { type: "integer", required: true, description: "Ending X coordinate." },
      endY: { type: "integer", required: true, description: "Ending Y coordinate." },
      button: { type: "string", enum: ["left", "middle", "right"], description: "Mouse button to hold (default: left)." },
      durationMs: { type: "integer", description: "Duration of the drag in milliseconds (default: 200)." },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          startX: { type: "integer", required: true },
          startY: { type: "integer", required: true },
          endX: { type: "integer", required: true },
          endY: { type: "integer", required: true },
          success: { type: "boolean", required: true },
        },
      },
      render: (_args, value) =>
        text(value.success ? "Dragged from (" + value.startX + ", " + value.startY + ") to (" + value.endX + ", " + value.endY + ")" : "Drag failed"),
    },
    async execute(args) {
      requireTool("xdotool", "Install xdotool: sudo apt install xdotool");
      const btn = args.button || "left";
      const btnMap = { left: 1, middle: 2, right: 3 };
      const btnNum = btnMap[btn] || 1;
      run("xdotool mousemove " + args.startX + " " + args.startY);
      run("xdotool mousedown " + btnNum);
      run("xdotool mousemove " + args.endX + " " + args.endY);
      run("sleep 0.1");
      run("xdotool mouseup " + btnNum);
      return { startX: args.startX, startY: args.startY, endX: args.endX, endY: args.endY, success: true };
    },
  });
}


// =========================================================================
// Tool: screen_keyboard_type
// =========================================================================
function keyboardTypeTool() {
  return defineTool({
    name: "screen_keyboard_type",
    description:
      "Type a string of text at the current cursor position. The text will be typed as if on a keyboard. Special characters and newlines are supported.",
    parameters: {
      text: { type: "string", required: true, description: "The text to type." },
      delayMs: { type: "integer", description: "Delay between keystrokes in milliseconds (default: 12)." },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          length: { type: "integer", required: true },
          success: { type: "boolean", required: true },
        },
      },
      render: (_args, value) => text(value.success ? "Typed " + value.length + " characters" : "Failed to type text"),
    },
    async execute(args) {
      requireTool("xdotool", "Install xdotool: sudo apt install xdotool");
      const delay = args.delayMs || 12;
      const tmpFile = join(tmpdir(), "dsh-type-" + Date.now() + ".txt");
      try {
        writeFileSync(tmpFile, args.text, "utf-8");
        run("xdotool type --delay " + delay + " --file " + tmpFile);
      } finally {
        try { unlinkSync(tmpFile); } catch { /* ignore */ }
      }
      return { length: args.text.length, success: true };
    },
  });
}

// =========================================================================
// Tool: screen_keyboard_press
// =========================================================================
function keyboardPressTool() {
  return defineTool({
    name: "screen_keyboard_press",
    description:
      "Press a specific key or key combination. Examples: 'Return', 'Tab', 'Escape', 'BackSpace', 'Delete', 'Up', 'Down', 'Left', 'Right', 'ctrl+c', 'alt+Tab', 'ctrl+shift+Escape'.",
    parameters: {
      keys: { type: "string", required: true, description: "Key or key combination to press. Use '+' for combinations." },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          keys: { type: "string", required: true },
          success: { type: "boolean", required: true },
        },
      },
      render: (_args, value) => text(value.success ? "Pressed: " + value.keys : "Failed to press key"),
    },
    async execute(args) {
      requireTool("xdotool", "Install xdotool: sudo apt install xdotool");
      run("xdotool key " + args.keys);
      return { keys: args.keys, success: true };
    },
  });
}

// =========================================================================
// Tool: screen_window_list
// =========================================================================
function windowListTool() {
  return defineTool({
    name: "screen_window_list",
    description:
      "List all visible windows on the desktop with their window IDs, titles, and geometry (position and size).",
    parameters: {},
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          windows: {
            type: "array",
            required: true,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                id: { type: "string", required: true },
                title: { type: "string", required: true },
                x: { type: "integer" },
                y: { type: "integer" },
                width: { type: "integer" },
                height: { type: "integer" },
                desktop: { type: "integer" },
                isActive: { type: "boolean" },
              },
            },
          },
        },
      },
      render: (_args, value) => {
        const lines = value.windows.map(function (w) {
          return "[" + w.id + "] " + w.title + " (" + (w.x != null ? w.x : "?") + "," + (w.y != null ? w.y : "?") + ") " + (w.width != null ? w.width : "?") + "x" + (w.height != null ? w.height : "?");
        });
        return text(lines.length > 0 ? lines.join("\n") : "No windows found.");
      },
    },
    async execute() {
      requireTool("xdotool", "Install xdotool: sudo apt install xdotool");
      requireTool("wmctrl", "Install wmctrl: sudo apt install wmctrl");
      const raw = run("wmctrl -lG");
      let activeId = "";
      try { activeId = run("xdotool getactivewindow"); } catch { /* ignore */ }
      const windows = raw
        .split("\n")
        .filter(Boolean)
        .map(function (line) {
          const parts = line.split(/\s+/);
          if (parts.length < 7) return null;
          return {
            id: parts[0],
            desktop: parseInt(parts[1], 10),
            x: parseInt(parts[2], 10),
            y: parseInt(parts[3], 10),
            width: parseInt(parts[4], 10),
            height: parseInt(parts[5], 10),
            title: parts.slice(7).join(" ") || "(unnamed)",
            isActive: parts[0] === activeId,
          };
        })
        .filter(Boolean);
      return { windows };
    },
  });
}

// =========================================================================
// Tool: screen_window_focus
// =========================================================================
function windowFocusTool() {
  return defineTool({
    name: "screen_window_focus",
    description:
      "Bring a window to the foreground and give it focus. Use screen_window_list first to get the window ID or match by title.",
    parameters: {
      windowId: { type: "string", description: "Exact window ID (hex, e.g. '0x1234567'). Either windowId or titleMatch is required." },
      titleMatch: { type: "string", description: "Substring to match against window titles. Either windowId or titleMatch is required." },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          windowId: { type: "string", required: true },
          title: { type: "string" },
          success: { type: "boolean", required: true },
        },
      },
      render: (_args, value) => text(value.success ? "Focused window: " + (value.title || value.windowId) : "Failed to focus window"),
    },
    isConcurrencySafe: () => true,
    async execute(args) {
      requireTool("xdotool", "Install xdotool: sudo apt install xdotool");
      requireTool("wmctrl", "Install wmctrl: sudo apt install wmctrl");
      let windowId = args.windowId;
      if (!windowId && args.titleMatch) {
        const raw = run("wmctrl -l");
        const lines = raw.split("\n").filter(Boolean);
        for (var i = 0; i < lines.length; i++) {
          const parts = lines[i].split(/\s+/);
          if (parts.length >= 4) {
            const title = parts.slice(3).join(" ");
            if (title.toLowerCase().includes(args.titleMatch.toLowerCase())) {
              windowId = parts[0];
              break;
            }
          }
        }
        if (!windowId) throw new Error('No window found matching title: "' + args.titleMatch + '"');
      }
      if (!windowId) throw new Error("Either windowId or titleMatch is required");
      let title = "";
      try { title = run("xdotool getwindowname " + windowId); } catch { /* ignore */ }
      run("xdotool windowactivate " + windowId);
      return { windowId, title, success: true };
    },
  });
}


// =========================================================================
// Tool: screen_window_get_active
// =========================================================================
function windowGetActiveTool() {
  return defineTool({
    name: "screen_window_get_active",
    description:
      "Get information about the currently active (focused) window: its ID, title, position, size, and PID.",
    parameters: {},
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string", required: true },
          title: { type: "string" },
          x: { type: "integer" },
          y: { type: "integer" },
          width: { type: "integer" },
          height: { type: "integer" },
          pid: { type: "integer" },
        },
      },
      render: (_args, value) => {
        const parts = [
          "Window: " + value.id,
          value.title ? "Title: " + value.title : null,
          "Position: (" + value.x + ", " + value.y + ")",
          "Size: " + value.width + "x" + value.height,
          value.pid ? "PID: " + value.pid : null,
        ].filter(Boolean);
        return text(parts.join("\n"));
      },
    },
    async execute() {
      requireTool("xdotool", "Install xdotool: sudo apt install xdotool");
      const id = run("xdotool getactivewindow");
      let title = "", x = 0, y = 0, w = 0, h = 0, pid = 0;
      try { title = run("xdotool getwindowname " + id); } catch { /* ignore */ }
      try {
        const geo = run("xdotool getwindowgeometry " + id);
        const posMatch = geo.match(/Position:\s*(\d+),(\d+)/);
        const geoMatch = geo.match(/Geometry:\s*(\d+)x(\d+)/);
        if (posMatch) { x = parseInt(posMatch[1], 10); y = parseInt(posMatch[2], 10); }
        if (geoMatch) { w = parseInt(geoMatch[1], 10); h = parseInt(geoMatch[2], 10); }
      } catch { /* ignore */ }
      try { pid = parseInt(run("xdotool getwindowpid " + id), 10); } catch { /* ignore */ }
      return { id, title, x, y, width: w, height: h, pid };
    },
  });
}

// =========================================================================
// Tool: screen_display_info
// =========================================================================
function displayInfoTool() {
  return defineTool({
    name: "screen_display_info",
    description:
      "Get information about connected displays: resolution, position, refresh rate, and whether they are primary.",
    parameters: {},
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          displays: {
            type: "array",
            required: true,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                name: { type: "string", required: true },
                width: { type: "integer", required: true },
                height: { type: "integer", required: true },
                x: { type: "integer", required: true },
                y: { type: "integer", required: true },
                primary: { type: "boolean", required: true },
                refreshRate: { type: "number" },
              },
            },
          },
        },
      },
      render: (_args, value) => {
        const lines = value.displays.map(function (d) {
          return d.name + " " + d.width + "x" + d.height + "@" + (d.refreshRate || "?") + "Hz (" + d.x + "," + d.y + ")" + (d.primary ? " [primary]" : "");
        });
        return text(lines.join("\n"));
      },
    },
    async execute() {
      requireTool("xrandr", "Install xrandr: sudo apt install xrandr");
      const raw = run("xrandr --current");
      const displays = [];
      let currentDisplay = null;
      for (const line of raw.split("\n")) {
        const connectedMatch = line.match(/^(\S+) connected/);
        if (connectedMatch) {
          if (currentDisplay) displays.push(currentDisplay);
          currentDisplay = { name: connectedMatch[1], width: 0, height: 0, x: 0, y: 0, primary: false, refreshRate: 0 };
          if (line.includes("primary")) currentDisplay.primary = true;
          const resMatch = line.match(/(\d+)x(\d+)\+(\d+)\+(\d+)/);
          if (resMatch) {
            currentDisplay.width = parseInt(resMatch[1], 10);
            currentDisplay.height = parseInt(resMatch[2], 10);
            currentDisplay.x = parseInt(resMatch[3] || "0", 10);
            currentDisplay.y = parseInt(resMatch[4] || "0", 10);
          }
          const rateMatch = line.match(/(\d+\.?\d*)\*/);
          if (rateMatch) currentDisplay.refreshRate = parseFloat(rateMatch[1]);
        }
      }
      if (currentDisplay) displays.push(currentDisplay);
      return { displays };
    },
  });
}

// =========================================================================
// Tool: screen_clipboard_get
// =========================================================================
function clipboardGetTool() {
  return defineTool({
    name: "screen_clipboard_get",
    description:
      "Get the current text content of the system clipboard.",
    parameters: {},
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          text: { type: "string" },
          hasContent: { type: "boolean", required: true },
        },
      },
      render: (_args, value) =>
        text(value.hasContent ? "Clipboard content:\n" + value.text : "Clipboard is empty or contains non-text content."),
    },
    async execute() {
      requireTool("xclip", "Install xclip: sudo apt install xclip");
      try {
        const text = run("xclip -selection clipboard -o", 5000);
        return { text, hasContent: text.length > 0 };
      } catch {
        return { hasContent: false };
      }
    },
  });
}

// =========================================================================
// Tool: screen_clipboard_set
// =========================================================================
function clipboardSetTool() {
  return defineTool({
    name: "screen_clipboard_set",
    description:
      "Set the system clipboard to a specific text string. Useful for copying text that needs to be pasted elsewhere.",
    parameters: {
      text: { type: "string", required: true, description: "The text to copy to the clipboard." },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          length: { type: "integer", required: true },
          success: { type: "boolean", required: true },
        },
      },
      render: (_args, value) => text(value.success ? "Copied " + value.length + " characters to clipboard" : "Failed to set clipboard"),
    },
    async execute(args) {
      requireTool("xclip", "Install xclip: sudo apt install xclip");
      const tmpFile = join(tmpdir(), "dsh-clip-" + Date.now() + ".txt");
      try {
        writeFileSync(tmpFile, args.text, "utf-8");
        run("xclip -selection clipboard < " + tmpFile);
      } finally {
        try { unlinkSync(tmpFile); } catch { /* ignore */ }
      }
      return { length: args.text.length, success: true };
    },
  });
}

// =========================================================================
// Plugin guidance text
// =========================================================================
const COMPUTER_USE_GUIDANCE = "本机已安装 dsh-computer-use 插件（桌面操控插件）：侧边栏无独立入口，agent 通过工具调用控制桌面。" +
  "screen_screenshot 截取屏幕（返回图片），screen_mouse_move 移动鼠标、screen_mouse_click 点击、screen_mouse_drag 拖拽，" +
  "screen_keyboard_type 输入文本、screen_keyboard_press 按键，" +
  "screen_window_list 列出窗口、screen_window_focus 切换窗口、screen_window_get_active 获取当前窗口，" +
  "screen_display_info 查看显示器信息，" +
  "screen_clipboard_get/screen_clipboard_set 读写剪贴板。" +
  "依赖：xdotool、xclip、ImageMagick（import）、wmctrl、xrandr。请先截屏观察再操作。";

const SECTION_ORDER = 155;

// =========================================================================
// Plugin apply function
// =========================================================================
/** Stable cordis plugin name. */
const name = "computer-use";

/** Services required. */
const inject = ["tools", "systemPrompt"];

/** Plugin configuration schema. */

function apply(ctx, config) {
  const tools = [
    screenshotTool(ctx),
    mouseMoveTool(),
    mouseClickTool(),
    mouseDragTool(),
    keyboardTypeTool(),
    keyboardPressTool(),
    windowListTool(),
    windowFocusTool(),
    windowGetActiveTool(),
    displayInfoTool(),
    clipboardGetTool(),
    clipboardSetTool(),
  ];

  ctx.effect(function () {
    var sectionDisposer = ctx.systemPrompt.section({
      name: "plugin:dsh-computer-use",
      order: SECTION_ORDER,
      text: COMPUTER_USE_GUIDANCE,
    });
    var toolDisposers = tools.map(function (tool) { return ctx.tools.register(tool); });
    return function () {
      sectionDisposer();
      for (var i = 0; i < toolDisposers.length; i++) toolDisposers[i]();
    };
  }, "dsh-computer-use: lifecycle");
}

export { apply, inject, name };
