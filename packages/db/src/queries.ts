import { eq } from "drizzle-orm";
import { db } from "./index";
import { chunks, type Chunk, type NewChunk } from "./schema";

export async function createChunk(data: NewChunk): Promise<Chunk> {
  const result = await db.insert(chunks).values(data).returning();
  return result[0];
}

export async function getChunkById(chunkId: string): Promise<Chunk | undefined> {
  const result = await db.select().from(chunks).where(eq(chunks.chunkId, chunkId));
  return result[0];
}

export async function updateChunkStatus(
  chunkId: string,
  status: string,
  uploadedAt?: Date,
  ackedAt?: Date
): Promise<Chunk | undefined> {
  const updateData: Partial<NewChunk> = {
    status,
    updatedAt: new Date(),
  };
  if (uploadedAt) updateData.uploadedAt = uploadedAt;
  if (ackedAt) updateData.ackedAt = ackedAt;

  const result = await db
    .update(chunks)
    .set(updateData)
    .where(eq(chunks.chunkId, chunkId))
    .returning();
  return result[0];
}

export async function getChunksByStatus(status: string): Promise<Chunk[]> {
  return await db.select().from(chunks).where(eq(chunks.status, status));
}

export async function updateTranscription(
  chunkId: string,
  transcriptionStatus: string,
  transcript?: string
): Promise<Chunk | undefined> {
  const updateData: Partial<NewChunk> = {
    transcriptionStatus,
    updatedAt: new Date(),
  };
  if (transcript) updateData.transcript = transcript;

  const result = await db
    .update(chunks)
    .set(updateData)
    .where(eq(chunks.chunkId, chunkId))
    .returning();
  return result[0];
}