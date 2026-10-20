# Voice Memo → MP3

Convert iPhone Voice Memos (`.m4a`) to MP3, entirely in your browser. No uploads, no backend,
no account. Your audio never leaves your machine.

**Live:** https://pavankh84.github.io/voicememo-converter/

See the [changelog](./CHANGELOG.md) for release history.

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

- Drag-and-drop or click-to-browse, multiple files at once; conversion starts automatically
- Converts `.m4a` / `.caf` / `.mp4` / `.wav` → MP3 (VBR ~190kbps, `-qscale:a 2`)
- Per-file progress, download individually when done
- **Date-tagged output** — the original recording's timestamp is written into the MP3's ID3
  tags (title/date/comment), so downloaded files are sortable instead of all being named
  "New Recording 47"
- **Optional local transcription** — generate a `.txt` transcript alongside the MP3, powered by
  a multilingual Whisper model running fully in-browser (no server, no API key). Pick the
  spoken language from a dropdown (English, Hindi, Spanish, French, German, Chinese, Japanese,
  Arabic, Portuguese, Russian) — accuracy is best for single-language audio; code-switched
  recordings (e.g. Hindi mixed with English) are transcribed less reliably
- **Optional silence trimming** — strips dead air from the start and end of a recording
  (ffmpeg `silenceremove`, threshold -45dB) without touching pauses mid-recording
- **Installable PWA** — "Add to Home Screen" / "Install app" for an offline-capable app shell;
  the ffmpeg and transcription engines are cached after first use
- 100% client-side — nothing is ever transmitted anywhere

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

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup and workflow guidance,
the [Code of Conduct](./CODE_OF_CONDUCT.md), and [SECURITY.md](./SECURITY.md) for private
vulnerability reporting.

## License

MIT — see [LICENSE](./LICENSE).
