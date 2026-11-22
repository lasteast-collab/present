# Lasteast Present Professional 2024

**Ideas. Design. Present.**

Professional presentation software for **Windows, macOS, Linux and the web**.

- 🌐 Online version & downloads: https://lasteast-present.netlify.app
- ⬇ Installers: [GitHub Releases](https://github.com/lasteast-collab/present/releases/latest)

## Highlights
- Ribbon editor: slides, text, shapes, pictures, icons, tables, charts, SmartArt-style diagrams, WordArt, equations, symbols, audio & video, hyperlinks and action buttons
- **Transition Studio** — 100+ GPU (WebGL) transitions incl. 3D and cinematic, and the six **Lasteast Signature** transitions: Morph, Quantum Flow, Portal, Magnetic Assembly, Infinity Zoom and Liquid Shift (plus 14 more Lasteast exclusives)
- Object-aware **Morph** with smart + manual object matching, shape, text (character/word), image-crop and colour morphing
- Animations (entrance/emphasis/exit/motion paths, triggers, by-paragraph), Animation Pane and a timeline **Motion Studio**
- Slide show with **Presenter View**, multi-display audience window, pen / highlighter / laser, black/white screen, live captions, rehearse timings, custom shows, kiosk loop
- **Selfie Presenter Mode** — webcam bubble / card / PiP / side-by-side / full layouts, background blur & replacement (on-device MediaPipe), per-slide camera settings, smart positioning, recording to MP4/WebM
- PPTX import & export (with transition injection and compatibility report), PDF, ODP, PNG/JPG/SVG, HTML, animated GIF, video; printing of slides, handouts, notes and outlines
- English / עברית / العربية interface with full RTL layouts — content language independent of interface language
- Slide master, custom layouts, themes, design ideas, accessibility checker, document inspector, compare, comments, version history, AutoSave & recovery, AES-256 password-protected files
- Optional AI assistant using **your own** provider (OpenAI-compatible, Anthropic, OpenRouter, Ollama). Never simulated.

## Repository layout
| Path | What |
|---|---|
| `site/index.html` | Landing & download page |
| `site/app/` | The application (vanilla ES modules, no build step) |
| `desktop/` | Electron shell, installer configuration (NSIS / DMG / AppImage / deb), auto-update |
| `.github/workflows/release.yml` | Builds and publishes installers for all platforms when a `v*` tag is pushed |

## Develop
```bash
cd site && python3 -m http.server 8080   # open http://localhost:8080/app/
cd desktop && npm install && npm start   # desktop app
```

## Release
```bash
git push   # any change to desktop/ or site/app/ on main (or a v* tag) builds Windows, macOS and Linux installers
```
Bump `desktop/package.json` → `version` first. The first builds are not code-signed (SmartScreen / Gatekeeper will warn).
