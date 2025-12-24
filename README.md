# CCTV-Detection-Factory

Prototype system for CCTV-based PPE (helmet/vest/etc.) detection with per-object tracking, deduplicated violation captures, and a web dashboard. The system uses a Python Flask backend for detection and workers, a Vite + React frontend (stream proxy and UI), PM2 for process orchestration, and Redis for shared state/stream coordination.

---

## Key features
- YOLO-based PPE detection (models in `backend/model/`)
- SORT-based tracking and per-object violation deduplication
- Per-camera worker processes managed by PM2 orchestrator (dynamic start/stop)
- Violation crops saved with timestamp, camera/location, and object ID
- React dashboard + MJPEG/stream proxy (frontend)
- Optional Redis for shared state, stream coordination and lightweight queues

---

## Repository layout
- `backend/` — Flask app, detection core, workers, routes, services, `requirements.txt`
  - `core/` — detection, scheduler, violation processor
  - `workers/` — pm2 manager and per-CCTV worker scripts
- `frontend/` — Vite + React app, `server.mjs` proxy, build output
- `ecosystem.config.js` — PM2 process config (edit before use)
- `model/` — detection model files
- `violations/` — runtime: saved violation crops
- `.env` / `backend/.env` — environment variables

---

## Environment / prerequisites
- Python 3.10+ (use a dedicated venv; avoid Anaconda base)
- Node.js 18+ and npm
- Redis (recommended for orchestrator / shared state)
- GPU users: install PyTorch wheel compatible with your CUDA
- Install backend deps from `backend/requirements.txt` and frontend deps from `frontend/package.json`

---

## Configuration (env)
Create `.env` in repo root or `backend/.env`. 
Do not commit secrets.

---

## Development quick start

1. Setup Environtment
    - Install Anaconda https://www.anaconda.com/download
    - Agree the Term of Services (ToS)
        ```bash
        conda tos accept --override-channels --channel https://repo.anaconda.com/pkgs/main
        conda tos accept --override-channels --channel https://repo.anaconda.com/pkgs/r
        conda tos accept --override-channels --channel https://repo.anaconda.com/pkgs/msys2
        ```
    - Make new environtment 
        ```bash
        conda create -n your_env_name python=3.10 -y
        conda activate your_env_name
        ```
    - Install some dependencies
        ```bash
        pip install -r backend/requirements.txt
        pip install redis ultralytics
        npm install
        npm install pm2 -g
        ```

2. Start Redis 
    - macOS Homebrew:
     ```bash
     brew install redis
     brew services start redis
     ```
    - Windows: You can install manually example in here: https://github.com/tporadowski/redis/releases, after that you shoud start Redis
    ```bash
    ./redis-server --service-install
    ./redis-server --service-start
    ```

3. Backend
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install --upgrade pip setuptools wheel
   cp backend/.env.example backend/.env 
   python backend/app.py
   ```

4. Frontend
    ```bash
    cd frontend
    npm run build
    node server.mjs
    ```

---

## PM2 orchestration (production / multi-process)

1. Install PM2 (if you haven't installed it before):
    ```bash
    npm install -g pm2
    ```

2. Edit file `ecosystem.config.js` to match your environtment:
    - Set `interpreter` for Python apps to your venv python (e.g.`/full/path/to/.venv/bin/python`).
        Notes:
        Make sure `ecosystem.config.js` points to `pythonw.exe` (Windows) to prevent repeated CMD windows from appearing:
        ```bash interpreter: "C:/ProgramData/miniconda3/envs/cctv/pythonw.exe"```
    - Ensure `cwd` points to backend/frontend directories.
    - Do not hardcode secrets — use `.env` or PM2 env variables.

3. Start processes:
    ```bash
    pm2 start ecosystem.config.js
    pm2 list
    ```

4. Logs and management:
    ```bash
    pm2 logs cctv-backend # Or you can simply type id 1, 2, etc. 
    pm2 restart cctv-orchestrator  # You can also type `pm2 restart all`. 
    pm2 save
    pm2 startup
    ```

Notes:
- Use venv python in PM2 to avoid native binary mismatches (segfaults).
- The orchestrator uses Redis to coordinate per-camera workers; ensure Redis is running when using PM2 orchestrator.
- Self-Healing Mechanism: The CCTV worker is equipped with an internal *Watchdog*. If the stream is stuck for 15 seconds, the worker will shut itself down (`os._exit(1)`) and PM2 will restart automatically.
- Dual-Mode Logic: The system does not kill workers when they are not scheduled, but instead switches to power saving mode (Stream Only) to ensure the Dashboard continues to display video without YOLO GPU load.

---

## Redis usage

- Recommended for shared state (active camera list, per-object dedupe caches) and simple job queues.
- Set `REDIS_HOST/PORT/DB` in .env.
- Orchestrator (pm2_manager.py) and workers use Redis to coordinate worker lifecycle and lightweight message passing.

---

## Troubleshooting (common issues)

- filterpy install errors in Anaconda: use a clean venv or `conda install -c conda-forge filterpy`.
- Segmentation fault at Flask start: likely incompatible native libs (torch/opencv). Recreate venv and install appropriate wheels.
- Frontend "useRef" / hooks error: duplicate React instances. Check:
    ```bash
    cd frontend
    npm ls react react-dom
    ```
    If duplicates exist: remove node_modules and lockfile and reinstall:
    ```bash
    rm -rf node_modules package-lock.json
    npm install
    npm run build
    ```
- Browser blocks unsafe ports (ERR_UNSAFE_PORT): use safe ports like 3000, 5173, 5000.

---

## Useful commands

- Backend (venv):
    ```bash
    source .venv/bin/activate
    python backend/app.py
    ```

- Frontend dev: 
    ```bash
    cd frontend
    npm run dev # Or you can simply type `npm run dev`
    ```

- PM2:
    ```bash
    pm2 start ecosystem.config.js
    pm2 logs
    pm2 save
    ```

---

## Useful commands

- Keep detection, worker orchestration, and web routes separated (see `core` and `workers`).
- Use Redis for production orchestration to avoid race conditions.
- Use the venv Python interpreter in PM2 to ensure compatibility with compiled Python wheels.
- Add basic health endpoints for backend and frontend to let PM2 and load balancers detect service health.

---

## License & attribution
© 2025 PT Summit Adyawinsa Indonesia. See LICENSE if provided.