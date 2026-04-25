// Waits until RTCPeerConnection.iceGatheringState === "complete".
// Used to implement "wait-for-complete ICE" per DEV-RULES §7 - avoids trickle.
export function waitForIceGatheringComplete(
  pc: RTCPeerConnection,
): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();

  return new Promise((resolve) => {
    const handleChange = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", handleChange);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", handleChange);
  });
}

// Creates a full SDP offer with all ICE candidates embedded.
// DEV-RULES §7: always wait for iceGatheringState === "complete" before sending.
export async function createOfferWithCompleteIce(
  pc: RTCPeerConnection,
): Promise<RTCSessionDescriptionInit> {
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitForIceGatheringComplete(pc);
  const local = pc.localDescription;
  if (!local) throw new Error("localDescription missing after gathering complete");
  return { type: local.type, sdp: local.sdp };
}

// Creates a full SDP answer with all ICE candidates embedded.
// DEV-RULES §7: always wait for iceGatheringState === "complete" before sending.
export async function createAnswerWithCompleteIce(
  pc: RTCPeerConnection,
): Promise<RTCSessionDescriptionInit> {
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await waitForIceGatheringComplete(pc);
  const local = pc.localDescription;
  if (!local) throw new Error("localDescription missing after gathering complete");
  return { type: local.type, sdp: local.sdp };
}
