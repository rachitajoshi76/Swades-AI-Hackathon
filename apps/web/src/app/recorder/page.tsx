"use client"

import { useCallback, useRef, useState } from "react"
import { Download, Mic, Pause, Play, Square, Trash2 } from "lucide-react"

import { Button } from "@my-better-t-app/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@my-better-t-app/ui/components/card"
import { LiveWaveform } from "@/components/ui/live-waveform"
import { useRecorder, type WavChunk } from "@/hooks/use-recorder"

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 10)
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${ms}`
}

function formatDuration(seconds: number) {
  return `${seconds.toFixed(1)}s`
}

function ChunkRow({ chunk, index }: { chunk: WavChunk; index: number }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [showTranscript, setShowTranscript] = useState(chunk.transcriptionStatus === 'completed')

  const toggle = () => {
    const el = audioRef.current
    if (!el) return
    if (playing) {
      el.pause()
      el.currentTime = 0
      setPlaying(false)
    } else {
      el.play()
      setPlaying(true)
    }
  }

  const download = () => {
    const a = document.createElement("a")
    a.href = chunk.url
    a.download = `chunk-${index + 1}.wav`
    a.click()
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'stored': return 'text-yellow-600'
      case 'uploading': return 'text-blue-600'
      case 'uploaded': return 'text-green-600'
      case 'acked': return 'text-green-800'
      case 'failed': return 'text-red-600'
      default: return 'text-gray-600'
    }
  }

  const getTranscriptionStatusColor = (status?: string) => {
    switch (status) {
      case 'pending': return 'text-yellow-500'
      case 'processing': return 'text-blue-500'
      case 'completed': return 'text-green-500'
      case 'failed': return 'text-red-500'
      default: return 'text-gray-500'
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-sm border border-border/50 bg-muted/30 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <audio
          ref={audioRef}
          src={chunk.url}
          onEnded={() => setPlaying(false)}
          preload="none"
        />
        <span className="text-xs font-medium text-muted-foreground tabular-nums">
          #{index + 1}
        </span>
        <span className="text-xs tabular-nums">{formatDuration(chunk.duration)}</span>
        <span className={`text-[10px] ${getStatusColor(chunk.status)}`}>{chunk.status}</span>
        {chunk.transcriptionStatus && (
          <span className={`text-[10px] ${getTranscriptionStatusColor(chunk.transcriptionStatus)}`}>
            {chunk.transcriptionStatus}
          </span>
        )}
        <div className="ml-auto flex gap-1">
          <Button variant="ghost" size="icon-xs" onClick={toggle}>
            {playing ? <Square className="size-3" /> : <Play className="size-3" />}
          </Button>
          <Button variant="ghost" size="icon-xs" onClick={download}>
            <Download className="size-3" />
          </Button>
          {chunk.transcript && (
            <Button 
              variant="ghost" 
              size="icon-xs" 
              onClick={() => setShowTranscript(!showTranscript)}
            >
              📝
            </Button>
          )}
        </div>
      </div>
      {showTranscript && chunk.transcript && (
        <div className="mt-2 rounded bg-white p-2 text-xs border border-green-100">
          <p className="font-semibold text-xs mb-1 text-green-700">Transcript:</p>
          <p className="text-gray-700">{chunk.transcript}</p>
        </div>
      )}
    </div>
  )
}

export default function RecorderPage() {
  const [deviceId] = useState<string | undefined>()
  const { 
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
  } = useRecorder({ chunkDuration: 5, deviceId })

  const isRecording = status === "recording"
  const isPaused = status === "paused"
  const isActive = isRecording || isPaused
  const recordingStopped = status === "idle" && chunks.length > 0

  const completedTranscripts = chunks.filter(c => c.transcriptionStatus === 'completed')
  const pendingTranscriptions = chunks.filter(c => c.transcriptionStatus === 'pending' || c.transcriptionStatus === 'processing')
  const allTranscriptText = completedTranscripts.map((c, i) => `[${i + 1}] ${c.transcript}`).join('\n\n')

  const handlePrimary = useCallback(() => {
    if (isActive) {
      stop()
    } else {
      start()
    }
  }, [isActive, stop, start])

  const handleRecover = useCallback(() => {
    recoverFromOPFS()
  }, [recoverFromOPFS])

  const handleRetry = useCallback(() => {
    retryFailedUploads()
  }, [retryFailedUploads])

  const handleFetchTranscripts = useCallback(() => {
    fetchMissingTranscripts()
  }, [fetchMissingTranscripts])

  return (
    <div className="container mx-auto flex max-w-lg flex-col items-center gap-6 px-4 py-8">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Recorder</CardTitle>
          <CardDescription>16 kHz / 16-bit PCM WAV — chunked every 5 s</CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-6">
          {/* Waveform */}
          <div className="overflow-hidden rounded-sm border border-border/50 bg-muted/20 text-foreground">
            <LiveWaveform
              active={isRecording}
              processing={isPaused}
              stream={stream}
              height={80}
              barWidth={3}
              barGap={1}
              barRadius={2}
              sensitivity={1.8}
              smoothingTimeConstant={0.85}
              fadeEdges
              fadeWidth={32}
              mode="static"
            />
          </div>

          {/* Timer */}
          <div className="text-center font-mono text-3xl tabular-nums tracking-tight">
            {formatTime(elapsed)}
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-3">
            {/* Record / Stop */}
            <Button
              size="lg"
              variant={isActive ? "destructive" : "default"}
              className="gap-2 px-5"
              onClick={handlePrimary}
              disabled={status === "requesting"}
            >
              {isActive ? (
                <>
                  <Square className="size-4" />
                  Stop
                </>
              ) : (
                <>
                  <Mic className="size-4" />
                  {status === "requesting" ? "Requesting..." : "Record"}
                </>
              )}
            </Button>

            {/* Pause / Resume */}
            {isActive && (
              <Button
                size="lg"
                variant="outline"
                className="gap-2"
                onClick={isPaused ? resume : pause}
              >
                {isPaused ? (
                  <>
                    <Play className="size-4" />
                    Resume
                  </>
                ) : (
                  <>
                    <Pause className="size-4" />
                    Pause
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Chunks */}
      {chunks.length > 0 && (
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Chunks</CardTitle>
            <CardDescription>{chunks.length} recorded</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {chunks.map((chunk, i) => (
              <ChunkRow key={chunk.id} chunk={chunk} index={i} />
            ))}
            <div className="mt-2 flex gap-2 self-end">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={handleRecover}
              >
                Recover from OPFS
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={handleRetry}
              >
                Retry Failed
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={handleFetchTranscripts}
              >
                Fetch Missing Transcripts
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-destructive"
                onClick={clearChunks}
              >
                <Trash2 className="size-3" />
                Clear all
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transcript Summary - Shows after recording stops */}
      {recordingStopped && completedTranscripts.length > 0 && (
        <Card className="w-full border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle>📝 Full Transcript</CardTitle>
            <CardDescription>
              {completedTranscripts.length} of {chunks.length} chunks transcribed
              {pendingTranscriptions.length > 0 && ` • ${pendingTranscriptions.length} processing...`}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="rounded bg-white p-4 font-mono text-sm leading-relaxed max-h-96 overflow-y-auto border border-green-100">
              {allTranscriptText || "Waiting for transcripts..."}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const element = document.createElement("a")
                  element.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(allTranscriptText))
                  element.setAttribute("download", `transcript-${Date.now()}.txt`)
                  element.style.display = "none"
                  document.body.appendChild(element)
                  element.click()
                  document.body.removeChild(element)
                }}
              >
                💾 Download
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigator.clipboard.writeText(allTranscriptText)}
              >
                📋 Copy
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transcription In Progress */}
      {pendingTranscriptions.length > 0 && (
        <Card className="w-full border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle>🔄 Transcribing...</CardTitle>
            <CardDescription>
              {pendingTranscriptions.length} chunk{pendingTranscriptions.length !== 1 ? 's' : ''} being transcribed
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              {pendingTranscriptions.map((chunk, idx) => (
                <div key={chunk.id} className="flex items-center gap-2 text-sm">
                  <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                  <span>Chunk {chunks.indexOf(chunk) + 1} ({chunk.transcriptionStatus})</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
