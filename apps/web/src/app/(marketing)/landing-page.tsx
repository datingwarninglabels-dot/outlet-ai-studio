import { CharactersWorlds } from "./sections/characters-worlds";
import { ContentPackage } from "./sections/content-package";
import { Faq } from "./sections/faq";
import { Features } from "./sections/features";
import { FinalCta } from "./sections/final-cta";
import { Hero } from "./sections/hero";
import { OutputFormats } from "./sections/output-formats";
import { Pricing } from "./sections/pricing";
import { Trust } from "./sections/trust";
import { UnifiedStudio } from "./sections/unified-studio";
import { Workflow } from "./sections/workflow";

export function LandingPage() {
  return (
    <>
      <Hero />
      <UnifiedStudio />
      <Workflow />
      <Features />
      <CharactersWorlds />
      <OutputFormats />
      <ContentPackage />
      <Pricing />
      <Trust />
      <Faq />
      <FinalCta />
    </>
  );
}
