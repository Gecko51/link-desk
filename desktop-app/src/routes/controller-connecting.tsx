import { RotateCw } from "lucide-react";
import { useAppState } from "@/app-state";

// Affiché côté contrôleur pendant le handshake WebRTC (requesting → negotiating).
// L'utilisateur attend que l'hôte accepte la demande de connexion.
export function ControllerConnectingRoute() {
  const { session } = useAppState();
  return (
    <main
      data-testid="controller-connecting-route"
      className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-8"
    >
      <RotateCw className="size-12 animate-spin text-primary" aria-hidden />
      <h1 className="text-2xl font-semibold">Connexion en cours…</h1>
      <p className="text-sm text-muted-foreground">
        En attente du consentement de l&apos;hôte.
      </p>
      <p className="text-xs text-muted-foreground">État : {session.status.kind}</p>
    </main>
  );
}
