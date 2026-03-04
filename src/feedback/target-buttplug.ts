import type { FeedbackEffect } from './types';

export interface ButtplugDeviceInfo {
  name: string;
  index: number;
  battery: number | null; // 0-1, null if no battery sensor
}

export class ButtplugTarget {
  private client: any = null;
  private connector: any = null;
  private _connected = false;
  private _devices = new Map<number, any>();
  private _stopTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private _DeviceOutput: any = null;

  onStatusChange: ((status: string) => void) | null = null;
  onDevicesChange: ((devices: ButtplugDeviceInfo[]) => void) | null = null;

  isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  async init(): Promise<void> {
    const [{ ButtplugClient, DeviceOutput }, { ButtplugWasmClientConnector }] = await Promise.all([
      import('@satvisorcom/buttplug'),
      import('@satvisorcom/buttplug-wasm'),
    ]);
    this._DeviceOutput = DeviceOutput;
    this.connector = new ButtplugWasmClientConnector();
    this.client = new ButtplugClient('Satvisor');

    this.client.addListener('deviceadded', async (device: any) => {
      this._devices.set(device.index, device);
      this.onDevicesChange?.(await this.getDeviceList());
    });
    this.client.addListener('deviceremoved', async (device: any) => {
      this._devices.delete(device.index);
      this.onDevicesChange?.(await this.getDeviceList());
    });

    await this.client.connect(this.connector);
    this._connected = true;
    this.onStatusChange?.('connected');
  }

  async startScanning(): Promise<void> {
    if (!this.client || !this._connected) return;
    await this.client.startScanning();
  }

  fire(effect: FeedbackEffect): void {
    if (!effect.buttplug || !this._connected || this._devices.size === 0) return;
    const { intensity, durationMs } = effect.buttplug;

    for (const [idx, device] of this._devices) {
      const existing = this._stopTimers.get(idx);
      if (existing) clearTimeout(existing);

      if (intensity <= 0) {
        device.stop().catch(() => {});
      } else {
        device.runOutput(this._DeviceOutput.Vibrate.percent(intensity)).catch(() => {});
        if (durationMs) {
          this._stopTimers.set(idx, setTimeout(() => {
            device.stop().catch(() => {});
            this._stopTimers.delete(idx);
          }, durationMs));
        }
      }
    }
  }

  async getDeviceList(): Promise<ButtplugDeviceInfo[]> {
    const list: ButtplugDeviceInfo[] = [];
    for (const d of this._devices.values()) {
      let battery: number | null = null;
      try {
        if (d.hasInput && d.hasInput('Battery')) {
          battery = await d.battery();
        }
      } catch {}
      list.push({ name: d.name, index: d.index, battery });
    }
    return list;
  }

  async dispose(): Promise<void> {
    for (const timer of this._stopTimers.values()) clearTimeout(timer);
    this._stopTimers.clear();
    if (this.client && this._connected) {
      try { await this.client.stopAllDevices(); } catch {}
      try { await this.client.disconnect(); } catch {}
    }
    this._connected = false;
    this._devices.clear();
    this.client = null;
    this.connector = null;
  }
}
