# CCTV Detection Factory

Prototype system for **CCTV-based PPE (helmet, vest, etc.) detection** with object tracking, violation capture, and a web dashboard. 

The system uses:
* **Python Flask** for backend API and detection pipeline
* **YOLO (YOLOv12n,m,l)** for PPE detection
* **SORT** for object tracking
* **React + Vite** for the dashboard UI
* **Redis** for shared state and worker coordination
* **PM2** for multi-process orchestration
Violation images are automatically captured and stored with timestamp, camera location, and object ID.

---

## System Architecture
```
                +---------------------+
                |     React UI        |
                |  (Frontend Server)  |
                +----------+----------+
                           | HTTP / MJPEG
                   +-------v--------+
                   |   Flask API    |
                   |  (Backend)     |
                   +-------+--------+
                           | Redis (state, coordination)
               +-----------v-----------+
               |   PM2 Orchestrator    |
               | (Worker Management)   |
               +-----------+-----------+
                           |
        +------------------+------------------+
        |                                     |
+-------v-------+                     +--------v-------+
| CCTV Worker 1 |                     | CCTV Worker N  |
| YOLO + SORT   |                     | YOLO + SORT    |
+-------+-------+                     +--------+-------+
        |                                      |
        +--------------> Violations <----------+
                        Image Storage
```

Each CCTV stream runs in an **independent worker process** managed by PM2.
Workers perform detection and send results through Redis to the backend/dashboard.

---

## Key Features
* YOLO-based PPE detection
* SORT tracking for object persistence
* Per-object **violation deduplication**
* Automatic **violation image capture**
* **Multi-camera worker system**
* React dashboard with live CCTV streams
* Redis coordination for distributed workers
* PM2 orchestration and auto-restart

---

## Repository Structure
```
CCTV-Detection-Factory
│
├── backend/
│   ├── app.py                # Flask entrypoint
│   ├── requirements.txt
│   ├── core/                 # Detection & processing logic
│   │   ├── detection
│   │   ├── scheduler
│   │   └── violation_processor
│   ├── workers/              # Per-camera workers
│   │   ├── pm2_manager.py
│   │   └── cctv_worker.py
│   ├── model/                # YOLO model files
│   ├── services/             # DB / storage services
|   └── .env.example          # Environment variable template
│
├── frontend/
│   ├── src/
│   ├── server.mjs            # Stream proxy server
│   └── package.json
│
├── ecosystem.config.js       # PM2 process configuration
└── README.md
```

---

## Requirements
* **Python 3.10+**
* **Node.js 18+**
* **Redis**
* **npm**
* **PM2 (global)**

Optional:
* GPU with CUDA for faster YOLO inference

---

## Quick Start

1. Create Python Environment
    Using Conda:
    ```bash
    conda create -n your_name_env python=3.10 -y
    conda activate your_name_env
    ```

2. Install Backend Dependencies
    ```bash
    pip install -r backend/requirements.txt
    pip install redis ultralytics
    pip install --upgrade pip setuptools wheel
    ```

3. Install Frontend Dependencies
    ```bash
    cd frontend
    npm install
    npm install -g pm2
    ```

4. Database Setup
    The system uses **PostgreSQL by Supabase**.
    A database schema is provided in:
    ```
    db_ppe_detection.sql
    ```

4. Configure Environment Variables
    Create the `.env` file from the template:
    ```bash
    cp backend/.env.example backend/.env
    ```
    Then edit the file and fill in the required values.

5. Start Redis
    - macOS (Homebrew):
        ```bash
        brew install redis
        brew services start redis
        ```
    - Windows:
        Download Redis from:
        https://github.com/tporadowski/redis/releases
        Then start:
        ```bash
        redis-server
        ```

6. Run Backend
    ```bash
    python backend/app.py
    ```

7. Run Frontend
    ```bash
    cd frontend
    npm run build
    node server.mjs
    ```

---

## PM2 Orchestration (Multi-Camera Workers)
PM2 is used to manage backend services and automatically restart workers.
- Start the system:
    ```bash
    pm2 start ecosystem.config.js
    pm2 list
    ```

- View logs:
    ```bash
    pm2 logs
    ```

- Restart services:
    ```bash
    pm2 restart all
    ```

- Save configuration:
    ```bash
    pm2 save
    pm2 startup
    ```

---

## Redis Usage
Redis is used for:
* Worker coordination
* Shared camera state
* Lightweight message passing
* Deduplication caches
Ensure Redis is running before starting the system.

---

## Troubleshooting

- Python dependency errors
    Recreate the environment:
    ```bash
    conda remove -n cctv --all
    conda create -n cctv python=3.10
    ```

- Frontend React hook errors
    Reinstall node modules:
    ```bash
    rm -rf node_modules package-lock.json
    npm install
    npm run build
    ```

- Browser blocks port
    Use safe ports such as:
    ```
    3000
    5001
    5173
    ```

---

## Useful Commands

- Backend
    ```bash
    conda activate your_name_env
    python backend/app.py
    ```

- Frontend development
    ```bash
    cd frontend
    npm run dev
    ```

- PM2
    ```bash
    pm2 start ecosystem.config.js
    pm2 logs
    pm2 save
    ```

---

## License
© 2025 PT Summit Adyawinsa Indonesia
