import type { FeedbackEffect } from './types';

export class HapticTarget {
  isSupported(): boolean {
    return 'vibrate' in navigator;
  }

  async init(): Promise<void> {}

  fire(effect: FeedbackEffect): void {
    if (effect.haptic) navigator.vibrate(effect.haptic);
  }

  dispose(): void {
    navigator.vibrate(0);
  }
}
