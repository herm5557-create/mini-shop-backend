Deploying the backend

This backend is a simple Express + Socket.IO server.

Run locally:

```bash
cd backend
npm install
npm start
```

Environment:
- `PORT` can be used to override the default 5000.

Docker (build and run locally):

```bash
# build
docker build -t mini-shop-backend ./backend
# run
docker run -p 5000:5000 -e PORT=5000 mini-shop-backend
```

Deploying to a service (Render / Railway / Heroku / Fly):
- Ensure the service runs `npm start` inside the `backend` folder (or point root to `backend`).
- Set environment variable `PORT` if necessary.
- Ensure `uploads/` and `data/` are persisted if you need file persistence (or use external storage).

Notes:
- This repository uses a JSON file `data/payments.json` for persistence; this is ephemeral on most platforms unless you mount persistent storage.
- For production, consider replacing file storage with a proper database (Postgres, MongoDB) and S3-compatible storage for uploads.
