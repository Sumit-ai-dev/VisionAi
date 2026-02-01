import express from "express";
import { createServer as createViteServer } from "vite";
import { readFile } from "node:fs/promises";
import { createRealtimeAnswer } from "./realtimeSession";
import { getSceneDescription } from "./vision";

const app = express();
app.use(express.json({ limit: "10mb" }));

app.post("/api/realtime/offer", async (req, res) => {
  try {
    const { sdp } = req.body as { sdp?: string };
    if (!sdp) {
      return res.status(400).json({ error: "Missing SDP" });
    }
    console.log("[SDP Offer] Received from browser (first 200 chars):", sdp.substring(0, 200));
    const answer = await createRealtimeAnswer(sdp);
    console.log("[SDP Answer] Received from OpenAI (first 200 chars):", answer.substring(0, 200));
    return res.json({ sdp: answer });
  } catch (error) {
    console.error("[SDP Error]", error);
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
    console.log(`VisionAI Nexus running on http://localhost:${port}`);
  });
};

startServer().catch((error) => {
  console.error(error);
  process.exit(1);
});
