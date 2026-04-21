import { Monitor, MousePointer2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

// Two mutually exclusive CTAs that split the home screen (PRD §2 / §4 Module 4).
// Green = share (passive action). Blue = take control (active action).
export function HeroButtons() {
  const navigate = useNavigate();

  return (
    <div className="grid w-full max-w-4xl gap-6 md:grid-cols-2">
      <HeroCta
        onClick={() => navigate("/host")}
        className="bg-primary hover:bg-primary/90 text-primary-foreground"
        icon={<Monitor className="size-12" aria-hidden />}
        title="Partager mon écran"
        subtitle="Obtenez un code à communiquer à la personne qui va vous dépanner."
      />
      <HeroCta
        onClick={() => navigate("/controller")}
        className="bg-secondary hover:bg-secondary/90 text-secondary-foreground"
        icon={<MousePointer2 className="size-12" aria-hidden />}
        title="Prendre le contrôle"
        subtitle="Saisissez le code fourni par la personne que vous allez dépanner."
      />
    </div>
  );
}

interface HeroCtaProps {
  onClick: () => void;
  className: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}

function HeroCta({ onClick, className, icon, title, subtitle }: HeroCtaProps) {
  return (
    <Button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-auto flex-col items-start gap-3 rounded-2xl p-8 text-left whitespace-normal",
        className,
      )}
    >
      <span aria-hidden>{icon}</span>
      <span className="text-2xl font-semibold">{title}</span>
      <span className="text-sm font-normal opacity-90">{subtitle}</span>
    </Button>
  );
}
