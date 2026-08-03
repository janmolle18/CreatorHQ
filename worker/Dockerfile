# Worker-Image: Node + ffmpeg + yt-dlp + Pipeline (aus ClipPilot, + shared-Workspace)
FROM node:22-bookworm-slim

# System-Tools: ffmpeg (Schnitt/Burn-in + Untertitel), yt-dlp (Download),
# python3 + faster-whisper (Transkription), Schriften für libass-Untertitel,
# postgresql-client-16 aus dem PGDG-Repo (pg_dump muss zur Server-Version 16
# passen — Debian bookworm liefert nur Client 15).
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
  && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/pgdg.gpg \
  && echo "deb [signed-by=/usr/share/keyrings/pgdg.gpg] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip fontconfig fonts-dejavu-core postgresql-client-16 \
  && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
  && chmod a+rx /usr/local/bin/yt-dlp \
  && pip3 install --break-system-packages --no-cache-dir faster-whisper \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Monorepo: alle Workspace-Manifeste kopieren, damit npm den Graph auflösen kann.
# (tsx/typescript sind devDeps und werden zur Laufzeit gebraucht → kein --omit=dev)
COPY package.json package-lock.json* ./
COPY db/package.json ./db/
COPY shared/package.json ./shared/
COPY worker/package.json ./worker/
COPY web/package.json ./web/
RUN npm install

# Nur die für den Worker nötigen Quellen kopieren
COPY db ./db
COPY shared ./shared
COPY worker ./worker

ENV NODE_ENV=production
ENV TMP_DIR=/app/tmp
ENV COOKIES_PATH=/app/cookies.txt
WORKDIR /app/worker
CMD ["npx", "tsx", "src/index.ts"]
