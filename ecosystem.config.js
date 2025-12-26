module.exports = {
  apps: [
    // 1. Backend Utama (Murni API Server)
    {
      name: "cctv-backend",
      script: "app.py",
      interpreter: "/Users/macbook/opt/anaconda3/envs/comvis/bin/python", 
      // interpreter: "C:/ProgramData/miniconda3/envs/cctv/python.exe",
      cwd: "./backend",
      // cwd: "C:/Users/Administrator/Projects/CCTV-Detection-Factory/backend",
      watch: false,
      autorestart: true,
      env: { FLASK_ENV: "production" }
    },

    // 2. PM2 Orchestrator (Manager yang mengatur hidup/mati kamera secara dinamis)
    {
      name: "cctv-orchestrator",
      script: "workers/pm2_manager.py", 
      interpreter: "/Users/macbook/opt/anaconda3/envs/comvis/bin/python",
      // interpreter: "C:/ProgramData/miniconda3/envs/cctv/python.exe",
      cwd: "./backend",
      // cwd: "C:/Users/Administrator/Projects/CCTV-Detection-Factory/backend",
      watch: false,
      autorestart: true
    },

    // 3. Frontend Server Mac
    {
      name: "cctv-frontend",
      script: "npm",
      args: "start",
      cwd: "./frontend",
      env: { NODE_ENV: "development" }
    }

    // 3. Frontend Server Win
    // {
    //   name: "cctv-frontend",
    //   script: "server.mjs",
    //   interpreter: "node",
    //   cwd: "C:/Users/Administrator/Projects/CCTV-Detection-Factory/frontend",
    //   watch: false,
    //   env: { NODE_ENV: "production", PORT: 3000 }
    // }
  ]
};