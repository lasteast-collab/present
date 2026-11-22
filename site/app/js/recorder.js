// Lasteast Present — recording (canvas + microphone + optional system audio) via MediaRecorder
export function pickMime(pref = 'mp4') {
  const list = pref === 'webm' ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'] : ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'];
  if (typeof MediaRecorder === 'undefined') return null;
  return list.find(m => MediaRecorder.isTypeSupported(m)) || '';
}
export class Recorder {
  constructor(canvas, { audio = null, systemAudio = null, fps = 30, bitrate = 8e6, pref = 'mp4' } = {}) {
    this.canvas = canvas; this.fps = fps; this.mime = pickMime(pref); this.chunks = []; this.state = 'inactive'; this.bitrate = bitrate;
    const stream = canvas.captureStream(fps);
    const tracks = [...stream.getVideoTracks()];
    const auds = [audio, systemAudio].filter(Boolean).flatMap(s => s.getAudioTracks());
    if (auds.length > 1) { // mix
      const ac = new AudioContext(), dest = ac.createMediaStreamDestination();
      for (const s of [audio, systemAudio].filter(Boolean)) ac.createMediaStreamSource(s).connect(dest);
      tracks.push(...dest.stream.getAudioTracks()); this.ac = ac;
    } else tracks.push(...auds);
    this.stream = new MediaStream(tracks);
  }
  start() {
    if (this.mime === null) throw new Error('MediaRecorder unsupported');
    this.mr = new MediaRecorder(this.stream, { mimeType: this.mime || undefined, videoBitsPerSecond: this.bitrate });
    this.mr.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.mr.start(500); this.state = 'recording'; this.t0 = performance.now();
  }
  pause() { if (this.mr && this.state === 'recording') { this.mr.pause(); this.state = 'paused'; } }
  resume() { if (this.mr && this.state === 'paused') { this.mr.resume(); this.state = 'recording'; } }
  stop() {
    return new Promise(res => {
      if (!this.mr || this.state === 'inactive') return res(null);
      this.mr.onstop = () => { this.state = 'inactive'; this.ac && this.ac.close(); this.stream.getVideoTracks().forEach(t => t.stop()); res(new Blob(this.chunks, { type: (this.mime || 'video/webm').split(';')[0] })); };
      this.mr.stop();
    });
  }
  get ext() { return (this.mime || '').includes('mp4') ? 'mp4' : 'webm'; }
}
