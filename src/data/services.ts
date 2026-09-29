import type { Service } from "@/lib/types";

/*
  Services, framed as outcomes (brand/DESIGN.md → Voice). No prices on the
  site: the investment comes in the proposal.
  Order here is the order on the page. `status: "soon"` keeps a service in
  the data without showing it.
*/

export const services: Service[] = [
  {
    id: "sites",
    name: "Sites",
    outcome: "Converter a atenção.",
    summary: "Um site estratégico e personalizado, desenhado em torno de uma ação e pronto para receber tráfego.",
    deliverables: [
      "Site estratégico e personalizado",
      "Design responsivo",
      "Desenvolvimento",
      "Estrutura pensada para conversão",
      "Otimização para desktop e mobile",
      "Publicação e configuração inicial",
    ],
    status: "active",
  },
  {
    id: "trafego-pago",
    name: "Gestão de tráfego",
    outcome: "Encontrar o mercado.",
    summary: "Campanhas planejadas por frequência: o público certo vê a mensagem certa quantas vezes for preciso.",
    deliverables: [
      "Estratégia de campanhas",
      "Gestão de Meta Ads",
      "Criação e organização das campanhas",
      "Otimizações",
      "Acompanhamento",
      "Análise de resultados",
    ],
    note: "A verba de anúncios é paga direto às plataformas e não está inclusa na gestão.",
    status: "active",
  },
  {
    id: "sistemas",
    name: "Sistemas de crescimento",
    outcome: "Manter o movimento.",
    summary: "IA, automações, CRM, aplicativos e integrações feitos sob medida para a operação vender mais.",
    deliverables: ["Atendimento & Vendas", "Automação", "Sistemas & CRM", "IA & Dados"],
    href: "#sistemas",
    status: "active",
  },
];

export const activeServices = services.filter((s) => s.status === "active");

export function serviceName(id: Service["id"]): string {
  return services.find((s) => s.id === id)?.name ?? id;
}
