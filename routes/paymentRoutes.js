const express = require("express");
const multer = require("multer");
const { uploadSlip } = require("../controllers/paymentController");

const router = express.Router();

const upload = multer({ dest: "uploads/" });

router.post("/upload-slip", upload.single("slip"), uploadSlip);

module.exports = router;