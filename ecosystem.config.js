module.exports = {
  apps: [
    // 1. Backend utama (Flask + YOLO detection)
    {
      name: "cctv-backend",
      script: "app.py",
      interpreter: "C:/ProgramData/miniconda3/envs/cctv/python.exe",
      cwd: "C:/Users/Administrator/Projects/CCTV-Detection-Factory/backend",
      watch: false,
      autorestart: true,
      env: { FLASK_ENV: "production" }
    },

    // 2. Frontend / Supabase proxy
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