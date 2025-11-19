module.exports = {
  apps: [
    {
      name: "cctv-backend",
      script: "app.py",
      interpreter: "cmd",
      interpreterArgs: "/c C:\\Users\\Administrator\\miniconda3\\envs\\cctv\\python.exe",
      cwd: "C:\\Users\\Administrator\\Projects\\CCTV-Detection-Factory\\backend",
      watch: false
    },
    {
      name: "cctv-scheduler",
      script: "scheduler.py",
      interpreter: "cmd",
      interpreterArgs: "/c C:\\Users\\Administrator\\miniconda3\\envs\\cctv\\python.exe",
      cwd: "C:\\Users\\Administrator\\Projects\\CCTV-Detection-Factory\\backend",
      watch: false
    }
  ]
};
