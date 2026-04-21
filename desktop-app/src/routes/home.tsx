import { HeroButtons } from "@/components/hero-buttons";
import { StatusBadge } from "@/components/status-badge";
import { useAppState } from "@/app-state";

// Cold-start landing screen - PRD §7.
// Accessible via Tab (HeroButtons renders focusable <Button> elements).
export function HomeRoute() {
  const { signaling } = useAppState();
  return (
    <main
      data-testid="home-route"
      className="flex min-h-screen flex-col items-center justify-center gap-12 bg-background p-8"
    >
      <header className="text-center">
        <div className="flex justify-center">
          <StatusBadge state={signaling.connection} />
        </div>
        <h1 className="mt-3 text-4xl font-bold tracking-tight">LinkDesk</h1>
        <p className="mt-2 text-muted-foreground">Que souhaitez-vous faire ?</p>
      </header>
      <HeroButtons />
    </main>
  );
}
