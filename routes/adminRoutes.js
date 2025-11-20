
const express = require("express");
const router = express.Router();

// Demo admin token and simple login (replace with real auth in production)
const ADMIN_TOKEN = "admin-demo-token";

router.post("/login", (req, res) => {
  const { username, password } = req.body || {};
  if (username === "admin" && password === "password") {
    return res.json({ ok: true, token: ADMIN_TOKEN, username: "admin" });
  }
  return res.status(401).json({ ok: false, message: "Invalid credentials" });
});

// Simple token auth middleware for admin routes
function adminAuth(req, res, next) {
  // allow login route through
  const authHeader = req.headers.authorization || req.headers["x-access-token"] || req.body.token;
  let token = null;
  if (authHeader && typeof authHeader === "string") {
    if (authHeader.startsWith("Bearer ")) token = authHeader.split(" ")[1];
    else token = authHeader;
  }

  if (token === ADMIN_TOKEN) return next();
  return res.status(401).json({ message: "unauthorized" });
}

// apply auth to following routes
router.use(adminAuth);

// Daily summary endpoint: returns daily sums for LAK and coin
router.get("/daily-summary", (req, res) => {
  try {
    const payments = req.app.get("payments") || [];
    const summary = {};
    payments.forEach((p) => {
      if (!p.createdAt) return;
      const date = new Date(p.createdAt);
      const key = date.toISOString().slice(0, 10);
      if (!summary[key]) summary[key] = { date: key, totalLAK: 0, totalCoin: 0, count: 0 };
      summary[key].totalLAK += Number(p.amountLAK || 0);
      summary[key].totalCoin += Number(p.coinAmount || p.coin || 0);
      summary[key].count += 1;
    });
    const result = Object.values(summary).sort((a, b) => b.date.localeCompare(a.date));
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: "server error" });
  }
});

// Use server's in-memory payments and save helper
router.get("/payments", (req, res) => {
  try {
    const payments = req.app.get("payments") || [];
    res.json(payments);
  } catch (err) {
    res.status(500).json({ message: "server error" });
  }
});

router.post("/approve/:id", (req, res) => {
  try {
    const payments = req.app.get("payments") || [];
    const save = req.app.get("savePayments");
    const io = req.app.get("io");
    const id = Number(req.params.id);

    const p = payments.find((x) => Number(x.id) === id);
    if (!p) return res.status(404).json({ message: "not found" });

    p.status = "approved";
    p.approvedAt = new Date();

    const notifyMessage = (req.body && req.body.message) || "Your top-up has been approved.";
    p.notifications = p.notifications || [];
    p.notifications.push({ message: notifyMessage, at: new Date(), type: "approved" });

    if (typeof save === "function") save();

    if (io) {
      io.emit("payment_update", p);
      try {
        const pendingCount = (req.app.get("payments") || []).filter((x) => x.status === "pending").length;
        console.log(`[notify] emitting topup_count=${pendingCount} (adminRoutes approve id=${p.id})`);
        io.emit("topup_count", { pending: pendingCount });
      } catch (e) {}
      try {
        io.to(`player_${p.playerId}`).emit("customer_notification", { id: p.id, playerId: p.playerId, message: notifyMessage });
      } catch (e) {
        console.error("Failed to emit customer_notification from adminRoutes approve:", e);
      }
    }

    res.json({ message: "approved", data: p });
  } catch (err) {
    res.status(500).json({ message: "server error" });
  }
});

router.post("/reject/:id", (req, res) => {
  try {
    const payments = req.app.get("payments") || [];
    const save = req.app.get("savePayments");
    const io = req.app.get("io");
    const id = Number(req.params.id);

    const p = payments.find((x) => Number(x.id) === id);
    if (!p) return res.status(404).json({ message: "not found" });

    p.status = "rejected";
    p.rejectedAt = new Date();

    const notifyMessage = (req.body && req.body.message) || "Your top-up has been rejected.";
    p.notifications = p.notifications || [];
    p.notifications.push({ message: notifyMessage, at: new Date(), type: "rejected" });

    if (typeof save === "function") save();

    if (io) {
      io.emit("payment_update", p);
      try {
        const pendingCount = (req.app.get("payments") || []).filter((x) => x.status === "pending").length;
        console.log(`[notify] emitting topup_count=${pendingCount} (adminRoutes reject id=${p.id})`);
        io.emit("topup_count", { pending: pendingCount });
      } catch (e) {}
      try {
        io.to(`player_${p.playerId}`).emit("customer_notification", { id: p.id, playerId: p.playerId, message: notifyMessage });
      } catch (e) {
        console.error("Failed to emit customer_notification from adminRoutes reject:", e);
      }
    }

    res.json({ message: "rejected", data: p });
  } catch (err) {
    res.status(500).json({ message: "server error" });
  }
});

module.exports = router;