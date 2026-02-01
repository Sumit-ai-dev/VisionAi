import { OPENAI_API_KEY, REALTIME_MODEL } from "./config";

export const createRealtimeAnswer = async (offerSdp: string) => {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is missing");
  }

  const response = await fetch(
    `https://api.openai.com/v1/realtime?model=${REALTIME_MODEL}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/sdp"
      },
      body: offerSdp
    }
  );

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`Realtime error: ${responseText}`);
  }

  try {
    const parsed = JSON.parse(responseText) as { sdp?: string };
    if (parsed.sdp) {
      return parsed.sdp;
    }
  } catch {
    // non-JSON SDP response
  }

  return responseText;
};
