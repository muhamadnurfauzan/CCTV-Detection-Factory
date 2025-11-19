FROM python:3.10-slim

WORKDIR /app

# Copy requirements
COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

# Copy entire backend
COPY . .

# Expose backend port
EXPOSE 8000

# Run with gunicorn (entrypoint)
CMD ["gunicorn", "-b", "0.0.0.0:8000", "app:app"]
