import fs from "fs";

const dbPath = "./data/payments.json";

export const getPayments = (req, res) => {
  const data = JSON.parse(fs.readFileSync(dbPath, "utf-8"));
  res.json(data.payments);
};

export const approvePayment = (req, res) => {
  const { id } = req.params;
  const db = JSON.parse(fs.readFileSync(dbPath, "utf-8"));

  const payment = db.payments.find((p) => p.id == id);
  if (!payment) return res.status(404).json({ message: "Not found" });

  payment.status = "approved";
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));

  return res.json({ message: "Approved", payment });
};

export const rejectPayment = (req, res) => {
  const { id } = req.params;
  const db = JSON.parse(fs.readFileSync(dbPath, "utf-8"));

  const payment = db.payments.find((p) => p.id == id);
  if (!payment) return res.status(404).json({ message: "Not found" });

  payment.status = "rejected";
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));

  return res.json({ message: "Rejected", payment });
};