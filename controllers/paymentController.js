const fs = require("fs");
const path = require("path");

const uploadSlip = (req, res) => {
  const { playerId, coin, amountLAK } = req.body;

  const slipFilename = req.file ? req.file.filename : null;

  const dbPath = path.join(__dirname, "..", "data", "payments.json");

  let json = { payments: [] };
  try {
    json = JSON.parse(fs.readFileSync(dbPath, "utf-8"));
  } catch (err) {
    // initialize file if missing
    try {
      fs.mkdirSync(path.join(__dirname, "..", "data"), { recursive: true });
      fs.writeFileSync(dbPath, JSON.stringify(json, null, 2));
    } catch (e) {
      console.error("Failed to init payments.json:", e);
    }
  }

  const newPayment = {
    id: Date.now(),
    playerId,
    coinAmount: Number(coin),
    amountLAK: Number(amountLAK),
    slipUrl: slipFilename ? "/uploads/" + slipFilename : null,
    status: "pending",
    notifications: [],
    createdAt: new Date().toISOString(),
  };

  // append initial 'created' notification so history shows order creation
  const createdNote = { message: "Your top-up request has been received.", at: new Date().toISOString(), type: "created" };
  newPayment.notifications = newPayment.notifications || [];
  newPayment.notifications.push(createdNote);

  json.payments.push(newPayment);

  // also update in-memory payments array in server if available
  try {
    const mem = req && req.app && req.app.get && req.app.get("payments");
    if (Array.isArray(mem)) mem.push(newPayment);
  } catch (e) {}

  try {
    fs.writeFileSync(dbPath, JSON.stringify(json, null, 2));
  } catch (err) {
    console.error("Failed to write payments.json:", err);
    return res.status(500).json({ message: "Failed to save" });
  }

  // Emit socket event if socket instance was attached to app
  try {
    const io = req && req.app && req.app.get && req.app.get("io");
    // notify admin/dashboard about new payment
    if (io) io.emit("new_payment", newPayment);
    // also notify the specific player privately if they've identified
    try {
      if (io) io.to(`player_${newPayment.playerId}`).emit("customer_notification", { id: newPayment.id, playerId: newPayment.playerId, message: createdNote.message });
    } catch (e) {
      /* ignore */
    }

    // emit pending count for admin badge
    try {
      const mem = req && req.app && req.app.get && req.app.get("payments");
      const pendingCount = Array.isArray(mem) ? mem.filter((x) => x.status === "pending").length : json.payments.filter((x) => x.status === "pending").length;
      if (io) {
        console.log(`[notify] emitting topup_count=${pendingCount} (new payment id=${newPayment.id})`);
        io.emit("topup_count", { pending: pendingCount });
      }
    } catch (e) {
      /* ignore */
    }
  } catch (e) {}

  return res.json({ message: "Upload success", data: newPayment });
};

module.exports = { uploadSlip };