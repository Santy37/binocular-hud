// Web Bluetooth BLE manager for ESP32 GATT connection

import type { PinPayload, TelemetrySnapshot } from "./payloadTypes";

// Custom 128-bit UUIDs (must match ESP32 firmware)
const SERVICE_UUID        = "4c494e4b-4855-4400-b000-000000000000"; // "LINK-HUD"
const TELEMETRY_CHAR_UUID = "4c494e4b-4855-4400-b000-000000000001"; // notify
const PIN_CHAR_UUID       = "4c494e4b-4855-4400-b000-000000000002"; // notify
const ACK_CHAR_UUID       = "4c494e4b-4855-4400-b000-000000000003"; // write

export type BleConnectionState = "disconnected" | "connecting" | "connected" | "error";

export type BleEventMap = {
  connectionChange: BleConnectionState;
  telemetry: TelemetrySnapshot;
  pinPayload: PinPayload;
  error: string;
  moduleWarning: { module: string; status: string };
};

type Listener<K extends keyof BleEventMap> = (data: BleEventMap[K]) => void;

/**
 * Singleton-style BLE manager.
 *
 * Usage:
 *   const ble = new BleManager();
 *   ble.on("pinPayload", (pin) => { ... });
 *   await ble.connect();
 */
export class BleManager {
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private service: BluetoothRemoteGATTService | null = null;

  private telemetryChar: BluetoothRemoteGATTCharacteristic | null = null;
  private pinChar: BluetoothRemoteGATTCharacteristic | null = null;
  private ackChar: BluetoothRemoteGATTCharacteristic | null = null;

  private _state: BleConnectionState = "disconnected";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private listeners: { [K in keyof BleEventMap]?: Set<Listener<K>> } = {};

  // Public API

  get state() {
    return this._state;
  }

  /** Returns true if Web Bluetooth is available (Chrome/Edge on Android). */
  static isSupported(): boolean {
    return typeof navigator !== "undefined" && "bluetooth" in navigator;
  }

  /** Prompt the user to pick the ESP32, then subscribe to characteristics. */
  async connect(): Promise<void> {
    if (!BleManager.isSupported()) {
      this.setState("error");
      this.emit("error", "Web Bluetooth not supported on this browser.");
      return;
    }

    try {
      this.setState("connecting");

      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [SERVICE_UUID] }],
        optionalServices: [SERVICE_UUID],
      });

      this.device.addEventListener("gattserverdisconnected", () => {
        this.handleDisconnect();
      });

      this.server = await this.device.gatt!.connect();
      this.service = await this.server.getPrimaryService(SERVICE_UUID);

      // Subscribe to telemetry stream
      this.telemetryChar = await this.service.getCharacteristic(TELEMETRY_CHAR_UUID);
      await this.telemetryChar.startNotifications();
      this.telemetryChar.addEventListener(
        "characteristicvaluechanged",
        this.onTelemetry,
      );

      // Subscribe to pin payloads
      this.pinChar = await this.service.getCharacteristic(PIN_CHAR_UUID);
      await this.pinChar.startNotifications();
      this.pinChar.addEventListener(
        "characteristicvaluechanged",
        this.onPinPayload,
      );

      // Get writable ACK characteristic
      this.ackChar = await this.service.getCharacteristic(ACK_CHAR_UUID);

      this.setState("connected");
    } catch (err) {
      console.error("[BLE] connect failed:", err);
      this.setState("error");
      this.emit("error", String(err));
    }
  }

  /** Gracefully disconnect. */
  disconnect(): void {
    if (this.server?.connected) {
      this.server.disconnect();
    }
    this.cleanup();
    this.setState("disconnected");
  }

  /** Send ACK back to ESP32 so it can remove the pin from its local queue. */
  async sendAck(pinId: string): Promise<void> {
    if (!this.ackChar) {
      console.warn("[BLE] ACK char not available");
      return;
    }
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify({ ack: true, pinId }));
    await this.ackChar.writeValue(data);
  }

  // Event emitter

  on<K extends keyof BleEventMap>(event: K, fn: Listener<K>): () => void {
    if (!this.listeners[event]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.listeners as any)[event] = new Set();
    }
    this.listeners[event]!.add(fn);
    return () => {
      this.listeners[event]?.delete(fn);
    };
  }

  private emit<K extends keyof BleEventMap>(event: K, data: BleEventMap[K]) {
    this.listeners[event]?.forEach((fn) => fn(data));
  }

  // Internal handlers

  private setState(s: BleConnectionState) {
    this._state = s;
    this.emit("connectionChange", s);
  }

  private handleDisconnect = () => {
    this.cleanup();
    this.setState("disconnected");
  };

  /** Decode a DataView into a UTF-8 string → parse JSON. */
  private decode(dv: DataView): unknown {
    const decoder = new TextDecoder();
    return JSON.parse(decoder.decode(dv.buffer));
  }

  private onTelemetry = (ev: Event) => {
    try {
      const char = ev.target as BluetoothRemoteGATTCharacteristic;
      const snap = this.decode(char.value!) as TelemetrySnapshot;
      this.emit("telemetry", snap);

      // Check module health & warn
      if (snap.modules) {
        for (const [mod, status] of Object.entries(snap.modules)) {
          if (status !== "ok") {
            this.emit("moduleWarning", { module: mod, status });
          }
        }
      }
    } catch (e) {
      console.error("[BLE] telemetry parse error:", e);
    }
  };

  private onPinPayload = (ev: Event) => {
    try {
      const char = ev.target as BluetoothRemoteGATTCharacteristic;
      const pin = this.decode(char.value!) as PinPayload;
      // Stamp receive time on the phone side
      pin.receivedAt = Date.now();
      this.emit("pinPayload", pin);
    } catch (e) {
      console.error("[BLE] pin parse error:", e);
    }
  };

  private cleanup() {
    this.telemetryChar?.removeEventListener(
      "characteristicvaluechanged",
      this.onTelemetry,
    );
    this.pinChar?.removeEventListener(
      "characteristicvaluechanged",
      this.onPinPayload,
    );
    this.telemetryChar = null;
    this.pinChar = null;
    this.ackChar = null;
    this.service = null;
    this.server = null;
  }
}

/** Singleton instance for the whole app. */
export const bleManager = new BleManager();
