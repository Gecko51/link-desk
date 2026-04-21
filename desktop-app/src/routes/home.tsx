import { HeroButtons } from "@/components/hero-buttons";

// Cold-start landing screen - PRD §7.
// Accessible via Tab (HeroButtons renders focusable <Button> elements).
export function HomeRoute() {
  return (
    <main
      data-testid="home-route"
      className="flex min-h-screen flex-col items-center justify-center gap-12 bg-background p-8"
    >
      <header className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">LinkDesk</h1>
        <p className="mt-2 text-muted-foreground">
          Que souhaitez-vous faire ?
        </p>
      </header>
      <HeroButtons />
    </main>
  );
}
