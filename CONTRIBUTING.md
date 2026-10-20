# Contributing

Thanks for helping improve Voice Memo to MP3. This is a small, client-side project, so contributions
should stay focused, easy to review, and consistent with its privacy-first purpose.

## Set up locally

Use Node.js 20, which matches the GitHub Actions build.

```bash
git clone https://github.com/pavankh84/voicememo-converter.git
cd voicememo-converter
npm ci
npm run dev
```

Open the local URL shown by Vite. For a production check, run:

```bash
npm run build
npm run preview
```

## Build and test expectations

There is currently no automated test suite. Before opening a pull request:

- Run `npm run build`; it must complete without TypeScript or Vite errors.
- For user-facing changes, verify the affected flow in a current desktop browser.
- When practical, also check the mobile layout and an additional browser.
- Do not use private or sensitive recordings for testing. Use synthetic or non-sensitive samples.

Include the commands and manual checks you performed in the pull request.

## Contribution workflow

1. Search existing issues and pull requests before starting.
2. For a substantial change, open a feature request first so the approach can be discussed.
3. Create a focused branch from the latest `main`.
4. Make the smallest complete change that solves the problem.
5. Update documentation when behavior or contributor expectations change.
6. Open a pull request using the repository template.

Keep unrelated refactors out of the same pull request. New dependencies should have a clear benefit
that outweighs their download size, maintenance, privacy, and security costs.

## Reporting issues

Use the bug report template for reproducible defects and the feature request template for proposed
improvements. Include browser and operating system details when relevant, but do not attach private
recordings, transcripts, personal data, or secrets.

Security vulnerabilities should not be reported in public issues. Follow [SECURITY.md](SECURITY.md)
instead.

## Privacy-first principles

The core promise of this project is that recordings stay on the user's device.

- Audio, transcripts, filenames, and metadata must remain client-side.
- Do not add uploads, remote processing, analytics, telemetry, or tracking by default.
- Avoid logging recording content, transcripts, or identifying metadata.
- Make any network access visible, necessary, and documented.
- Treat browser storage, caches, downloaded models, and generated files as sensitive surfaces.

Changes that affect these principles must explain the privacy and security impact in the pull request.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
