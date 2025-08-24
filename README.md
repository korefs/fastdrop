# FastDrop

A beautiful macOS menu bar app for quick file uploads to 0x0.st and Google Drive.

## Features

- 📁 Lives in your macOS menu bar
- 🎯 Drag & drop files directly to the menu bar icon
- 🚀 Upload to 0x0.st (anonymous file hosting)
- ☁️ Upload to Google Drive (with authentication)
- 💫 Beautiful, modern UI with shadcn/ui components
- ⚡ Built with Electron, React, and TypeScript

## Development

### Setup

1. Install dependencies:
```bash
npm install
```

2. For Google Drive integration (optional), set environment variables:
```bash
export GOOGLE_CLIENT_ID="your-google-client-id"
export GOOGLE_CLIENT_SECRET="your-google-client-secret"
```

### Running the app

```bash
npm run dev
```

This will start both the Vite dev server and Electron app.

### Building

```bash
npm run build
```

### Packaging for macOS

```bash
npm run package:mac
```

## How to Use

1. Launch the app - it will appear in your menu bar
2. Click the menu bar icon or drag files to it
3. Choose your upload service (0x0.st or Google Drive)
4. Drop files or click to select files
5. Files will upload and provide shareable URLs
6. Click "Copy URL" to copy the link to your clipboard

## Architecture

- **Main Process** (`src/main.ts`): Handles menu bar, file system, and uploads
- **Renderer Process** (`src/App.tsx`): React UI with drag-and-drop interface
- **Preload Script** (`src/preload.ts`): Secure bridge between main and renderer
- **Styling**: TailwindCSS with shadcn/ui components

## Upload Services

### 0x0.st
- Anonymous file hosting
- No authentication required
- Files are automatically deleted after a period of inactivity

### Google Drive
- Requires Google OAuth setup
- Files are uploaded to your Google Drive
- Publicly shareable links are generated

## License

MIT