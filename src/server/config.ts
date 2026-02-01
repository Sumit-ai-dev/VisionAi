import dotenv from "dotenv";

dotenv.config();

export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
export const REALTIME_MODEL = "gpt-4o-realtime-preview";
export const VISION_MODEL = "gpt-4o";
