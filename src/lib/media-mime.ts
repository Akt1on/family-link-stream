// Picks a recorder format the current browser actually supports (iOS Safari records MP4, others WebM).
const VIDEO = ["video/mp4;codecs=avc1,mp4a", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
const AUDIO = ["audio/mp4", "audio/aac", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];

function pick(list: string[]): string | undefined {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return undefined;
  return list.find((t) => { try { return MediaRecorder.isTypeSupported(t); } catch { return false; } });
}

export const pickVideoMime = () => pick(VIDEO);
export const pickAudioMime = () => pick(AUDIO);

/** Builds a correctly typed File from recorded chunks using the recorder's real mime type. */
export function recordedFile(chunks: Blob[], recorderMime: string | undefined, base: string, fallback: string): File {
  const type = (recorderMime || chunks[0]?.type || fallback).split(";")[0];
  const ext = type.includes("mp4") ? (type.startsWith("audio") ? "m4a" : "mp4")
    : type.includes("aac") ? "aac" : type.includes("ogg") ? "ogg" : "webm";
  return new File([new Blob(chunks, { type })], `${base}.${ext}`, { type });
}
