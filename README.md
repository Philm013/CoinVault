# CoinVault

CoinVault is a **local-first, browser-based numismatic catalog** for coins and paper notes.  
It combines camera/image capture, OpenCV-powered detection, and Gemini-powered identification to help you build and organize a personal collection.

---

## Why CoinVault?

Coin collecting is part history, part research, and part data management. CoinVault is designed to make that workflow easier by:

- detecting likely items in an image
- extracting each item into individual crops
- asking an AI model to identify and describe each item
- storing results in your browser for searching, filtering, and tracking value

---

## Core Features

- **AI Identification (Gemini):** Estimates country, denomination, year, metal, grade, and value.
- **Computer Vision Detection (OpenCV.js):** Detects circular coins and rectangular notes.
- **Manual Correction:** Draw or adjust regions if auto-detection misses items.
- **Collection Management:** Search, filter by country, sort by newest or value, edit and delete items.
- **Dashboard Analytics:** View totals, estimated value, and recent additions.
- **Backup & Restore:** Export/import your vault as JSON.
- **Mobile-first UI + PWA manifest:** Optimized for touch devices and installable-like behavior.

---

## How It Works (Educational Overview)

1. **Capture/Input**
   - Use device camera or upload a photo.
2. **Detection**
   - OpenCV runs pre-processing and shape detection (coins/notes) to propose item regions.
3. **Selection**
   - You confirm or refine detection boxes.
4. **AI Analysis**
   - Each crop is sent to Gemini with a structured JSON prompt.
5. **Normalization + Storage**
   - Results are normalized and stored in IndexedDB.
6. **Exploration**
   - The UI renders collection cards, filters, and dashboard stats/charts.

This pipeline demonstrates a practical hybrid of **classical CV + LLM reasoning** in a client-side app.

---

## Tech Stack

- **Vanilla JavaScript (ES Modules)** — app architecture and module orchestration
- **IndexedDB** — local persistence for collection and settings
- **OpenCV.js** — image processing and object detection
- **Gemini API** — item identification and metadata inference
- **Tailwind CSS (CDN)** — styling
- **Chart.js** — dashboard visualization
- **Iconify** — icon rendering

---

## Project Structure

```text
CoinVault/
├── index.html          # Main app shell and UI layout
├── js/
│   ├── app.js          # App orchestration and lifecycle
│   ├── capture.js      # Camera/upload, CV detection, crop extraction
│   ├── ai.js           # Gemini model interaction
│   ├── db.js           # IndexedDB wrapper for items/settings
│   └── ui.js           # Rendering, events, filters, dashboard, import/export
├── manifest.json       # PWA metadata
└── README.md
```

---

## Getting Started

Because this app uses browser APIs (camera, modules, fetch), run it from a local web server (not `file://`).

### 1) Serve the project locally

Use any static server. Example with Python:

```bash
cd CoinVault
python3 -m http.server 8080
```

Then open: `http://localhost:8080`

### 2) Configure Gemini

1. Open **Settings** in the app
2. Paste your Gemini API key
3. Select a model
4. Save changes

Without an API key, AI identification is disabled.

---

## Data Model (Item Fields)

Each saved item includes:

- `id`
- `imageBlob` (base64 image)
- `country`
- `denomination`
- `year`
- `mintMark`
- `metal`
- `grade`
- `estimatedValue`
- `citation`
- `description`
- `dateAdded`
- `tags`

This makes CoinVault a useful example of schema normalization for AI-generated outputs.

---

## Privacy & Security Notes

- Collection data is stored locally in your browser via IndexedDB.
- Gemini API requests send selected item image crops and prompt text to Google’s API.
- Exported JSON files may contain sensitive collection details; handle backups carefully.

---

## Current Limitations

- AI output quality depends on image quality, model behavior, and prompt adherence.
- Estimated value is informational, not an appraisal.
- Detection may require manual adjustment in challenging lighting/backgrounds.
- No repository-wide build/test/lint scripts are currently defined.

---

## Suggested Learning Paths

If you are studying this project, explore in this order:

1. `js/app.js` to understand module orchestration
2. `js/capture.js` for CV + interaction flow
3. `js/ai.js` for multimodal prompt/request handling
4. `js/db.js` for IndexedDB persistence patterns
5. `js/ui.js` for state-driven rendering and UX controls

---

## License

No license file is currently included in this repository.  
Add one if you intend others to reuse or distribute the code.
