# CCTV-Detection-Factory

Lightweight prototype for CCTV-based PPE (helmet/vest/shoes/glasses/gloves) detection with violation cropping, timestamp/location metadata, and a web UI.  
Backend handles video capture, detection, tracking (SORT: `bytetrack.yml`), and violation processing. Frontend is a Vite/React admin UI and stream proxy.

---

## Key features
- YOLO-based PPE detection (YOLOv12 model in `backend/model/`)
- Object tracking via SORT to avoid spamming violation captures
- Violation crops saved with timestamp & location
- Simple REST endpoints and a React-based dashboard
- Modular structure: backend services, detection core, and frontend UI

---

## Repository layout
- `/backend` — Flask backend, detection core, routes, services, shared state, `requirements.txt`
- `/frontend` — Vite + React UI, components, static assets, `server.mjs` proxy
- `/model` (backend/model) — detection model files (example: `best.pt`)

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
    # open the displayed URL
    ```
3. Production build + proxy (serve static via server.mjs)
    ```bash
    npm run build
    node server.mjs
    # open http://localhost:3000 (server.mjs defaults to 3000 in this repo)
    ```

If you use a separate proxy, ensure port is not blocked by the browser (avoid unsafe ports like 6000). Use 3000 or 5173 for local dev.

---

## PM2: process management with ecosystem file
This project includes an example `ecosystem.config.js` for running backend, frontend proxy and monitor with PM2. The file in the repo contains Windows-style paths — you should edit it for your environment (paths, Python interpreter, working directories).
- Example (Windows-style, provided in repo):
    ```bash
    // example: original windows-style ecosystem.config.js (edit to match your machine)
    module.exports = {
        apps: [
            {
            name: "cctv-backend",
            script: "app.py",
            interpreter: "C:/ProgramData/miniconda3/envs/cctv/python.exe",
            cwd: "C:/Users/Administrator/Projects/CCTV-Detection-Factory/backend",
            watch: false,
            autorestart: true,
            env: { FLASK_ENV: "production" }
            },
            {
            name: "cctv-frontend",
            script: "server.mjs",
            interpreter: "node",
            cwd: "C:/Users/Administrator/Projects/CCTV-Detection-Factory/frontend",
            watch: false,
            env: { NODE_ENV: "production", PORT: 3000 }
            }
        ]
    };
    ```
- Example (Unix / macOS) — recommended adjustments:
    ```bash
    // example: unix/macos-friendly ecosystem.config.js
    module.exports = {
        apps: [
            {
            name: "cctv-backend",
            script: "app.py",
            interpreter: "/path/to/venv/bin/python", // change to your venv python
            cwd: "/Users/macbook/Documents/CCTV-Detection-Factory/backend",
            watch: false,
            autorestart: true,
            env: { FLASK_ENV: "production", PORT: 5000 }
            },
            {
            name: "cctv-frontend",
            script: "server.mjs",
            interpreter: "node",
            cwd: "/Users/macbook/Documents/CCTV-Detection-Factory/frontend",
            watch: false,
            env: { NODE_ENV: "production", PORT: 3000 }
            }
        ]
    };
    ```

How to use PM2 with the ecosystem file:
1. Install PM2 (global):
    `bash npm install -g pm2`
2. Start processes:
    `bash pm2 start ecosystem.config.js`
3. View status/logs:
    ```bash
    pm2 list
    pm2 logs cctv-backend
    pm2 logs cctv-frontend
    ```
4. Save startup (so pm2 restarts on machine boot):
    ```bash
    pm2 save
    pm2 startup    
    ```
5. Stop / restart / delete:
    ```bash
    pm2 restart cctv-backend
    pm2 stop cctv-frontend
    pm2 delete cctv-monitor
    ```

Notes & best practices:
- Use the Python interpreter from the activated virtualenv `(e.g. .venv/bin/python)` instead of a global Anaconda base to avoid dependency errors and segmentation faults.
- Ensure `cwd` points correctly to the `backend` / `frontend` directories
- For production, prefer `server.mjs` (Node) serving the built frontend and proxying to the Flask API; ensure ports used are allowed and open.
- Set environment variables (DB, secrets, model paths) in `.env` or in the ecosystem `env` object (do not commit secrets).

---

## Troubleshooting & common issues
- filterpy install errors in Anaconda base: prefer a fresh venv or `bash conda install -c conda-forge filterpy`.
- Segmentation faults at Flask startup: check native libs (torch/opencv) and use matching binary wheels for your system.
- Frontend Hooks error ("useRef" on null): caused by duplicate React instances in the dependency tree. Run:
    `bash cd frontend && npm ls react react-dom`
    If duplicates exist: remove node_modules + lockfile and reinstall (rm -rf node_modules package-lock.json && npm install).

---

## Development tips
- Keep `requirements.txt` and `package.json` in sync with runtime needs.
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
    npm start
    ```
- PM2 control:
    ```bash
    pm2 start ecosystem.config.js
    pm2 save
    pm2 logs 
    pm2 monit
    ```

---

## License
© 2025 PT Summit Adyawinsa Indonesia.