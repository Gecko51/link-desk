import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PinInput } from "@/components/pin-input";
import { formatPin } from "@/features/pin/pin-generator";

// Controller view — PIN entry screen.
// Phase 1: handleConnect is a no-op that echoes the PIN in a toast.
// Phase 3 will wire this to the signaling + WebRTC handshake.
export function ControllerRoute() {
  const [pin, setPin] = useState("");

  // The button is active only when exactly 9 digits have been entered.
  const complete = pin.length === 9 && /^\d{9}$/.test(pin);

  function handleConnect() {
    if (!complete) return;
    // Simulated connection — real networking lands in Phase 3.
    toast.success("Code saisi", {
      description: `Connexion simulée avec ${formatPin(pin)} (réseau en Phase 3).`,
    });
  }

  return (
    <main
      data-testid="controller-route"
      className="flex min-h-screen items-center justify-center bg-background p-8"
    >
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Saisissez le code</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Entrez les 9 chiffres communiqués par la personne que vous allez
            dépanner.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-6">
          {/* onComplete is intentionally a no-op here — handleConnect handles submission. */}
          <PinInput
            value={pin}
            onChange={setPin}
            onComplete={() => undefined}
          />
          <Button
            size="lg"
            onClick={handleConnect}
            disabled={!complete}
            className="min-w-48"
          >
            Se connecter
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
