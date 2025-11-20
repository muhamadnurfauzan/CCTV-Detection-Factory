module.exports = {
  apps: [
    // === PYTHON BACKEND (Flask + YOLO) ===
    {
      name: "cctv-flask",
      script: "app.py",
      interpreter: "C:/ProgramData/miniconda3/envs/cctv/python.exe",
      cwd: "C:/Users/Administrator/Projects/CCTV-Detection-Factory/backend",
      watch: false,
      env: {
        FLASK_ENV: "production"
      }
    },

    // === NODE.JS EXPRESS (Supabase Proxy) ===
    {
      name: "cctv-supabase",
      script: "server.mjs",
      interpreter: "node",                           
      cwd: "C:/Users/Administrator/Projects/CCTV-Detection-Factory/frontend",
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: 3000
      }
    },
  ]
};