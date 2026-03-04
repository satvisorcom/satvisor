import type { FeedbackEffect } from './types';

export class AudioTarget {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  // Sustained dynamic oscillator (servo motor whine)
  private dynOsc: OscillatorNode | null = null;
  private dynGain: GainNode | null = null;
  private dynFilter: BiquadFilterNode | null = null;
  private dynTeardown: ReturnType<typeof setTimeout> | null = null;

  isSupported(): boolean {
    return typeof AudioContext !== 'undefined';
  }

  async init(): Promise<void> {
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.5;
    this.masterGain.connect(this.ctx.destination);
  }

  fire(effect: FeedbackEffect): void {
    if (!effect.audio || !this.ctx || !this.masterGain) return;
    // Resume context if suspended (autoplay policy)
    if (this.ctx.state === 'suspended') this.ctx.resume();

    const a = effect.audio;
    const now = this.ctx.currentTime;
    const dur = a.duration ?? 0.05;
    const vol = a.volume ?? 0.2;

    switch (a.type) {
      case 'click':
        this.playNoise(now, dur, vol);
        break;
      case 'tone':
      case 'blip':
        this.playTone(now, a.freq ?? 440, a.freq ?? 440, a.type === 'blip' ? dur * 0.5 : dur, vol);
        break;
      case 'sweep':
      case 'chirp':
        this.playTone(now, a.freq ?? 440, a.freqEnd ?? 880, dur, vol);
        break;
    }
  }

  private playTone(now: number, startFreq: number, endFreq: number, dur: number, vol: number): void {
    const osc = this.ctx!.createOscillator();
    const gain = this.ctx!.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, now);
    if (startFreq !== endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, now + dur);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(gain).connect(this.masterGain!);
    osc.start(now);
    osc.stop(now + dur + 0.01);
  }

  private playNoise(now: number, dur: number, vol: number): void {
    const bufSize = Math.ceil(this.ctx!.sampleRate * dur);
    const buf = this.ctx!.createBuffer(1, bufSize, this.ctx!.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.2));
    const src = this.ctx!.createBufferSource();
    src.buffer = buf;
    const gain = this.ctx!.createGain();
    gain.gain.setValueAtTime(vol, now);
    src.connect(gain).connect(this.masterGain!);
    src.start(now);
  }

  /** Start/update/stop a sustained tone. intensity 0 = fade out, >0 = ramp pitch+volume. */
  setDynamic(intensity: number): void {
    if (!this.ctx || !this.masterGain) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    const now = this.ctx.currentTime;
    const ramp = 0.08; // smooth ramp time

    if (intensity <= 0) {
      if (this.dynGain) {
        this.dynGain.gain.setTargetAtTime(0, now, 0.05);
        // Tear down oscillator after fade completes
        if (!this.dynTeardown) {
          this.dynTeardown = setTimeout(() => { this.stopDynamic(); this.dynTeardown = null; }, 300);
        }
      }
      return;
    }

    // Cancel pending teardown if reactivating
    if (this.dynTeardown) { clearTimeout(this.dynTeardown); this.dynTeardown = null; }

    // Create oscillator on first call
    if (!this.dynOsc) {
      this.dynOsc = this.ctx.createOscillator();
      this.dynOsc.type = 'triangle';
      this.dynOsc.frequency.value = 60;

      this.dynFilter = this.ctx.createBiquadFilter();
      this.dynFilter.type = 'lowpass';
      this.dynFilter.frequency.value = 300;
      this.dynFilter.Q.value = 0.5;

      this.dynGain = this.ctx.createGain();
      this.dynGain.gain.value = 0;

      this.dynOsc.connect(this.dynFilter).connect(this.dynGain).connect(this.masterGain);
      this.dynOsc.start();
    }

    // Map intensity 0..1 → freq 50..250 Hz, volume 0.02..0.10, filter 150..500
    const freq = 50 + intensity * 200;
    const vol = 0.02 + intensity * 0.08;
    const cutoff = 150 + intensity * 350;

    this.dynOsc.frequency.setTargetAtTime(freq, now, ramp);
    this.dynGain!.gain.setTargetAtTime(vol, now, ramp);
    this.dynFilter!.frequency.setTargetAtTime(cutoff, now, ramp);
  }

  private stopDynamic(): void {
    if (this.dynOsc) {
      this.dynOsc.stop();
      this.dynOsc.disconnect();
      this.dynOsc = null;
    }
    if (this.dynFilter) { this.dynFilter.disconnect(); this.dynFilter = null; }
    if (this.dynGain) { this.dynGain.disconnect(); this.dynGain = null; }
  }

  setVolume(v: number): void {
    if (this.masterGain) this.masterGain.gain.value = Math.max(0, Math.min(1, v));
  }

  dispose(): void {
    this.stopDynamic();
    this.ctx?.close();
    this.ctx = null;
    this.masterGain = null;
  }
}
