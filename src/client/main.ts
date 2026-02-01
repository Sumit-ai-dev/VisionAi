const setupRealtime = async () => {
  stateMachine.transition("IDLE_LISTENING", "Initializing session");
  peerConnection = new RTCPeerConnection();
  dataChannel = peerConnection.createDataChannel("events");

  const micStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      sampleRate: 24000
    }
  });
  const audioTracks = micStream.getAudioTracks();
  appendLog(`Audio tracks: ${audioTracks.length}`);
  if (audioTracks.length === 0) {
    throw new Error("Microphone access failed");
  }
  micStream.getTracks().forEach((track) => {
    peerConnection?.addTrack(track, micStream);
  });

  dataChannel.onopen = () => {
    appendLog("Data channel open");
    sendRealtimeEvent({
      type: "session.update",
      session: {
        modalities: ["audio", "text"],
        instructions:
          "You are a voice assistant. Stay silent until asked. When asked to speak, respond concisely.",
        voice: "alloy",
        input_audio_transcription: {
          model: "whisper-1"
        },
        tools: [
          {
            type: "function",
            name: "get_scene_description",
            description: "Analyze an image for hazards and objects.",
            parameters: {
              type: "object",
              properties: {
                image_base64_jpeg: { type: "string" }
              },
              required: ["image_base64_jpeg"]
            }
          }
        ]
      }
    });
  };

  dataChannel.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      const type = message.type as string | undefined;
      appendLog(`Event: ${type || "unknown"}`);

      if (type === "response.audio_transcript.delta") {
        transcriptBuffer += message.delta ?? "";
        handleTranscript(transcriptBuffer, false);
      }
      if (type === "response.audio_transcript.done") {
        transcriptBuffer = message.transcript ?? transcriptBuffer;
        handleTranscript(transcriptBuffer, true);
        transcriptBuffer = "";
      }
      if (type === "response.done") {
        if (stateMachine.state === "SPEAKING") {
          stateMachine.transition("IDLE_LISTENING", "Speech complete");
        }
        if (speechTimeout) {
          window.clearTimeout(speechTimeout);
        }
      }
    } catch (error) {
      appendLog(`Event parse error: ${String(error)}`);
    }
  };

  await new Promise((resolve) => window.setTimeout(resolve, 100));

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  const response = await fetch("/api/realtime/offer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sdp: offer.sdp })
  });
  if (!response.ok) {
    throw new Error("Realtime offer failed");
  }
  const data = await response.json();
  await peerConnection.setRemoteDescription({ type: "answer", sdp: data.sdp });
};
