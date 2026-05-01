import { Button } from "@/components/ui/button";
import { useAppState } from "@/app-state";

export function ControllerSessionRoute() {
  const { session } = useAppState();
  return (
    <main
      data-testid="controller-session-route"
      className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-8"
    >
      <h1 className="text-2xl font-semibold">Session active</h1>
      <p className="text-sm text-muted-foreground">
        Connexion P2P établie — Phase 4 en cours d&apos;implémentation.
      </p>
      <Button variant="destructive" onClick={session.endSession}>
        Couper
      </Button>
    </main>
  );
}
