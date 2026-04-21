// A 9-digit PIN formatted as "XXX-XXX-XXX" (see PRD §3 Module 1).
export type Pin = string;

// Lifecycle metadata attached to every generated PIN.
export interface PinSession {
  pin: Pin;
  generatedAt: Date;
  expiresAt: Date;
}

export interface PinRotationConfig {
  // Duration in milliseconds between automatic rotations. Default 30 min.
  rotationIntervalMs: number;
}

export const DEFAULT_PIN_ROTATION_MS = 30 * 60 * 1000; // 30 minutes
