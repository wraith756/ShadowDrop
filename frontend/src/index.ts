// NOTE: This is a sketch. The Python/Fernet backend is recommended.
// If you want this fleshed out (image pixel manipulation + encryption), tell me and I'll provide full code.
import express from "express";
import multer from "multer";
const upload = multer();
const app = express();

app.get("/", (req, res) => res.json({ status: "ok" }));

app.post("/api/hide", upload.single("image"), (req, res) => {
  // implement lsb embed + encryption (Fernet equivalent using crypto + AES-GCM)
  res
    .status(501)
    .json({
      error: "Not implemented — ask me to fully implement Node TS backend.",
    });
});

app.post("/api/extract", upload.single("image"), (req, res) => {
  res.status(501).json({ error: "Not implemented" });
});

app.listen(8000, () => console.log("Listening on 8000"));
