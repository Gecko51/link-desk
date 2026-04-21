import { handleRegister, handleUpdatePin } from "@/features/register/register-handler";
import { SessionManager } from "@/websocket/session-manager";
import type { WebSocket } from "ws";

function mockSocket() {
  const sent: string[] = [];
  return {
    sent,
    close: () => undefined,
    send: (data: string) => {
      sent.push(data);
    },
  } as unknown as WebSocket & { sent: string[] };
}

const machineA = "550e8400-e29b-41d4-a716-446655440000";

describe("handleRegister", () => {
  it("registers and sends a registered ack", () => {
    const manager = new SessionManager();
    const socket = mockSocket();
    handleRegister(
      {
        type: "register",
        machine_id: machineA,
        pin: "111-222-333",
        pin_expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
      { manager, socket },
    );

    expect(manager.findByMachineId(machineA)).toBeDefined();
    const ack = JSON.parse((socket as { sent: string[] }).sent[0]);
    expect(ack).toEqual({ type: "registered", machine_id: machineA });
  });
});

describe("handleUpdatePin", () => {
  it("updates the pin and acks", () => {
    const manager = new SessionManager();
    const socket = mockSocket();
    handleRegister(
      {
        type: "register",
        machine_id: machineA,
        pin: "111-222-333",
        pin_expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
      { manager, socket },
    );
    (socket as { sent: string[] }).sent.length = 0;

    handleUpdatePin(
      {
        type: "update_pin",
        machine_id: machineA,
        new_pin: "999-888-777",
        new_expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
      { manager, socket },
    );

    expect(manager.findByPin("111-222-333")).toBeUndefined();
    expect(manager.findByPin("999-888-777")?.machineId).toBe(machineA);
    const ack = JSON.parse((socket as { sent: string[] }).sent[0]);
    expect(ack).toEqual({ type: "pin_updated" });
  });

  it("ignores update_pin for an unknown machine_id", () => {
    const manager = new SessionManager();
    const socket = mockSocket();
    handleUpdatePin(
      {
        type: "update_pin",
        machine_id: machineA,
        new_pin: "999-888-777",
        new_expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
      { manager, socket },
    );

    // No error sent; just silently drops. (An unknown machine shouldn't be updating PINs.)
    expect(manager.count()).toBe(0);
  });
});
