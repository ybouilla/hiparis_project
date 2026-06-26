# enter docker: docker run -it sh
# for docker  

# ---------- Stage 1: Build frontend ----------
FROM node:20 AS frontend-builder

WORKDIR /frontend

COPY frontend/package*.json ./
RUN npm install

COPY frontend/ ./
RUN npm run build


# ---------- Stage 2: Build backend ----------
FROM python:3.12-slim

WORKDIR /

# Install dependencies
RUN apt-get update && apt-get install -y \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend
COPY backend/ ./backend

# copy frontend
COPY frontend ./frontend

ENV PYTHONPATH=/app

COPY --from=frontend-builder /frontend/build ./frontend/build

EXPOSE 5000

CMD ["gunicorn", "--bind", "0.0.0.0:5000", "backend.wsgi:app"]

