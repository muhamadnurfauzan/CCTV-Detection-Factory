# Gunakan base image Python
FROM python:3.10-slim

# Set working directory di dalam container
WORKDIR /app

# Salin hanya requirements.txt terlebih dahulu agar caching bisa bekerja
COPY requirements.txt .

# Install system dependencies (untuk OpenCV & PyTorch)
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*

# Install dependencies Python
RUN pip install --no-cache-dir -r requirements.txt

# Setelah dependencies terpasang, baru salin kode proyek
COPY ./backend /app/backend
COPY ./db /app/db
COPY ./frontend /app/frontend

# Set working directory ke folder backend
WORKDIR /app/backend

# Jalankan aplikasi Flask
CMD ["python", "app.py"]