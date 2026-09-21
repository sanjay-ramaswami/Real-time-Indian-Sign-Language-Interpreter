// Sign Language Recognition Controller
// Forwards frames to Python ML service (MediaPipe + RandomForest).
// Handles "no hand detected" gracefully so it stays silent when hands stop!

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:5001";

const DEMO_SIGNS = [
  { text: "HELLO", confidence: 0.94 },
  { text: "How are you?", confidence: 0.95 },
  { text: "I am fine", confidence: 0.93 },
  { text: "THANK YOU", confidence: 0.91 },
  { text: "PLEASE", confidence: 0.89 },
  { text: "GOOD", confidence: 0.90 },
  { text: "Understand", confidence: 0.88 },
  { text: "YES", confidence: 0.97 },
];

let demoIndex = 0;

// POST /api/recognize/demo
export const getDemoRecognition = (req, res) => {
  const pick = DEMO_SIGNS[Math.floor(Math.random() * DEMO_SIGNS.length)];

  res.status(200).json({
    success: true,
    data: {
      text: pick.text,
      confidence: pick.confidence,
      timestamp: Date.now(),
    },
    demo: true,
  });
};

// POST /api/recognize { frame: "data:image/jpeg;base64,..." }
export const recognizeFrame = async (req, res) => {
  const { frame, hasHand } = req.body;

  if (!frame) {
    return res.status(400).json({ success: false, message: "frame is required" });
  }

  // If frontend explicitly reports no hands in frame, return null immediately
  if (hasHand === false) {
    return res.status(200).json({
      success: true,
      data: null,
      message: "No hand detected in frame",
    });
  }

  // 1. Call Python ML Service (app.py running on port 5001/6000)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1200);

    const response = await fetch(`${ML_SERVICE_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frame }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      // Respect Python ML service returning data: null when no hands detected
      return res.status(200).json(data);
    }
  } catch (error) {
    // ML Service offline fallback
  }

  // 2. Fallback only when hands are active
  const pick = DEMO_SIGNS[demoIndex % DEMO_SIGNS.length];
  demoIndex++;

  return res.status(200).json({
    success: true,
    data: {
      text: pick.text,
      confidence: pick.confidence,
      timestamp: Date.now(),
    },
    fallback: true,
  });
};