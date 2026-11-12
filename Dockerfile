# enter docker: docker run -it sh
# for docker  

# ---------- Stage 1: Build frontend ----------
# Base images are fully qualified: Podman refuses short names such as "node:20" when it
# cannot ask which registry to use (no terminal, CI).
FROM docker.io/library/node:20 AS frontend-builder

WORKDIR /frontend

COPY frontend/package*.json ./
RUN npm install

COPY frontend/ ./
RUN npm run build


# ---------- Stage 2: Build backend ----------
FROM docker.io/library/python:3.12-slim

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

# copy entrypoint
COPY entrypoint.sh ./entrypoint.sh

# gunicorn settings (picked up automatically from the working directory)
COPY gunicorn.conf.py ./gunicorn.conf.py
RUN chmod +x /entrypoint.sh

ENV PYTHONPATH=/ \
    PYTHONDONTWRITEBYTECODE=1

COPY --from=frontend-builder /frontend/build ./frontend/build

# Run as an unprivileged user. The code stays owned by root and read-only for it: the app
# only needs to write to /tmp (gunicorn's worker files), which compose mounts as a tmpfs.
RUN groupadd --system --gid 10001 app \
 && useradd --system --uid 10001 --gid app --no-create-home --shell /usr/sbin/nologin app
USER 10001:10001

EXPOSE 5000
ENTRYPOINT ["/entrypoint.sh"]
CMD ["serve"]



