// Packet arrival proves transport activity; positive energy proves non-silent samples.
export function audioSnapshot(report, previous) {
  const elapsed = report.totalSamplesDuration - (previous?.totalSamplesDuration ?? report.totalSamplesDuration);
  const energy = Math.max(0, (report.totalAudioEnergy || 0) - (previous?.totalAudioEnergy ?? report.totalAudioEnergy ?? 0));
  const level = Number.isFinite(report.audioLevel) ? report.audioLevel : elapsed > 0 ? Math.sqrt(energy / elapsed) : 0;
  return {
    level: Math.min(1, Math.max(0, level)),
    sound: level > 0.005 || energy > 0.000001,
    packets: report.packetsReceived || 0,
    receiving: Boolean(previous && report.packetsReceived > (previous.packetsReceived || 0)),
  };
}
