// L.I.N.K. HUD API Server — Express + SQLite
import "dotenv/config";
import express from "express";
import cors from "cors";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import pinsRouter from "./routes/pins.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json({ limit: "64kb" }));

// API Routes
app.use("/api/pins", pinsRouter);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

// Serve frontend build (production)
const frontendDist = join(__dirname, "..", "..", "hud-app", "dist");
if (existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  // SPA fallback — serve index.html for any non-API route
  app.get("*", (_req, res) => {
    res.sendFile(join(frontendDist, "index.html"));
  });
  console.log(`Serving frontend from ${frontendDist}`);
}

// Start
app.listen(PORT, "0.0.0.0", () => {
  console.log(`L.I.N.K. API server listening on port ${PORT}`);
});
