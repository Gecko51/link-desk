const DEFAULT_STUN = "stun:stun.l.google.com:19302";

// Reads configured STUN servers from env, falls back to Google's public server.
// Multiple servers can be configured comma-separated in VITE_STUN_SERVERS.
export function getIceServers(): RTCIceServer[] {
  const envValue = import.meta.env.VITE_STUN_SERVERS ?? DEFAULT_STUN;
  const urls = envValue
    .split(",")
    .map((u: string) => u.trim())
    .filter(Boolean);
  return urls.length > 0 ? [{ urls }] : [{ urls: [DEFAULT_STUN] }];
}

// Creates RTCConfiguration with ICE servers for peer connection.
export function createPeerConfiguration(): RTCConfiguration {
  return { iceServers: getIceServers() };
}
