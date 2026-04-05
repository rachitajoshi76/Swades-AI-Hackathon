import { env } from "@my-better-t-app/env/server";

interface TranscriptionResult {
  text: string;
  confidence?: number;
}

export async function transcribeAudio(audioBuffer: Buffer): Promise<TranscriptionResult> {
  if (env.TRANSCRIPTION_SERVICE === "openai") {
    return transcribeWithOpenAI(audioBuffer);
  } else {
    return transcribeLocally(audioBuffer);
  }
}

async function transcribeWithOpenAI(audioBuffer: Buffer): Promise<TranscriptionResult> {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not set");
  }

  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const formData = new FormData();
      const blob = new Blob([audioBuffer], { type: "audio/wav" });
      formData.append("file", blob, "audio.wav");
      formData.append("model", "whisper-1");
      formData.append("language", "en");

      const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: formData,
      });

      if (!response.ok) {
        if (response.status === 429) {
          // Rate limited - wait and retry
          const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff
          console.log(`Rate limited, retrying in ${waitTime}ms (attempt ${attempt}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
      }

      const result = (await response.json()) as { text: string };
      return { text: result.text };
    } catch (error) {
      lastError = error as Error;
      if (attempt === maxRetries) {
        break;
      }
      // Wait before retrying for other errors too
      const waitTime = Math.pow(2, attempt) * 1000;
      console.log(`API error, retrying in ${waitTime}ms (attempt ${attempt}/${maxRetries}):`, error);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  throw lastError || new Error("Failed to transcribe after all retries");
}

async function transcribeLocally(audioBuffer: Buffer): Promise<TranscriptionResult> {
  // Enhanced local transcription with more realistic responses
  // This simulates different types of speech for testing
  const responses = [
    "Hello, this is a test recording.",
    "The quick brown fox jumps over the lazy dog.",
    "Thank you for testing the transcription system.",
    "This audio contains speech that would be transcribed here.",
    "Testing one, two, three. Speech recognition is working.",
    "I hope you're enjoying this audio transcription demo.",
    "The system is now processing your voice input.",
    "Please speak clearly for better transcription results.",
    "This is an automated transcription test response.",
    "Your audio has been successfully processed."
  ];

  // Use a combination of buffer length and timestamp for more variation
  const timestamp = Date.now();
  const bufferHash = (audioBuffer.length + timestamp) % responses.length;
  const text = responses[Math.max(0, bufferHash)];

  // Simulate processing delay
  await new Promise(resolve => setTimeout(resolve, 500));

  return { text };
}
