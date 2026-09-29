import { Contact } from "@/components/sections/Contact";
import { Manifesto } from "@/components/sections/Manifesto";
import { DifferentialsA } from "@/variants/a/DifferentialsA";
import { FaqA } from "@/variants/a/FaqA";
import { HeroA } from "@/variants/a/HeroA";
import { IntroLoader } from "@/variants/a/IntroLoader";
import { ServicesA } from "@/variants/a/ServicesA";
import { StatementA } from "@/variants/a/StatementA";
import { SystemsA } from "@/variants/a/SystemsA";
import { WorkA } from "@/variants/a/WorkA";

/*
  The home page is a composition: each section owns its layout and reads its
  copy from src/data. Surfaces alternate so every chapter reads as a turn:
  black, paper, black, carbon, the manifesto break landing on paper, black,
  fog for the questions, and the carbon call before the footer (mounted by
  SiteChrome).
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
      <WorkA />
      <FaqA />
      <Contact />
    </>
  );
}
