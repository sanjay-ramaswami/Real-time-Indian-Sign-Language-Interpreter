const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "";
const ELEVENLABS_MODEL_ID =
  process.env.ELEVENLABS_MODEL_ID || "eleven_turbo_v2_5";
const ELEVENLABS_LANGUAGE_CODE = process.env.ELEVENLABS_LANGUAGE_CODE || "en";

export const PREMADE_VOICES = [
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah (Female - Reassuring)", gender: "female" },
  { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice (Female - Clear Educator)", gender: "female" },
  { id: "hpp4J3VqNfWAUOO0d1Us", name: "Bella (Female - Professional)", gender: "female" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam (Male - Firm)", gender: "male" },
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George (Male - Warm)", gender: "male" },
  { id: "CwhRBWXzGAHq8TQ4Fs17", name: "Roger (Male - Casual)", gender: "male" },
];

export const getVoices = (req, res) => {
  return res.status(200).json({
    success: true,
    voices: PREMADE_VOICES,
  });
};

export const generateSpeech = async (req, res) => {
  const { text, voiceId } = req.body;

  if (!text || typeof text !== "string" || !text.trim()) {
    return res.status(400).json({
      success: false,
      message: "text parameter is required",
    });
  }

  if (!ELEVENLABS_API_KEY || !ELEVENLABS_API_KEY.startsWith("sk_")) {
    return res.status(500).json({
      success: false,
      message:
        "ELEVENLABS_API_KEY is not configured on the backend. Add it to backend/.env (it must start with 'sk_').",
    });
  }

  const selectedVoiceId = voiceId || ELEVENLABS_VOICE_ID || "EXAVITQu4vr4xnSDxMaL";

  try {
    const elevenLabsUrl = `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}`;

    const response = await fetch(elevenLabsUrl, {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: text.trim(),
        model_id: ELEVENLABS_MODEL_ID,
        language_code: ELEVENLABS_LANGUAGE_CODE,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message =
        errorData?.detail?.message ||
        errorData?.error?.message ||
        "ElevenLabs speech generation failed.";
      return res.status(502).json({
        success: false,
        message: `ElevenLabs error: ${message}`,
      });
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.set({
      "Content-Type": "audio/mpeg",
      "Content-Length": buffer.length,
      "Cache-Control": "public, max-age=3600",
    });

    return res.send(buffer);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal server error during speech synthesis.",
    });
  }
};