import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppState } from "@/app-state";

// Affiché côté contrôleur une fois le canal P2P ouvert (status.kind === "connected").
// Phase 4 ajoutera le stream vidéo et l'injection d'inputs.
export function ControllerSessionRoute() {
  const { session } = useAppState();
  const [input, setInput] = useState("");

  return (
    <main
      data-testid="controller-session-route"
      className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-8"
    >
      <h1 className="text-2xl font-semibold">Session active</h1>
      <p className="text-sm text-muted-foreground">
        Canal P2P ouvert avec l&apos;hôte. Phase 4 ajoutera la vidéo et le contrôle.
      </p>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Message"
          className="w-64"
        />
        <Button
          onClick={() => {
            session.sendMessage(input);
            setInput("");
          }}
        >
          Envoyer
        </Button>
      </div>
      {session.lastMessage && (
        <p className="text-sm">Reçu : {session.lastMessage}</p>
      )}
      <Button variant="destructive" onClick={session.endSession}>
        Couper
      </Button>
    </main>
  );
}
