import { SessionManager } from "@/websocket/session-manager";
import type { WebSocket } from "ws";

// Minimal WebSocket stub - only `close()` is called by the manager.
function mockSocket(): WebSocket {
  return { close: () => undefined } as unknown as WebSocket;
}

describe("SessionManager", () => {
  let manager: SessionManager;
  const machineA = "550e8400-e29b-41d4-a716-446655440000";
  const machineB = "550e8400-e29b-41d4-a716-446655440001";
  const pinA = "111-222-333";
  const pinB = "444-555-666";

  beforeEach(() => {
    manager = new SessionManager();
  });

  it("registers a new client", () => {
    const socket = mockSocket();
    const client = manager.register({
      machineId: machineA,
      socket,
      pin: pinA,
      pinExpiresAt: new Date(Date.now() + 60_000),
    });
    expect(client.machineId).toBe(machineA);
    expect(client.currentPin).toBe(pinA);
    expect(manager.findByMachineId(machineA)).toBe(client);
    expect(manager.findByPin(pinA)).toBe(client);
  });

  it("closes and replaces the previous socket when the same machine_id re-registers", () => {
    let closed = false;
    const socketOld = { close: () => { closed = true; } } as unknown as WebSocket;
    manager.register({
      machineId: machineA,
      socket: socketOld,
      pin: pinA,
      pinExpiresAt: new Date(Date.now() + 60_000),
    });

    const socketNew = mockSocket();
    manager.register({
      machineId: machineA,
      socket: socketNew,
      pin: "999-888-777",
      pinExpiresAt: new Date(Date.now() + 60_000),
    });

    expect(closed).toBe(true);
    expect(manager.findByMachineId(machineA)?.socket).toBe(socketNew);
    // Old PIN is no longer indexed.
    expect(manager.findByPin(pinA)).toBeUndefined();
  });

  it("updates a PIN and keeps the PIN index consistent", () => {
    manager.register({
      machineId: machineA,
      socket: mockSocket(),
      pin: pinA,
      pinExpiresAt: new Date(Date.now() + 60_000),
    });

    manager.updatePin(machineA, "new-pin-bad"); // Invalid-format PINs are caller's concern;
                                                // manager just stores the string.
    manager.updatePin(machineA, pinB, new Date(Date.now() + 60_000));

    expect(manager.findByPin(pinA)).toBeUndefined();
    expect(manager.findByPin("new-pin-bad")).toBeUndefined(); // Overwritten by pinB
    expect(manager.findByPin(pinB)?.machineId).toBe(machineA);
  });

  it("removes a client and cleans indexes", () => {
    manager.register({
      machineId: machineA,
      socket: mockSocket(),
      pin: pinA,
      pinExpiresAt: new Date(Date.now() + 60_000),
    });
    manager.remove(machineA);
    expect(manager.findByMachineId(machineA)).toBeUndefined();
    expect(manager.findByPin(pinA)).toBeUndefined();
  });

  it("counts active clients", () => {
    expect(manager.count()).toBe(0);
    manager.register({
      machineId: machineA,
      socket: mockSocket(),
      pin: pinA,
      pinExpiresAt: new Date(Date.now() + 60_000),
    });
    manager.register({
      machineId: machineB,
      socket: mockSocket(),
      pin: pinB,
      pinExpiresAt: new Date(Date.now() + 60_000),
    });
    expect(manager.count()).toBe(2);
  });

  it("touch() updates lastPingAt", () => {
    manager.register({
      machineId: machineA,
      socket: mockSocket(),
      pin: pinA,
      pinExpiresAt: new Date(Date.now() + 60_000),
    });
    const before = manager.findByMachineId(machineA)!.lastPingAt;
    const later = new Date(before.getTime() + 1000);
    manager.touch(machineA, later);
    expect(manager.findByMachineId(machineA)?.lastPingAt).toEqual(later);
  });
});
