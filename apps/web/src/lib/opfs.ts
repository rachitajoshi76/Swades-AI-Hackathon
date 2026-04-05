// OPFS utilities for storing and retrieving chunks

export interface StoredChunk {
  id: string;
  chunkId: string;
  data: ArrayBuffer;
  timestamp: number;
}

class OPFSManager {
  private root: FileSystemDirectoryHandle | null = null;

  async init() {
    if (!('storage' in navigator && 'getDirectory' in navigator.storage)) {
      throw new Error('OPFS not supported');
    }
    this.root = await navigator.storage.getDirectory();
  }

  async storeChunk(chunkId: string, data: ArrayBuffer): Promise<void> {
    if (!this.root) await this.init();
    const chunksDir = await this.root!.getDirectoryHandle('chunks', { create: true });
    const fileHandle = await chunksDir.getFileHandle(chunkId, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(data);
    await writable.close();
  }

  async getChunk(chunkId: string): Promise<ArrayBuffer | null> {
    if (!this.root) await this.init();
    try {
      const chunksDir = await this.root!.getDirectoryHandle('chunks');
      const fileHandle = await chunksDir.getFileHandle(chunkId);
      const file = await fileHandle.getFile();
      return await file.arrayBuffer();
    } catch {
      return null;
    }
  }

  async deleteChunk(chunkId: string): Promise<void> {
    if (!this.root) await this.init();
    try {
      const chunksDir = await this.root!.getDirectoryHandle('chunks');
      await chunksDir.removeEntry(chunkId);
    } catch {
      // ignore if not found
    }
  }

  async listChunks(): Promise<string[]> {
    if (!this.root) await this.init();
    try {
      const chunksDir = await this.root!.getDirectoryHandle('chunks');
      const chunks: string[] = [];
      // @ts-ignore - entries() is available in runtime
      for await (const [name] of chunksDir.entries()) {
        chunks.push(name);
      }
      return chunks;
    } catch {
      return [];
    }
  }
}

export const opfsManager = new OPFSManager();