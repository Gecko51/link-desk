import { Button } from "@/components/ui/button";
import { useAppState } from "@/app-state";

// Affiché côté hôte une fois le canal P2P ouvert (status.kind === "connected").
// Phase 4 ajoutera le stream vidéo et la capture d'inputs.
export function HostSessionRoute() {
  const { session } = useAppState();
  return (
    <main
      data-testid="host-session-route"
      className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-8"
    >
      <h1 className="text-2xl font-semibold">Votre écran est partagé</h1>
      <p className="text-sm text-muted-foreground">
        Canal P2P ouvert avec le contrôleur. Phase 4 ajoutera le stream vidéo.
      </p>
      <Button
        onClick={() =>
          session.sendMessage("hello from host " + String(Date.now()))
        }
      >
        Envoyer un hello
      </Button>
      {session.lastMessage && (
        <p className="text-sm">Reçu : {session.lastMessage}</p>
      )}
      <Button variant="destructive" onClick={session.endSession}>
        Terminer la session
      </Button>
    </main>
  );
}
