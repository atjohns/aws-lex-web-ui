# AGENTS.md

## Cursor Cloud specific instructions

### Project overview
AWS Lex Web UI — a Vue 3 chatbot web interface for Amazon Lex. Two sub-projects share the repo:

| Component | Directory | Dev server port | Start command |
|---|---|---|---|
| **Chatbot UI component** (Vue 3 + Vuetify 3) | `lex-web-ui/` | 8080 | `npm run serve` (from `lex-web-ui/`) |
| **Loader library** (vanilla JS, Vite UMD build) | root `src/lex-web-ui-loader/` | 8000 | `npm run serve-loader` (from root) |

### Running locally
- Both sub-projects require `npm install` in their respective directories (root and `lex-web-ui/`).
- The chatbot UI Vite dev server opens at `http://localhost:8080/`.
- The loader Vite dev server serves sample pages at `http://localhost:8000/src/website/index.html`.
- Full chatbot interaction requires a configured Amazon Lex V2 Bot and Cognito Identity Pool (set in `lex-web-ui/src/config/config.dev.json` and `src/config/lex-web-ui-loader-config.json`). Without these, the UI loads but API calls fail.

### Lint
- Root loader lint: `npm run lint` — uses `.eslintrc.js` (currently broken due to `"type": "module"` in `package.json` conflicting with CommonJS config; pre-existing issue).
- Chatbot component lint: `cd lex-web-ui && npm run lint` — runs ESLint with `eslint-plugin-vue`; produces warnings but exits with code 1 (pre-existing).

### Tests
- Integration tests: `cd lex-web-ui && npm run test:integration` — runs Jest; some tests have hardcoded dependency version expectations that may be outdated.

### Build
- Chatbot app build: `cd lex-web-ui && npm run build`
- Library build (UMD): `cd lex-web-ui && npm run build-dist`
- Loader build: `npm run build-dev` / `npm run build-prod` (from root)

### Gotchas
- The root `package.json` has `"type": "module"`, so any CommonJS-style config files (like `.eslintrc.js`) must use the `.cjs` extension to work.
- The loader's sample HTML pages (`src/website/index.html`, `src/website/parent.html`) contain legacy Webpack template tags (`<%= htmlWebpackPlugin.tags.* %>`); these cause parse5 warnings in the Vite dev server but do not block serving.
- Node.js ≥18 and npm ≥10 are required (see `engines` in `package.json`).
