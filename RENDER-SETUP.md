# Render Deployment Guide

## Important: Your code is ready for Render!

The server.js already uses `process.env.PORT` which Render will provide.

## Step-by-Step Render Configuration

### In Render Dashboard (https://dashboard.render.com/):

1. **Create New Web Service** (or edit existing one)
   - Click "New +" → "Web Service"
   - Connect GitHub repository: `herm5557-create/mini-shop-backend`

2. **Configuration Settings:**
   ```
   Name: mini-shop-backend
   Root Directory: (LEAVE EMPTY - very important!)
   Environment: Node
   Branch: main
   Build Command: npm install
   Start Command: npm start
   ```

3. **Environment Variables:**
   - Add: `NODE_ENV` = `production`

4. **Plan:**
   - Select: Free

5. **Create Web Service**

## Why Root Directory Must Be Empty

Your repository structure:
```
/ (repository root)
├── package.json
├── server.js
├── render.yaml
├── controllers/
├── routes/
└── ...
```

If Root Directory = `backend`, Render looks for `/backend/package.json` which doesn't exist.
If Root Directory = empty, Render finds `/package.json` ✓

## After Deployment

Your service URL will be: `https://mini-shop-backend-xxxx.onrender.com`

Test it:
```bash
curl https://your-service-url.onrender.com/api/payment/list
```

## Update Frontend

Change frontend API URL from:
- `http://localhost:5000` 
To:
- `https://your-service-url.onrender.com`
