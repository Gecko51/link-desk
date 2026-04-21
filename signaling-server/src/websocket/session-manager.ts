import type { WebSocket } from "ws";
import type { ActiveClient } from "@/types/client";

interface RegisterInput {
  machineId: string;
  socket: WebSocket;
  pin: string;
  pinExpiresAt: Date;
}

// In-memory registry of connected clients.
// Keeps two indexes for O(1) lookup: by machine_id AND by current PIN.
// Phase 2: data is lost on server restart (acceptable per PRD §5 "éphémère").
export class SessionManager {
  private readonly byMachineId = new Map<string, ActiveClient>();
  private readonly byPin = new Map<string, string>(); // pin → machineId

  register(input: RegisterInput): ActiveClient {
    // If the same machine_id is already connected, close the old socket first.
    const existing = this.byMachineId.get(input.machineId);
    if (existing) {
      try {
        existing.socket.close();
      } catch {
        // Ignore close errors - the socket may already be half-closed.
      }
      if (existing.currentPin) this.byPin.delete(existing.currentPin);
    }

    const client: ActiveClient = {
      machineId: input.machineId,
      socketId: crypto.randomUUID(),
      socket: input.socket,
      connectedAt: new Date(),
      currentPin: input.pin,
      pinExpiresAt: input.pinExpiresAt,
      lastPingAt: new Date(),
    };
    this.byMachineId.set(input.machineId, client);
    this.byPin.set(input.pin, input.machineId);
    return client;
  }

  // Updates the PIN of an already-registered client and refreshes the PIN index.
  // Does nothing if the machine is not currently registered.
  updatePin(machineId: string, newPin: string, newExpiresAt?: Date): void {
    const client = this.byMachineId.get(machineId);
    if (!client) return;

    if (client.currentPin) this.byPin.delete(client.currentPin);
    this.byPin.set(newPin, machineId);
    client.currentPin = newPin;
    if (newExpiresAt) client.pinExpiresAt = newExpiresAt;
  }

  // Touches the heartbeat timestamp. Used by the ping handler.
  touch(machineId: string, at: Date = new Date()): void {
    const client = this.byMachineId.get(machineId);
    if (client) client.lastPingAt = at;
  }

  // Removes the client from both indexes. Does NOT close the socket -
  // the caller is expected to handle that (normally via the socket's onClose event).
  remove(machineId: string): void {
    const client = this.byMachineId.get(machineId);
    if (!client) return;
    if (client.currentPin) this.byPin.delete(client.currentPin);
    this.byMachineId.delete(machineId);
  }

  findByMachineId(machineId: string): ActiveClient | undefined {
    return this.byMachineId.get(machineId);
  }

  findByPin(pin: string): ActiveClient | undefined {
    const machineId = this.byPin.get(pin);
    return machineId ? this.byMachineId.get(machineId) : undefined;
  }

  count(): number {
    return this.byMachineId.size;
  }
}
