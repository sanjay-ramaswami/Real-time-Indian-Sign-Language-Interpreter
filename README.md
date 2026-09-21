# Indian Sign Language Interpreter

> A real-time web-based Indian Sign Language (ISL) interpreter that recognizes hand gestures through a webcam, converts them into text, translates the recognized text into Malayalam, and provides English voice output.

---

## Overview

The **Indian Sign Language Interpreter** is a real-time computer-vision-based application designed to assist communication between Indian Sign Language users and people who may not understand sign language.

The system captures live video from a webcam, detects hand landmarks using **MediaPipe**, processes the extracted features using a trained **ISL sign-recognition model**, and displays the recognized signs as text.

The recognized text is translated into **Malayalam** for display, while the latest recognized English sign can be converted into **spoken English audio** using ElevenLabs Text-to-Speech.

### System Pipeline

```text
Webcam
   │
   ▼
Live Video Frames
   │
   ▼
MediaPipe Hand Landmark Detection
   │
   ▼
Feature Extraction
   │
   ▼
Trained ISL Recognition Model
   │
   ▼
Recognized Sign / English Text
   │
   ├───────────────► Malayalam Translation
   │                         │
   │                         ▼
   │                  Malayalam Display
   │
   └───────────────► English Text-to-Speech
                             │
                             ▼
                       Spoken English