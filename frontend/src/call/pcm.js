export function encodePcm(samples) {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  samples.forEach((sample, i) => {
    const clipped = Math.max(-1, Math.min(1, sample));
    view.setInt16(i * 2, Math.round(clipped * (clipped < 0 ? 32768 : 32767)), true);
  });
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
export function decodePcm(data) {
  const binary = atob(data);
  if (binary.length % 2) throw new Error('Invalid PCM audio');
  const view = new DataView(Uint8Array.from(binary, c => c.charCodeAt(0)).buffer);
  return Float32Array.from({ length: binary.length / 2 }, (_, i) => view.getInt16(i * 2, true) / 32768);
}
