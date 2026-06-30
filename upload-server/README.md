# PortZen Upload Server

Express API that handles image uploads for the edit portal.

## Setup

```bash
cp .env.example .env
# Fill in SUPABASE_URL and SUPABASE_SERVICE_KEY in .env

npm install
npm start
```

Server listens on port 3001 (configurable via PORT env var).

## Install as systemd service (Linux/WSL)

```bash
sudo cp portzen-upload.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable portzen-upload
sudo systemctl start portzen-upload

# Check status
sudo systemctl status portzen-upload
sudo journalctl -u portzen-upload -f
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /upload | Upload image (multipart/form-data) |
| DELETE | /upload | Delete image (JSON body) |
| GET | /health | Health check |

### POST /upload fields
- `file` — image file (jpg/png/webp, max 5MB)
- `subdomain` — customer subdomain
- `token` — edit token (validated against Supabase)
- `slot` — filename slot, e.g. `hero_1`, `gallery_5`, `about`

### DELETE /upload fields
- `subdomain`, `token`, `slot`

## File storage

Files saved to: `/mnt/d/www/photographer/uploads/{subdomain}/{slot}.{ext}`
