import { useCallback, useEffect, useRef, useState } from "react"
import { opfsManager } from "@/lib/opfs"
import { env } from "@my-better-t-app/env/web"

const SAMPLE_RATE = 16000
const BUFFER_SIZE = 4096

export interface WavChunk {
  id: string
  chunkId: string
  blob: Blob
  url: string
  duration: number
  timestamp: number
  status: 'stored' | 'uploading' | 'uploaded' | 'acked' | 'failed'
  transcriptionStatus?: 'pending' | 'processing' | 'completed' | 'failed'
  transcript?: string
}

export type RecorderStatus = "idle" | "requesting" | "recording" | "paused"

interface UseRecorderOptions {
  chunkDuration?: number
  deviceId?: string
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i))
    }
  }

  writeStr(0, "RIFF")
  view.setUint32(4, 36 + samples.length * 2, true)
  writeStr(8, "WAVE")
  writeStr(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, "data")
  view.setUint32(40, samples.length * 2, true)

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }

  return new Blob([buffer], { type: "audio/wav" })
}

function resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input
  const ratio = fromRate / toRate
  const length = Math.round(input.length / ratio)
  const output = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    const srcIndex = i * ratio
    const low = Math.floor(srcIndex)
    const high = Math.min(low + 1, input.length - 1)
    const frac = srcIndex - low
    output[i] = input[low] * (1 - frac) + input[high] * frac
  }
  return output
}

export function useRecorder(options: UseRecorderOptions = {}) {
  const { chunkDuration = 5, deviceId } = options

  const [status, setStatus] = useState<RecorderStatus>("idle")
  const [chunks, setChunks] = useState<WavChunk[]>([])
  const [elapsed, setElapsed] = useState(0)
  const [stream, setStream] = useState<MediaStream | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const samplesRef = useRef<Float32Array[]>([])
  const sampleCountRef = useRef(0)
  const chunkThreshold = SAMPLE_RATE * chunkDuration
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef(0)
  const pausedElapsedRef = useRef(0)
  const statusRef = useRef<RecorderStatus>("idle")

  statusRef.current = status

  const uploadChunk = useCallback(async (chunk: WavChunk) => {
    setChunks((prev) => prev.map(c => c.id === chunk.id ? { ...c, status: 'uploading' } : c))

    try {
      console.log('Uploading chunk:', chunk.chunkId)
      console.log('Server URL:', env.NEXT_PUBLIC_SERVER_URL)

      const data = await chunk.blob.arrayBuffer()
      const bytes = new Uint8Array(data)
      
      // Convert to base64 without spreading (prevents stack overflow)
      let binaryString = ''
      const chunkSize = 8192
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binaryString += String.fromCharCode.apply(null, Array.from(bytes.slice(i, i + chunkSize)))
      }
      const base64 = btoa(binaryString)

      const url = `${env.NEXT_PUBLIC_SERVER_URL}/api/chunks/upload`
      console.log('Fetch URL:', url)

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chunkId: chunk.chunkId, data: base64 }),
      })

      console.log('Response status:', response.status)

      if (response.ok) {
        const result = await response.json()
        console.log('Upload success:', result)
        setChunks((prev) => prev.map(c => c.id === chunk.id ? { ...c, status: 'acked' } : c))
        // Clear from OPFS after successful ack
        await opfsManager.deleteChunk(chunk.chunkId)
        // Start polling for transcription
        pollTranscription(chunk.chunkId)
      } else {
        const errorText = await response.text()
        throw new Error(`Upload failed with status ${response.status}: ${errorText}`)
      }
    } catch (error) {
      console.error('Upload failed:', error, error instanceof Error ? error.stack : '')
      setChunks((prev) => prev.map(c => c.id === chunk.id ? { ...c, status: 'failed' } : c))
    }
  }, [])

  const pollTranscription = useCallback((chunkId: string) => {
    const maxAttempts = 120 // 2 minutes with 1s intervals
    let attempts = 0

    const poll = async () => {
      try {
        const response = await fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/chunks/${chunkId}`)
        if (!response.ok) {
          console.warn(`Failed to fetch chunk ${chunkId}:`, response.status)
          return
        }

        const data = await response.json()
        console.log(`Chunk ${chunkId} poll result:`, data.transcriptionStatus, data.transcript)
        
        setChunks((prev) => prev.map(c => c.chunkId === chunkId ? {
          ...c,
          transcriptionStatus: data.transcriptionStatus,
          transcript: data.transcript,
        } : c))

        if (data.transcriptionStatus !== 'processing' && data.transcriptionStatus !== 'pending') {
          console.log(`Transcription complete for ${chunkId}`)
          return
        }

        attempts++
        if (attempts < maxAttempts) {
          setTimeout(poll, 1000)
        }
      } catch (error) {
        console.error(`Failed to poll transcription for ${chunkId}:`, error)
      }
    }

    console.log(`Starting transcription poll for ${chunkId}`)
    poll()
  }, [])

  const flushChunk = useCallback(async () => {
    if (samplesRef.current.length === 0) return

    const totalLen = samplesRef.current.reduce((n, b) => n + b.length, 0)
    const merged = new Float32Array(totalLen)
    let offset = 0
    for (const buf of samplesRef.current) {
      merged.set(buf, offset)
      offset += buf.length
    }
    samplesRef.current = []
    sampleCountRef.current = 0

    const blob = encodeWav(merged, SAMPLE_RATE)
    const url = URL.createObjectURL(blob)
    const chunkId = crypto.randomUUID()
    const chunk: WavChunk = {
      id: crypto.randomUUID(),
      chunkId,
      blob,
      url,
      duration: merged.length / SAMPLE_RATE,
      timestamp: Date.now(),
      status: 'stored',
      transcriptionStatus: 'pending',
      transcript: undefined,
    }

    // Store in OPFS
    try {
      await opfsManager.storeChunk(chunkId, await blob.arrayBuffer())
    } catch (error) {
      console.error('Failed to store chunk in OPFS:', error)
      chunk.status = 'failed'
    }

    setChunks((prev) => [...prev, chunk])

    // Attempt to upload
    uploadChunk(chunk)
  }, [])

  const start = useCallback(async () => {
    if (statusRef.current === "recording") return

    setStatus("requesting")
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId
          ? { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true }
          : { echoCancellation: true, noiseSuppression: true },
      })

      const audioCtx = new AudioContext()
      const source = audioCtx.createMediaStreamSource(mediaStream)
      const processor = audioCtx.createScriptProcessor(BUFFER_SIZE, 1, 1)
      const nativeSampleRate = audioCtx.sampleRate

      processor.onaudioprocess = (e) => {
        if (statusRef.current !== "recording") return

        const input = e.inputBuffer.getChannelData(0)
        const resampled = resample(new Float32Array(input), nativeSampleRate, SAMPLE_RATE)

        samplesRef.current.push(resampled)
        sampleCountRef.current += resampled.length

        if (sampleCountRef.current >= chunkThreshold) {
          // flush synchronously from the collected buffers
          const totalLen = samplesRef.current.reduce((n, b) => n + b.length, 0)
          const merged = new Float32Array(totalLen)
          let off = 0
          for (const buf of samplesRef.current) {
            merged.set(buf, off)
            off += buf.length
          }
          samplesRef.current = []
          sampleCountRef.current = 0

          const blob = encodeWav(merged, SAMPLE_RATE)
          const url = URL.createObjectURL(blob)
          const chunkId = crypto.randomUUID()
          const chunk: WavChunk = {
            id: crypto.randomUUID(),
            chunkId,
            blob,
            url,
            duration: merged.length / SAMPLE_RATE,
            timestamp: Date.now(),
            status: 'stored',
            transcriptionStatus: 'pending',
            transcript: undefined,
          }
          setChunks((prev) => [...prev, chunk])
        }
      }

      source.connect(processor)
      processor.connect(audioCtx.destination)

      streamRef.current = mediaStream
      audioCtxRef.current = audioCtx
      processorRef.current = processor
      setStream(mediaStream)

      samplesRef.current = []
      sampleCountRef.current = 0
      pausedElapsedRef.current = 0
      startTimeRef.current = Date.now()
      setElapsed(0)
      setStatus("recording")

      timerRef.current = setInterval(() => {
        if (statusRef.current === "recording") {
          setElapsed(
            pausedElapsedRef.current + (Date.now() - startTimeRef.current) / 1000
          )
        }
      }, 100)
    } catch {
      setStatus("idle")
    }
  }, [deviceId, chunkThreshold])

  const stop = useCallback(() => {
    flushChunk()

    processorRef.current?.disconnect()
    streamRef.current?.getTracks().forEach((t) => t.stop())
    if (audioCtxRef.current?.state !== "closed") {
      audioCtxRef.current?.close()
    }
    if (timerRef.current) clearInterval(timerRef.current)

    processorRef.current = null
    audioCtxRef.current = null
    streamRef.current = null
    setStream(null)
    setStatus("idle")
  }, [flushChunk])

  const pause = useCallback(() => {
    if (statusRef.current !== "recording") return
    pausedElapsedRef.current += (Date.now() - startTimeRef.current) / 1000
    setStatus("paused")
  }, [])

  const resume = useCallback(() => {
    if (statusRef.current !== "paused") return
    startTimeRef.current = Date.now()
    setStatus("recording")
  }, [])

  const retryFailedUploads = useCallback(async () => {
    const failedChunks = chunks.filter(c => c.status === 'failed')
    for (const chunk of failedChunks) {
      await uploadChunk(chunk)
    }
  }, [chunks, uploadChunk])

  const fetchMissingTranscripts = useCallback(async () => {
    const ackedChunks = chunks.filter(c => c.status === 'acked' && !c.transcript)
    for (const chunk of ackedChunks) {
      pollTranscription(chunk.chunkId)
    }
  }, [chunks, pollTranscription])

  const clearChunks = useCallback(() => {
    for (const c of chunks) URL.revokeObjectURL(c.url)
    setChunks([])
  }, [chunks])

  const recoverFromOPFS = useCallback(async () => {
    const storedChunkIds = await opfsManager.listChunks()
    for (const chunkId of storedChunkIds) {
      const data = await opfsManager.getChunk(chunkId)
      if (data) {
        const blob = new Blob([data], { type: 'audio/wav' })
        const url = URL.createObjectURL(blob)
        const chunk: WavChunk = {
          id: crypto.randomUUID(),
          chunkId,
          blob,
          url,
          duration: 0, // unknown
          timestamp: Date.now(),
          status: 'stored',
        }
        setChunks((prev) => [...prev, chunk])
        await uploadChunk(chunk)
      }
    }
  }, [uploadChunk])

  // Initialize OPFS on mount
  useEffect(() => {
    opfsManager.init().catch(console.error)
  }, [])

  return { 
    status, 
    start, 
    stop, 
    pause, 
    resume, 
    chunks, 
    elapsed, 
    stream, 
    clearChunks,
    retryFailedUploads,
    recoverFromOPFS,
    fetchMissingTranscripts
  }
}
