import dotenv from "dotenv";

dotenv.config();

export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
export const REALTIME_MODEL = "gpt-4o-realtime-preview-2024-10-01";
export const VISION_MODEL = "gpt-4o";
