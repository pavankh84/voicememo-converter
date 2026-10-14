# Voice Memo → MP3

Convert iPhone Voice Memos (`.m4a`) to MP3, entirely in your browser. No uploads, no backend,
no account. Your audio never leaves your machine.

**Live:** https://pavankh84.github.io/voicememo-converter/

## Why

Most "convert my voice memo to mp3" tools on the web make you upload a personal recording to a
random server. This one doesn't have a server — conversion runs locally via
[ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) (ffmpeg compiled to WebAssembly), so
your files stay on your device the whole time.

## How to get voice memos off your iPhone

1. Open **Voice Memos** on your iPhone.
2. Tap a recording, then the **share icon**.
3. AirDrop it to your Mac, or send it to yourself (Files, email, Messages, etc.) and save it.
4. Drop the resulting `.m4a` file onto this site.

## Features

- Drag-and-drop or click-to-browse, multiple files at once
- Converts `.m4a` / `.caf` / `.mp4` / `.wav` → MP3 (VBR ~190kbps, `-qscale:a 2`)
- Per-file progress, download individually when done
- 100% client-side — works offline after the first load, nothing is ever transmitted

## Development

```bash
npm install
npm run dev      # start dev server
npm run build    # production build to dist/
npm run preview  # preview the production build
```

Built with [Vite](https://vitejs.dev/) + TypeScript. No framework, no backend.

## Deployment

Pushing to `main` builds and deploys to GitHub Pages via the included GitHub Actions workflow
(`.github/workflows/deploy.yml`).

## License

MIT — see [LICENSE](./LICENSE).
