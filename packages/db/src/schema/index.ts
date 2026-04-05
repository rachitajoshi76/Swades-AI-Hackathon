import { pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const chunks = pgTable("chunks", {
  id: uuid("id").primaryKey().defaultRandom(),
  chunkId: text("chunk_id").notNull().unique(),
  status: varchar("status", { length: 20 }).notNull().default("pending"), // pending, uploaded, acked
  uploadedAt: timestamp("uploaded_at"),
  ackedAt: timestamp("acked_at"),
  transcriptionStatus: varchar("transcription_status", { length: 20 }).default("pending"), // pending, processing, completed, failed
  transcript: text("transcript"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Chunk = typeof chunks.$inferSelect;
export type NewChunk = typeof chunks.$inferInsert;
