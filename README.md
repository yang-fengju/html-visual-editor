# HTML Visual Editor

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Chrome Extension](https://img.shields.io/badge/Platform-Chrome%20Extension-green.svg)](https://developer.chrome.com/docs/extensions/)

[中文文档](README.zh-CN.md)

A Chrome extension that lets you visually edit any webpage like a Word document — click, type, drag, and style elements directly in the browser.

## Features

- **Visual Editing** — Click any element to select it, double-click to edit text inline
- **Style Editor** — Modify colors, fonts, spacing, borders and more through a visual panel
- **Drag & Drop** — Rearrange page elements by dragging
- **Table Editing** — Full table manipulation: add/remove rows and columns, merge cells
- **Media Management** — Edit images, videos, and audio elements
- **Form Editing** — Modify form inputs and their properties
- **Code Blocks** — Syntax-highlighted code editing with Prism.js
- **Comment System** — Add inline annotations and sticky notes to any element
- **Undo/Redo** — Full history support (Ctrl+Z / Ctrl+Y)
- **Insert Elements** — Add new paragraphs, headings, images, tables, and more
- **Export** — Download edited HTML or copy to clipboard
- **Notes Import/Export** — Save and load annotations as JSON

## Installation

### From Source (Developer Mode)

1. Clone the repository:

```bash
git clone https://github.com/yang-fengju/html-visual-editor.git
cd html-visual-editor
```

2. Install dependencies:

```bash
npm install
```

3. Build the extension:

```bash
npm run build
```

4. Load in Chrome:
   - Open `chrome://extensions/`
   - Enable "Developer mode" (top-right toggle)
   - Click "Load unpacked"
   - Select the `dist/` directory

## Usage

1. Click the extension icon or press **Alt+E** to toggle edit mode
2. **Click** any element to select it (blue outline appears)
3. **Double-click** text to edit it inline
4. **Right-click** for context menu with more actions (copy, delete, move, add comment)
5. Use the **toolbar** at the top for undo/redo, insert elements, export, and comments

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt+E` | Toggle edit mode |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Delete` | Delete selected element |
| `Escape` | Exit current editing state |

### Export Options

- **Export HTML** — Download the full page as an HTML file
- **Export with Notes** — HTML file with embedded annotations
- **Copy HTML** — Copy page or selected element HTML to clipboard
- **Export/Import Notes JSON** — Save annotations separately

## Development

### Prerequisites

- Node.js 18+
- npm 9+

### Project Structure

```
src/
├── background/       # Service worker (extension lifecycle)
├── content/          # Content script (injected into pages)
│   ├── editor/       # Core editing modules
│   │   ├── Engine.ts          # Main orchestrator
│   │   ├── History.ts         # Undo/redo system
│   │   ├── SelectionManager.ts
│   │   ├── TextEditor.ts
│   │   ├── StyleEditor.ts
│   │   ├── DragSystem.ts
│   │   ├── ElementManager.ts
│   │   ├── TableEditor.ts
│   │   ├── MediaManager.ts
│   │   ├── FormEditor.ts
│   │   ├── CodeBlock.ts
│   │   ├── NoteManager.ts
│   │   ├── CommentSystem.ts
│   │   └── StickyNote.ts
│   └── ui/           # UI components (rendered in Shadow DOM)
│       ├── ShadowHost.ts
│       ├── Toolbar.ts
│       ├── ContextMenu.ts
│       ├── FloatingBar.ts
│       ├── InsertPanel.ts
│       ├── StylePanel.ts
│       ├── TableToolbar.ts
│       └── NoteEditor.ts
├── popup/            # Extension popup UI
└── shared/           # Shared types and messages
```

### Dev Server

```bash
npm run dev
```

> Note: For Chrome extensions, `npm run dev` starts Vite in dev mode for the popup page. To test the full extension, use `npm run build` and reload in Chrome.

### Build

```bash
npm run build
```

This runs TypeScript type checking, then builds three entry points (content script, background worker, popup) as separate IIFE/HTML bundles into `dist/`.

### Tech Stack

- **TypeScript** — Strict mode, full type safety
- **Vite** — Build tooling with custom multi-entry build script
- **Chrome Extension Manifest V3** — Modern extension APIs
- **Prism.js** — Code syntax highlighting
- **Shadow DOM** — UI isolation from page styles

## Architecture

The extension uses Shadow DOM to isolate its UI from the host page. All editor UI components (toolbar, panels, context menu) are rendered inside a shadow root, preventing style conflicts with the page being edited.

The `Engine` class orchestrates all editing modules. Each module handles a specific concern (text editing, style editing, drag & drop, etc.) and communicates through the shared `History` system for undo/redo support.

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## License

[MIT](LICENSE)
