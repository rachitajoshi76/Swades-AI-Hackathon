import { env } from "@my-better-t-app/env/server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { db, queries } from "@my-better-t-app/db";
import { z } from "zod";
import { transcribeAudio } from "./transcription";

const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
  }),
);

const BUCKET_DIR = join(process.cwd(), "bucket");

app.get("/", (c) => {
  return c.text("OK");
});

const uploadChunkSchema = z.object({
  chunkId: z.string(),
  data: z.string(), // base64 encoded
});

async function transcribeChunk(chunkId: string) {
  try {
    await queries.updateTranscription(chunkId, "processing");

    const filePath = join(BUCKET_DIR, chunkId);
    const audioBuffer = await readFile(filePath);

    const result = await transcribeAudio(audioBuffer);

    await queries.updateTranscription(chunkId, "completed", result.text);
    console.log(`Transcription completed for chunk ${chunkId}`);
  } catch (error) {
    console.error(`Transcription failed for chunk ${chunkId}:`, error);
    await queries.updateTranscription(chunkId, "failed");
  }
}

app.post("/api/chunks/upload", async (c) => {
  try {
    const body = await c.req.json();
    const { chunkId, data } = uploadChunkSchema.parse(body);

    // Check if chunk exists
    let chunk = await queries.getChunkById(chunkId);
    if (!chunk) {
      // Create chunk
      chunk = await queries.createChunk({ chunkId, status: "pending" });
    }

    // Decode base64 data
    const buffer = Buffer.from(data, "base64");

    // Ensure bucket directory exists
    await mkdir(BUCKET_DIR, { recursive: true });

    // "Upload" to local bucket
    const filePath = join(BUCKET_DIR, `${chunkId}`);
    await writeFile(filePath, buffer);

    // Update DB: mark as uploaded
    const uploadedAt = new Date();
    await queries.updateChunkStatus(chunkId, "uploaded", uploadedAt);

    // Then ack
    const ackedAt = new Date();
    await queries.updateChunkStatus(chunkId, "acked", undefined, ackedAt);

    // Trigger transcription asynchronously
    transcribeChunk(chunkId).catch(console.error);

    return c.json({ success: true, chunkId });
  } catch (error) {
    console.error("Upload error:", error);
    return c.json({ error: "Upload failed" }, 500);
  }
});

app.get("/api/chunks/:chunkId", async (c) => {
  const chunkId = c.req.param("chunkId");
  const chunk = await queries.getChunkById(chunkId);
  if (!chunk) {
    return c.json({ error: "Chunk not found" }, 404);
  }
  return c.json(chunk);
});

app.post("/api/chunks/:chunkId/transcribe", async (c) => {
  const chunkId = c.req.param("chunkId");
  const chunk = await queries.getChunkById(chunkId);
  if (!chunk) {
    return c.json({ error: "Chunk not found" }, 404);
  }

  // Trigger transcription
  transcribeChunk(chunkId).catch(console.error);

  return c.json({ message: "Transcription queued", chunkId });
});

import { serve } from "@hono/node-server";

const port = 3000;
console.log(`Server running on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});
