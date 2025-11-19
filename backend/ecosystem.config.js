module.exports = {
  apps: [
    {
      name: "cctv-detection",
      script: "C:/Users/Administrator/miniconda3/envs/cctv/python.exe",
      args: "app.py",
      cwd: "C:/Users/Administrator/Projects/CCTV-Detection-Factory/backend",
      interpreter: "none",
      watch: false
    },
    {
      name: "cctv-scheduler",
      script: "C:/Users/Administrator/miniconda3/envs/cctv/python.exe",
      args: "scheduler.py",
      cwd: "C:/Users/Administrator/Projects/CCTV-Detection-Factory/backend",
      watch: false,
      interpreter: "none"
    }
  ]
}
