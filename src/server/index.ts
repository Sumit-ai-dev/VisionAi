import express from "express";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { readFile } from "node:fs/promises";
import { createRealtimeAnswer } from "./realtimeSession";
import { getSceneDescription } from "./vision";

dotenv.config();

const app = express();
app.use(express.json({ limit: "10mb" }));

app.post("/api/realtime/offer", async (req, res) => {
  try {
    const { sdp } = req.body as { sdp?: string };
    if (!sdp) {
      return res.status(400).json({ error: "Missing SDP" });
    }
    const answer = await createRealtimeAnswer(sdp);
    return res.json({ sdp: answer });
  } catch (error) {
    return res.status(500).json({ error: String(error) });
  }
});

app.post("/api/vision", async (req, res) => {
  try {
    const { image_base64_jpeg } = req.body as { image_base64_jpeg?: string };
    if (!image_base64_jpeg) {
      return res.status(400).json({ error: "Missing image data" });
    }
    const result = await getSceneDescription(image_base64_jpeg);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: String(error) });
  }
});

const startServer = async () => {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "custom"
  });
  app.use(vite.middlewares);

  app.get("*", async (req, res, next) => {
    try {
      const indexHtml = await readFile("index.html", "utf-8");
      const html = await vite.transformIndexHtml(req.originalUrl, indexHtml);
      res.status(200).set({ "Content-Type": "text/html" }).end(html);
    } catch (error) {
      next(error);
    }
  });

  const port = 3000;
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`VisionAI Nexus running on http://localhost:${port}`);
  });
};

startServer().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
