import { useEffect, useRef, useState } from "react";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { speakText, stopSpeech } from "../services/webSpeechService";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const RECOGNITION_POLL_MS = 2500;
const TARGET_LANG = "ml";

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],         // thumb
  [0, 5], [5, 6], [6, 7], [7, 8],         // index
  [5, 9], [9, 10], [10, 11], [11, 12],    // middle
  [9, 13], [13, 14], [14, 15], [15, 16],  // ring
  [13, 17], [17, 18], [18, 19], [19, 20], // pinky
  [0, 17],                                // palm base
];

async function translateToMalayalam(text) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, targetLang: TARGET_LANG }),
    });
    const data = await res.json();
    return data?.success ? data.translatedText : "";
  } catch {
    return "";
  }
}

export default function Interpreter() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(null);
  const handLandmarkerRef = useRef(null);
  const rafIdRef = useRef(null);

  // Tracks real-time presence of hand in live camera frame
  const hasHandsRef = useRef(false);

  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState("");

  const [recognizedText, setRecognizedText] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [isTranslating, setIsTranslating] = useState(false);
  const [translateError, setTranslateError] = useState("");

  // ElevenLabs English voice (backend TTS).
  // Malayalam is DISPLAY ONLY; only the latest English sign label is spoken.
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechError, setSpeechError] = useState(false);
  const latestRecognizedSignRef = useRef("");
  const lastSpokenEnglishRef = useRef("");

  const startCamera = async () => {
    setCameraError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      setCameraOn(true);
    } catch {
      setCameraError("Camera access was denied or is unavailable.");
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    hasHandsRef.current = false;
    setCameraOn(false);
  };

  const captureFrame = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return null;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.7);
  };

  useEffect(() => () => stopCamera(), []);

  // Initialize MediaPipe HandLandmarker safely
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );
        const landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numHands: 2,
        });
        if (!cancelled) handLandmarkerRef.current = landmarker;
      } catch (err) {
        console.warn("HandLandmarker initialized with fallback mode:", err);
      }
    })();

    return () => {
      cancelled = true;
      handLandmarkerRef.current?.close();
    };
  }, []);

  // Live Canvas Hand Skeleton Drawing Loop & Hand Presence Detector
  useEffect(() => {
    if (!cameraOn) {
      hasHandsRef.current = false;
      const ctx = canvasRef.current?.getContext("2d");
      ctx?.clearRect(0, 0, canvasRef.current?.width || 0, canvasRef.current?.height || 0);
      return;
    }

    const drawFrame = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const landmarker = handLandmarkerRef.current;

      if (video && canvas && landmarker && video.videoWidth > 0 && video.videoHeight > 0) {
        const rect = canvas.getBoundingClientRect();
        if (canvas.width !== rect.width || canvas.height !== rect.height) {
          canvas.width = rect.width;
          canvas.height = rect.height;
        }

        try {
          const result = landmarker.detectForVideo(video, performance.now());
          const hands = result.landmarks ?? [];
          hasHandsRef.current = hands.length > 0;

          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const scale = Math.max(
              canvas.width / video.videoWidth,
              canvas.height / video.videoHeight
            );
            const offsetX = (canvas.width - video.videoWidth * scale) / 2;
            const offsetY = (canvas.height - video.videoHeight * scale) / 2;
            const toCanvasX = (x) => x * video.videoWidth * scale + offsetX;
            const toCanvasY = (y) => y * video.videoHeight * scale + offsetY;

            for (const hand of hands) {
              ctx.strokeStyle = "#14B8A6";
              ctx.lineWidth = 2;
              for (const [a, b] of HAND_CONNECTIONS) {
                ctx.beginPath();
                ctx.moveTo(toCanvasX(hand[a].x), toCanvasY(hand[a].y));
                ctx.lineTo(toCanvasX(hand[b].x), toCanvasY(hand[b].y));
                ctx.stroke();
              }
              ctx.fillStyle = "#06B6D4";
              for (const point of hand) {
                ctx.beginPath();
                ctx.arc(toCanvasX(point.x), toCanvasY(point.y), 3, 0, 2 * Math.PI);
                ctx.fill();
              }
            }
          }
        } catch {
          // Ignore transient frames safely
        }
      }

      rafIdRef.current = requestAnimationFrame(drawFrame);
    };

    rafIdRef.current = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(rafIdRef.current);
  }, [cameraOn]);

  // Frame Capture and Recognition Polling Loop — ONLY POLLS WHEN HANDS ARE PRESENT
  useEffect(() => {
    if (!cameraOn) return;

    const interval = setInterval(async () => {
      // STOP recognition requests if no hands are visible in camera feed!
      if (!hasHandsRef.current) return;

      const frame = captureFrame();
      if (!frame) return;

      try {
        const res = await fetch(`${API_BASE_URL}/api/recognize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ frame, hasHand: hasHandsRef.current }),
        });
        if (!res.ok) return;
        const data = await res.json();

        // Only append text if valid gesture text was returned
        if (data?.success && data.data?.text) {
          const newText = data.data.text.trim();
          if (!newText) return;

          // Remember the latest ENGLISH sign label for text-to-speech
          console.log("[RECOGNITION] New sign:", newText);
          latestRecognizedSignRef.current = newText;

          setRecognizedText((prev) => {
            if (!prev) return newText;
            const words = prev.trim().split(" ");
            if (words[words.length - 1] === newText) return prev;
            return `${prev} ${newText}`;
          });
        }
      } catch {
        // Silently skip unreachable frame captures
      }
    }, RECOGNITION_POLL_MS);

    return () => clearInterval(interval);
  }, [cameraOn]);

  // Live Translation Effect (Malayalam)
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!recognizedText.trim()) {
        setTranslatedText("");
        setTranslateError("");
        return;
      }
      setIsTranslating(true);
      setTranslateError("");
      try {
        const translated = await translateToMalayalam(recognizedText);
        if (translated) {
          setTranslatedText(translated);
        } else {
          setTranslateError("Malayalam translation unavailable.");
        }
      } catch {
        setTranslateError("Couldn't reach translation service.");
      } finally {
        setIsTranslating(false);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [recognizedText]);

  // Auto-Speak Effect — speaks ONLY the latest recognized ENGLISH sign.
  // Never speaks translatedText (Malayalam, display only) or the full
  // accumulated recognizedText. recognizedText is a dependency purely so this
  // effect re-runs when a new sign is appended; the sign itself is read from
  // latestRecognizedSignRef. Repeated polls of the same sign are ignored.
  useEffect(() => {
    if (!autoSpeak) return;

    const sign = latestRecognizedSignRef.current.trim();
    if (!sign) return;
    if (sign === lastSpokenEnglishRef.current) return;

    const timer = setTimeout(async () => {
      setIsSpeaking(true);
      setSpeechError(false);
      console.log("[TTS] Speaking English sign:", sign);
      const spoke = await speakText(sign, "en-US");
      // Only mark as spoken if it is still the latest sign (e.g. not cleared
      // or replaced while the audio was being generated).
      if (spoke && latestRecognizedSignRef.current === sign) {
        lastSpokenEnglishRef.current = sign;
      }
      setSpeechError(!spoke);
      setIsSpeaking(false);
    }, 250);

    return () => clearTimeout(timer);
  }, [recognizedText, autoSpeak]);

  // Manual Speak — also speaks ONLY the latest recognized English sign.
  const handleManualSpeak = async () => {
    const sign = latestRecognizedSignRef.current.trim();
    if (!sign) return;

    setIsSpeaking(true);
    setSpeechError(false);
    console.log("[TTS] Speaking English sign:", sign);
    const success = await speakText(sign, "en-US");
    if (success && latestRecognizedSignRef.current === sign) {
      lastSpokenEnglishRef.current = sign;
    }
    setSpeechError(!success);
    setIsSpeaking(false);
  };

  const handleStopSpeech = () => {
    stopSpeech();
    setIsSpeaking(false);
  };

  const handleClear = () => {
    handleStopSpeech();
    setRecognizedText("");
    setTranslatedText("");
    setTranslateError("");
    latestRecognizedSignRef.current = "";
    lastSpokenEnglishRef.current = "";
  };

  const handleCopy = () => {
    const textToCopy = translatedText || recognizedText;
    if (textToCopy.trim()) navigator.clipboard.writeText(textToCopy);
  };

  return (
    <div className="flex flex-wrap gap-6 px-6 md:px-14 py-7 items-start max-w-6xl mx-auto">
      {/* Camera Panel */}
      <div className="flex-1 min-w-[340px] bg-white rounded-[24px] border border-[#E2E8F0] shadow-[0_10px_30px_rgba(15,23,42,0.06)] p-7">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-[17px] text-[#0F172A]">
            Live ISL Camera
          </h3>
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[#64748B]">
            <span
              className={`w-[9px] h-[9px] rounded-full ${
                cameraOn ? "bg-[#14B8A6]" : "bg-[#94A3B8]"
              }`}
            />
            {cameraOn ? "● Camera Active" : "● Waiting for Camera"}
          </div>
        </div>

        <div className="aspect-[4/3] rounded-[20px] bg-[#0F172A] flex items-center justify-center flex-col gap-3 text-[#94A3B8] mb-5 overflow-hidden relative">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${
              cameraOn ? "block" : "hidden"
            }`}
          />
          <canvas
            ref={canvasRef}
            className={`absolute inset-0 w-full h-full ${
              cameraOn ? "block" : "hidden"
            }`}
          />
          {!cameraOn && (
            <>
              <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-2xl">
                📷
              </div>
              <p className="text-[13.5px] text-[#94A3B8] px-6 text-center">
                {cameraError || "Start your camera to begin sign recognition"}
              </p>
            </>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={startCamera}
            disabled={cameraOn}
            className="flex-1 py-3 rounded-full text-[14.5px] font-bold bg-[#14B8A6] text-white disabled:opacity-50 hover:bg-[#0D9488] transition-colors shadow-sm cursor-pointer"
          >
            Start camera
          </button>
          <button
            onClick={stopCamera}
            disabled={!cameraOn}
            className="flex-1 py-3 rounded-full text-[14.5px] font-bold bg-[#F1F5F9] text-[#0F172A] border border-[#E2E8F0] disabled:opacity-50 hover:bg-[#E2E8F0] transition-colors cursor-pointer"
          >
            Stop camera
          </button>
        </div>
        <p className="text-[12.5px] text-[#64748B] mt-4 leading-relaxed">
          Real-time sign recognition active — captured signs are shown in
          Malayalam and each new sign is spoken aloud in English when hands
          are detected.
        </p>
      </div>

      {/* Recognized Sign & Malayalam Translation Panel */}
      <div className="flex-1 min-w-[340px] flex flex-col gap-5">
        <div className="bg-white rounded-[24px] border border-[#E2E8F0] shadow-[0_10px_30px_rgba(15,23,42,0.06)] p-7">
          <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
            <h3 className="font-bold text-[17px] text-[#0F172A]">
              Recognized Sign
            </h3>

            <div className="flex items-center gap-2">
              {isSpeaking ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold bg-[#CCFBF1] text-[#0F766E] border border-[#99F6E4] animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-[#14B8A6] animate-ping" />
                  🔊 Speaking English...
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11.5px] font-medium bg-[#F8FAFC] text-[#64748B] border border-[#E2E8F0]">
                  {speechError ? "Audio unavailable" : "ElevenLabs · English"}
                </span>
              )}
            </div>
          </div>

          <textarea
            value={recognizedText}
            onChange={(e) => setRecognizedText(e.target.value)}
            placeholder="Recognized sign language text will appear here."
            className="w-full min-h-[140px] bg-[#F8FAFC] border border-[#E2E8F0] rounded-[20px] p-5 text-[15px] leading-relaxed text-[#0F172A] resize-none outline-none focus:border-[#14B8A6] transition-all"
          />

          <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
            <div className="flex gap-2 flex-wrap items-center">
              <button
                onClick={handleManualSpeak}
                disabled={!recognizedText.trim() || isSpeaking}
                className="px-4 py-2 rounded-full text-[13.5px] font-bold bg-[#14B8A6] text-white hover:bg-[#0D9488] disabled:opacity-50 transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                🔊 Speak
              </button>

              {isSpeaking && (
                <button
                  onClick={handleStopSpeech}
                  className="px-4 py-2 rounded-full text-[13.5px] font-bold bg-[#FEE2E2] text-[#B91C1C] border border-[#FECACA] hover:bg-[#FECACA] transition-colors cursor-pointer"
                >
                  ⏹ Stop
                </button>
              )}

              <button
                onClick={handleCopy}
                disabled={!(translatedText || recognizedText).trim()}
                className="px-4 py-2 rounded-full text-[13.5px] font-bold bg-white border border-[#E2E8F0] text-[#0F172A] hover:bg-[#F8FAFC] disabled:opacity-50 transition-colors cursor-pointer"
              >
                Copy
              </button>

              <button
                onClick={handleClear}
                disabled={!recognizedText.trim() && !translatedText.trim()}
                className="px-4 py-2 rounded-full text-[13.5px] font-bold bg-white border border-[#E2E8F0] text-[#0F172A] hover:bg-[#F8FAFC] disabled:opacity-50 transition-colors cursor-pointer"
              >
                Clear
              </button>
            </div>

            <button
              onClick={() => setAutoSpeak(!autoSpeak)}
              className={`px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold border transition-all flex items-center gap-1.5 cursor-pointer ${
                autoSpeak
                  ? "bg-[#CCFBF1] text-[#0F766E] border-[#99F6E4]"
                  : "bg-[#F8FAFC] text-[#64748B] border-[#E2E8F0]"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${autoSpeak ? "bg-[#14B8A6]" : "bg-[#94A3B8]"}`} />
              {autoSpeak ? "Auto Voice: ON" : "Auto Voice: OFF"}
            </button>
          </div>
        </div>

        {/* Malayalam Translation Card */}
        <div className="bg-white rounded-[24px] border border-[#E2E8F0] shadow-[0_10px_30px_rgba(15,23,42,0.06)] p-7">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-[17px] text-[#0F172A]">
              Malayalam Translation
            </h3>
            {isTranslating && (
              <span className="text-[12px] font-semibold text-[#06B6D4]">
                Translating…
              </span>
            )}
          </div>

          <div className="bg-[#F0FDFA] border border-[#CCFBF1] rounded-[20px] p-5 min-h-[110px] text-[22px] font-semibold leading-relaxed text-[#0F172A]">
            {translateError ? (
              <span className="text-[#B91C1C] text-[14px] font-medium">{translateError}</span>
            ) : translatedText ? (
              <span lang="ml">{translatedText}</span>
            ) : (
              <span className="text-[#94A3B8] text-[14px] font-normal">
                Malayalam translation of the recognized sign will appear here.
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}