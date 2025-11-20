// backend/server.js
const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");

const app = express();
app.use(cors());
app.use(express.json());

// Health check endpoint for Render
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Mini Shop Backend API", timestamp: new Date() });
});

// static uploads
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// server + socket.io
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {
  cors: { origin: "*" },
});

// persistent store (file-backed)
const fs = require("fs");
const dbPath = path.join(__dirname, "data", "payments.json");

const readPaymentsFromFile = () => {
  try {
    const raw = fs.readFileSync(dbPath, "utf-8");
    const json = JSON.parse(raw);
    return Array.isArray(json.payments) ? json.payments : [];
  } catch (err) {
    // If file missing or invalid, initialize with empty structure
    try {
      fs.mkdirSync(path.join(__dirname, "data"), { recursive: true });
      fs.writeFileSync(dbPath, JSON.stringify({ payments: [] }, null, 2));
    } catch (e) {
      console.error("Failed to create payments.json:", e);
    }
    return [];
  }
};

let payments = readPaymentsFromFile();

// normalize payments to ensure notifications array exists
payments = payments.map((p) => ({
  ...p,
  notifications: Array.isArray(p.notifications) ? p.notifications : [],
}));
// expose in-memory payments for other modules/controllers to mutate
app.set("payments", payments);
const savePayments = () => {
  try {
    fs.writeFileSync(dbPath, JSON.stringify({ payments }, null, 2));
    // keep app-level reference updated
    app.set("payments", payments);
  } catch (err) {
    console.error("Failed to save payments.json:", err);
  }
};

// expose save helper so mounted routers can persist
app.set("savePayments", savePayments);

// socket.io events
io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  // allow clients to identify themselves (join a per-player room)
  socket.on("identify", (playerId) => {
    if (!playerId) return;
    const room = `player_${playerId}`;
    socket.join(room);
    console.log(`Socket ${socket.id} joined room ${room}`);
  });

  socket.on("get_payments", () => {
    socket.emit("payments_list", payments);
  });

  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);
  });
});

// emitter
const pushNewPayment = (data) => io.emit("new_payment", data);
const pushUpdate = (data) => io.emit("payment_update", data);

// multer
const multer = require("multer");
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) =>
    cb(null, Date.now() + "_" + file.originalname),
});
const upload = multer({ storage });
// expose io to mounted routers/controllers
app.set("io", io);

// mount external routes (converted to CommonJS)
const paymentRoutes = require("./routes/paymentRoutes");
app.use("/api/payment", paymentRoutes);
// reuse controller for topup to avoid duplication
const { uploadSlip } = require("./controllers/paymentController");
app.post("/api/payment/topup", upload.single("slip"), uploadSlip);

app.get("/api/payment/list", (req, res) => {
  res.json(payments);
});

// Admin-compatible endpoints (Admin.jsx expects `/api/admin/...` and a different payment shape)
app.get("/api/admin/payments", (req, res) => {
  const adapted = payments.map((p) => ({
    id: p.id,
    playerId: p.playerId,
    coin: p.coinAmount ?? p.coin ?? p.amount ?? 0,
    amountLAK: p.amountLAK ?? p.amountLAK,
    // normalize slip filename (either `slipUrl` like '/uploads/xxx' or `slip`)
    slip:
      p.slipUrl && p.slipUrl.startsWith("/uploads/")
        ? p.slipUrl.replace("/uploads/", "")
        : p.slip || (p.slipUrl ? p.slipUrl : null),
    status: p.status,
    time: p.createdAt ?? p.time ?? null,
    notifications: Array.isArray(p.notifications) ? p.notifications : [],
  }));

  res.json(adapted);
});

app.post("/api/admin/approve/:id", (req, res) => {
  const id = Number(req.params.id);
  const p = payments.find((x) => Number(x.id) === id);
  if (!p) return res.status(404).json({ message: "not found" });

  p.status = "approved";
  p.approvedAt = new Date();

  const notifyMessage = (req.body && req.body.message) || "Your top-up has been approved.";
  p.notifications = p.notifications || [];
  p.notifications.push({ message: notifyMessage, at: new Date(), type: "approved" });

  savePayments();
  // emit update and notify customer privately
  pushUpdate(p);
    try {
    const pendingCount = payments.filter((x) => x.status === "pending").length;
    console.log(`[notify] emitting topup_count=${pendingCount} (approve admin id=${p.id})`);
    io.emit("topup_count", { pending: pendingCount });
  } catch (e) {}
  try {
    io.to(`player_${p.playerId}`).emit("customer_notification", { id: p.id, playerId: p.playerId, message: notifyMessage });
  } catch (err) {
    console.error("Failed to emit customer_notification on approve (admin):", err);
  }

  res.json({ message: "approved", data: p });
});

app.post("/api/admin/reject/:id", (req, res) => {
  const id = Number(req.params.id);
  const p = payments.find((x) => Number(x.id) === id);
  if (!p) return res.status(404).json({ message: "not found" });

  p.status = "rejected";
  p.rejectedAt = new Date();

  // build notification message (allow optional message in body)
  const notifyMessage = (req.body && req.body.message) || "Your top-up has been rejected.";
  p.notifications = p.notifications || [];
  p.notifications.push({ message: notifyMessage, at: new Date(), type: "rejected" });

  savePayments();
  // emit update and notify customer
  pushUpdate(p);
  try {
    const pendingCount = payments.filter((x) => x.status === "pending").length;
    console.log(`[notify] emitting topup_count=${pendingCount} (reject admin id=${p.id})`);
    io.emit("topup_count", { pending: pendingCount });
  } catch (e) {}
  try {
    io.to(`player_${p.playerId}`).emit("customer_notification", { id: p.id, playerId: p.playerId, message: notifyMessage });
  } catch (err) {
    console.error("Failed to emit customer_notification on reject (admin):", err);
  }

  res.json({ message: "rejected", data: p });
});

// Notify customer via socket (admin can send message after approve)
app.post("/api/admin/notify/:id", (req, res) => {
  const id = Number(req.params.id);
  const { message } = req.body || {};

  const p = payments.find((x) => Number(x.id) === id);
  if (!p) return res.status(404).json({ message: "not found" });

  // Emit a notification event to frontend clients
  try {
    // persist notification
    p.notifications = p.notifications || [];
    p.notifications.push({ message: message || "", at: new Date(), type: "notify" });
    savePayments();

    io.to(`player_${p.playerId}`).emit("customer_notification", { id: p.id, playerId: p.playerId, message });
  } catch (err) {
    console.error("Failed to emit customer_notification", err);
  }

  return res.json({ message: "notified", data: { id: p.id, message } });
});

app.post("/api/payment/approve/:id", (req, res) => {
  const id = Number(req.params.id);
  const p = payments.find((x) => x.id === id);

  if (!p) return res.status(404).json({ message: "not found" });

  p.status = "approved";
  p.approvedAt = new Date();

  const notifyMessage = (req.body && req.body.message) || "Your top-up has been approved.";
  p.notifications = p.notifications || [];
  p.notifications.push({ message: notifyMessage, at: new Date(), type: "approved" });

  savePayments();
  pushUpdate(p);

  try {
    const pendingCount = payments.filter((x) => x.status === "pending").length;
    console.log(`[notify] emitting topup_count=${pendingCount} (approve payment id=${p.id})`);
    io.emit("topup_count", { pending: pendingCount });
  } catch (e) {}

  try {
    io.to(`player_${p.playerId}`).emit("customer_notification", { id: p.id, playerId: p.playerId, message: notifyMessage });
  } catch (err) {
    console.error("Failed to emit customer_notification on approve (payment):", err);
  }

  res.json({ message: "approved", data: p });
});

app.post("/api/payment/reject/:id", (req, res) => {
  const id = Number(req.params.id);
  const p = payments.find((x) => x.id === id);

  if (!p) return res.status(404).json({ message: "not found" });

  p.status = "rejected";
  p.rejectedAt = new Date();

  const notifyMessage = (req.body && req.body.message) || "Your top-up has been rejected.";
  p.notifications = p.notifications || [];
  p.notifications.push({ message: notifyMessage, at: new Date(), type: "rejected" });

  savePayments();
  pushUpdate(p);

  try {
    const pendingCount = payments.filter((x) => x.status === "pending").length;
    console.log(`[notify] emitting topup_count=${pendingCount} (reject payment id=${p.id})`);
    io.emit("topup_count", { pending: pendingCount });
  } catch (e) {}

  try {
    io.to(`player_${p.playerId}`).emit("customer_notification", { id: p.id, playerId: p.playerId, message: notifyMessage });
  } catch (err) {
    console.error("Failed to emit customer_notification on reject (payment):", err);
  }

  res.json({ message: "rejected", data: p });
});

// Return notifications for a specific payment (customer-facing)
app.get("/api/payment/:id/notifications", (req, res) => {
  const id = Number(req.params.id);
  const p = payments.find((x) => Number(x.id) === id);
  if (!p) return res.status(404).json({ message: "not found" });

  res.json({ id: p.id, playerId: p.playerId, notifications: Array.isArray(p.notifications) ? p.notifications : [] });
});
const adminRoutes = require("./routes/adminRoutes");
app.use("/api/admin", adminRoutes);
// start
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log(`Backend + Socket.IO running on ${HOST}:${PORT}`);
});