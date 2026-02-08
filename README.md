# YouTube Downloader MCP

A YouTube video and subtitle downloader with two interfaces:

1. **MCP Server** — AI assistants (Cursor, Claude, etc.) can invoke tools via the Model Context Protocol
2. **Electron Desktop App** — a standalone GUI with search, format selection, and download progress

Both interfaces share the same yt-dlp-based core, ensuring consistent behavior.

## Architecture

```
youtube-downloader-mcp/
  index.js                    # MCP server entry (stdin/stdout JSON-RPC)
  package.json
  lib/
    core/                     # Shared core services (used by MCP + Electron)
      youtube_video_downloader_service.js
      youtube_subtitle_downloader_service.js
      youtube_video_id_extractor_utility.js
      download_task_persistent_json_store.js
      download_task_runtime_state_tracker.js
      yt_dlp_command_argument_builder.js
      mcp_result_formatting_helpers.js
    tools/                    # MCP tool definitions (thin wrappers)
      youtube_download_task_create.js
      youtube_download_task_list.js
      youtube_subtitle.js
  electron-app/               # Electron + React desktop UI
    electron/main.ts          # IPC bridge to lib/core
    src/App.tsx               # React frontend
```

## Prerequisites

- **Node.js** >= 18
- **Python 3** with `pip` (yt-dlp is auto-installed on first use)
- For the Electron app: system dependencies for Electron

## Quick Start

### MCP Server

Add to your Cursor MCP config (`~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "youtube-downloader-mcp": {
      "command": "node",
      "args": ["/path/to/youtube-downloader-mcp/index.js"]
    }
  }
}
```

Then restart Cursor. The following tools become available:

| Tool | Description |
|------|-------------|
| `youtube_download` | Download a YouTube video (runs in background) |
| `youtube_subtitle` | Download subtitles + generate plain text transcript |
| `youtube_task_history` | View history of all download/subtitle tasks |

### Electron Desktop App

```bash
cd electron-app
npm install
npm run dev:electron
```

## MCP Tools

### `youtube_download`

Downloads a YouTube video. The download runs in the background; use `youtube_task_history` to check progress.

```
url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
output_path: "~/Downloads"  (optional)
```

### `youtube_subtitle`

Downloads subtitles in SRT format and converts them to a plain text transcript.

```
url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
language: "en-orig,en"      (optional, comma-separated)
output_path: "~/Downloads"  (optional)
```

### `youtube_task_history`

Lists all past download and subtitle tasks with their status, paths, and metadata.

```
type: "download" | "subtitle"  (optional filter)
status: "completed"            (optional filter)
limit: 50                      (optional, max 200)
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `YTDL_BROWSER` | `chrome` | Browser for cookie extraction |
| `YTDL_PLAYER_CLIENT` | `android` | YouTube player client for extractor |
| `YTDL_USE_COOKIES` | `true` | Set to `false` to disable cookie usage |
| `WORKSPACE_ROOT` | project root | Base directory for relative output paths |

## License

MIT — see [License.txt](./License.txt)
