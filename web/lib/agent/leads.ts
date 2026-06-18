// Mock lead pool. In the real app this is the Warmleads DB query
// (need-scored businesses, grouped by industry).
export interface Lead {
  name: string;
  industry: string;
  need: string;
}

export const SAMPLE_LEADS: Lead[] = [
  { name: "The Knightsbridge Clinic", industry: "dental", need: "5-star reviews, builder-grade site" },
  { name: "Ruh Dental", industry: "dental", need: "no online booking" },
  { name: "tooth dental care", industry: "dental", need: "weak mobile site" },
  { name: "VitaSmile", industry: "dental", need: "no intake forms" },
  { name: "Knight & Co Solicitors", industry: "law", need: "invisible online" },
  { name: "Marsh Wall Legal", industry: "law", need: "no contact capture" },
  { name: "Holborn Chambers", industry: "law", need: "outdated template site" },
  { name: "Beast", industry: "restaurants", need: "no mobile booking" },
  { name: "Le Bab", industry: "restaurants", need: "menu hard to find" },
  { name: "BiBi", industry: "restaurants", need: "no reservation system" },
];

export function findLeads(industry?: string): Lead[] {
  return industry ? SAMPLE_LEADS.filter((l) => l.industry === industry) : SAMPLE_LEADS;
}

export function industries(): string[] {
  return Array.from(new Set(SAMPLE_LEADS.map((l) => l.industry)));
}
