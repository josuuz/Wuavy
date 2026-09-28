import { Contact } from "@/components/sections/Contact";
import { Manifesto } from "@/components/sections/Manifesto";
import { DifferentialsA } from "@/variants/a/DifferentialsA";
import { FaqA } from "@/variants/a/FaqA";
import { HeroA } from "@/variants/a/HeroA";
import { IntroLoader } from "@/variants/a/IntroLoader";
import { ServicesA } from "@/variants/a/ServicesA";
import { StatementA } from "@/variants/a/StatementA";
import { SystemsA } from "@/variants/a/SystemsA";

/*
  The home page is a composition: each section owns its layout and reads its
  copy from src/data. Surfaces alternate so every chapter reads as a turn:
  black, paper, black, carbon, the manifesto break landing on paper, fog for
  the questions, and the carbon call before the footer (mounted by
  SiteChrome).
  Projects (WorkA, chapter 05 between Differentials and FAQ) are off until
  the real cases are in src/data/cases.ts; the FAQ and Contact chapter
  numbers move back up by one when it returns.
*/
export default function Home() {
  return (
    <>
      <IntroLoader />
      <HeroA />
      <StatementA />
      <ServicesA />
      <SystemsA />
      <Manifesto lines={["Crescer", "é sair do", "lugar."]} fit={5.3} />
      <DifferentialsA />
      <FaqA />
      <Contact />
    </>
  );
}
