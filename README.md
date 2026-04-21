# Accordion File View

An Obsidian community plugin that shows Markdown and text files in an accordion-style preview list.

## Features

- Lists matching notes from a selected folder or the whole vault
- Expands one file at a time for preview
- Renders Markdown files as formatted previews
- Shows TXT files as plain text
- Adds a ribbon icon and command palette entry

## Usage

1. Open `Accordion File View` from the ribbon icon or command palette.
2. Optionally narrow the file list with `Folder`.
3. Filter by file name or path with `Filter`.
4. Expand an item to preview it, or use the edit button to open the file in the editor.

## Development

```bash
npm install
npm run build
```

For live rebuilds:

```bash
npm run dev
```

## Folder Setup

- Leave the folder setting blank to scan the whole vault
- Set it to a vault-relative path such as `設定資料` or `シナリオ`

## Release Files

- `manifest.json`
- `main.js`
- `styles.css`
- `versions.json`

## Publishing Notes

- Commit the generated `main.js`, `manifest.json`, and `styles.css` to the repository
- Keep `versions.json` in sync when you bump the plugin version
- Create a GitHub release and upload `manifest.json`, `main.js`, `styles.css`, and `versions.json`
