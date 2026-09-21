import { Router } from "express";
import { getDemoRecognition, recognizeFrame } from "../controllers/recognize.controller.js";

const router = Router();

router.post("/", recognizeFrame);
router.post("/demo", getDemoRecognition);

export default router;
