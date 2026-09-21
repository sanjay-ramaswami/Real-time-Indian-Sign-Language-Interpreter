// ElevenLabs TTS voice output via the backend /api/tts endpoint.
// The API key stays backend-only; this module only requests audio bytes.

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

let activeAudio = null;
let activeUrl = null;
let activeRequestId = 0;

function cleanupAudio() {
  if (activeAudio) {
    activeAudio.onended = null;
    activeAudio.onerror = null;
    activeAudio.onabort = null;
    activeAudio.pause();
    activeAudio.src = "";
    activeAudio.remove();
    activeAudio = null;
  }
  if (activeUrl) {
    URL.revokeObjectURL(activeUrl);
    activeUrl = null;
  }
}

export function stopSpeech() {
  activeRequestId += 1;
  cleanupAudio();
}

// speakText(text, lang) -> Promise<boolean>.
// lang is accepted for Interpreter.jsx compatibility (the backend voice
// handles the language; ElevenLabs multilingual model covers Malayalam).
export function speakText(text, lang = "ml-IN") {
  void lang;
  return new Promise((resolve) => {
    const cleanText = (text || "").trim();
    if (!cleanText) {
      console.warn("[TTS] Rejected: empty text");
      return resolve(false);
    }

    const requestId = ++activeRequestId;

    if (activeAudio) cleanupAudio();

    console.log("[TTS] Requesting audio");
    fetch(`${API_BASE_URL}/api/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: cleanText }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          console.error("[TTS] Backend error", res.status, errorData?.message || "unknown");
          if (requestId === activeRequestId) resolve(false);
          return null;
        }

        console.log("[TTS] Backend response:", res.status);
        const contentType = res.headers.get("Content-Type") || "";
        if (!contentType.includes("audio")) {
          console.error("[TTS] Unexpected content type:", contentType);
          if (requestId === activeRequestId) resolve(false);
          return null;
        }

        const arrayBuffer = await res.arrayBuffer();
        console.log("[TTS] Audio received:", arrayBuffer.byteLength, "bytes");

        if (requestId !== activeRequestId) return;

        const blob = new Blob([arrayBuffer], { type: contentType });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        activeUrl = url;
        activeAudio = audio;

        let settled = false;

        audio.onended = () => {
          console.log("[TTS] Playback ended");
          if (!settled) {
            settled = true;
            cleanupAudio();
            if (requestId === activeRequestId) resolve(true);
          }
        };
        audio.onerror = () => {
          console.error("[TTS] Playback error");
          if (!settled) {
            settled = true;
            cleanupAudio();
            if (requestId === activeRequestId) resolve(false);
          }
        };
        audio.onabort = () => {
          console.warn("[TTS] Playback aborted");
          if (!settled) {
            settled = true;
            cleanupAudio();
            if (requestId === activeRequestId) resolve(false);
          }
        };

        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              console.log("[TTS] Playback started");
            })
            .catch((err) => {
              console.warn("[TTS] Autoplay blocked:", err?.name || err);
              if (!settled) {
                settled = true;
                cleanupAudio();
                if (requestId === activeRequestId) resolve(false);
              }
            });
        }
      })
      .catch((err) => {
        console.error("[TTS] Playback error", err);
        if (requestId === activeRequestId) resolve(false);
      });
  });
}