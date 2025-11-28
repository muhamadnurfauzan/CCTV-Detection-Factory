# CCTV-Detection-Factory

Lightweight prototype for CCTV-based PPE (helmet/vest) detection with violation cropping, timestamp/location metadata, and a web UI.  
Backend handles video capture, detection, tracking (SORT), and violation processing. Frontend is a Vite/React admin UI and stream proxy.

---

## Key features
- YOLO-based PPE detection (YOLOv8 model in `backend/model/`)
- Object tracking via SORT to avoid spamming violation captures
- Violation crops saved with timestamp & location
- Simple REST endpoints and a React-based dashboard
- Modular structure: backend services, detection core, and frontend UI

---

## Repository layout
- `/backend` — Flask backend, detection core, routes, services, shared state, `requirements.txt`
- `/frontend` — Vite + React UI, components, static assets, `server.mjs` proxy
- `/model` (backend/model) — detection model files (example: `best.pt`)
- `/violations` — (runtime) saved violation crops (created by backend)

---

## Requirements / Prerequisites
- Python 3.10+ (use a clean virtualenv or a separate conda env; avoid base conda)
- Node.js 18+ and npm
- GPU users: compatible PyTorch + CUDA versions
- Recommended: use a dedicated env to avoid package conflicts

Important packages (backend): torch, torchvision, ultralytics, opencv-python (or opencv-python-headless), filterpy, flask, flask-cors, Pillow.  
Frontend: react, react-dom, vite and related dev deps.

---

## Quick start — Backend
1. Create & activate a virtual environment
   - macOS / Linux:
     ```bash
     python3 -m venv .venv
     source .venv/bin/activate
     ```
2. Install backend dependencies
   ```bash
   pip install --upgrade pip setuptools wheel
   pip install -r backend/requirements.txt
   ```
   - If filterpy fails in your Anaconda base environment, either:
        - Use conda-forge: `bash conda install -c conda-forge filterpy`
        - Or use the virtualenv above (recommended)
3. Run Flask backend
    ```bash
   python backend/app.py
   ```
   Backend listens (by default) on HTTP; check app.py for port config.

Notes: segmentation faults at startup usually indicate native binary incompatibilities (torch / opencv). Recreate a clean env or install versions of torch/opencv compatible with your platform.

---

## Quick start — Frontend
1. Install deps
    ```bash
    cd frontend
    npm install
    ```
2. Development (vite)
    ```bash
    npm run dev
    # open the displayed URL (usually http://localhost:5173)
    ```
3. Production build + proxy (serve static via server.mjs)
    ```bash
    npm run build
    node server.mjs
    # open http://localhost:3000 (server.mjs defaults to 3000 in this repo)
    ```

If you use a separate proxy, ensure port is not blocked by the browser (avoid unsafe ports like 6000). Use 3000 or 5173 for local dev.

---

## Common troubleshooting
- "No module named 'filterpy'": install via conda-forge or use clean venv (see Quick start). The error can also stem from broken setuptools/backports in Anaconda base.
- Segmentation fault right after Flask start: check native libs (torch/opencv). Try a different Python env or match PyTorch/CUDA to your hardware.
- "Cannot read properties of null (reading 'useRef')" in frontend: usually caused by duplicate React instances. Fixes:
    - `bash cd frontend && npm ls react react-dom` → ensure a single version.
    - `bash rm -rf node_modules package-lock.json && npm install`
    - Ensure libraries declare React as peerDependency, not dependency.
- MJPEG/stream URL CORS issues: either proxy the stream through the Node server (server.mjs) or enable CORS in Flask (already present).

---

## Development tips
- Keep requirements.txt and package.json in sync with runtime needs.
- Separate concerns: detection logic (core), services (storage/notifications), web routes, and UI components.
- Use logging and small reproducible test videos when debugging detection/tracking.

---

## Useful commands
- Backend lint/test/run: from repo root
    ```bash
    source .venv/bin/activate
    python backend/app.py
    ```
- Frontend dev:
    ```bash
    cd frontend
    npm install
    npm run dev
    ```

---

## License
© 2025 PT Summit Adyawinsa Indonesia.
