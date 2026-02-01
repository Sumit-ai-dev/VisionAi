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
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        sdp: offerSdp,
        type: "offer"
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Realtime error: ${errorText}`);
  }

  const data = (await response.json()) as { sdp: string };
  return data.sdp;
};
