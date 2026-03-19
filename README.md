# Pi Interactive Form Extension

A [pi coding agent](https://github.com/badlogic/pi-mono) extension that provides an `interactive_form` tool — a tabbed form interface for gathering structured user input through selectable options and custom text.

![Interactive Form Screenshot](assets/screenshot.png)

## Features

- **Tabbed form UI** — present multiple questions as navigable tabs, each with its own set of options.
- **Single & multiple selection** — radio-button or checkbox style per tab.
- **Custom text input** — optionally allow free-text answers alongside predefined options.
- **Summary view** — review all responses on a final "Submit" tab before confirming.
- **Keyboard-driven** — full keyboard navigation (arrow keys, Tab, number keys, Enter/Space).

## Setup

### Prerequisites

- [pi coding agent](https://github.com/badlogic/pi-mono) installed and configured.

### Install via pi

```bash
# From git
pi install git:github.com/kirang89/pi-interactive-form

# Or from npm (once published)
pi install npm:pi-interactive-form
```

### Install manually

Copy (or symlink) the extension into your pi agent extensions directory:

```bash
mkdir -p ~/.pi/agent/extensions/interactive-form
cp extensions/*.ts ~/.pi/agent/extensions/interactive-form/
```

### Try without installing

```bash
pi -e git:github.com/kirang89/pi-interactive-form
```

### Verify

Restart pi (or run `/reload`). The `interactive_form` tool will be available to the agent.
