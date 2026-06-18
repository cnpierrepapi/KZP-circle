// Real Warsaw, Poland businesses, shaped like an Outscraper Google-Maps result
// (the same fields a real Warmleads scrape returns). Names/areas are real; ratings
// and review counts are illustrative for the demo. In production this array is the
// output of an Outscraper query for "<category> in Warsaw" (or a Warmleads DB read).
export interface Lead {
  name: string;
  industry: string; // grouping key the agent drafts per
  category: string; // Outscraper-style label
  city: string;
  area: string;
  rating: number;
  reviews: number;
  website: string;
  need: string;
}

export const SAMPLE_LEADS: Lead[] = [
  // ── Dental ──
  { name: "Dental Fraternity Śródmieście", industry: "dental", category: "Dental clinic", city: "Warsaw", area: "Śródmieście", rating: 4.9, reviews: 1200, website: "https://dentalfraternity.pl", need: "premium implant brand, template site with no online booking" },
  { name: "Warsaw Dental Academy", industry: "dental", category: "Dental clinic", city: "Warsaw", area: "Bemowo", rating: 4.8, reviews: 540, website: "https://warsawdentalacademy.pl", need: "Straumann partner, site does not show the digital tech" },
  { name: "Ochota na uśmiech", industry: "dental", category: "Dental clinic", city: "Warsaw", area: "Ochota", rating: 4.9, reviews: 880, website: "https://ochotanausmiech.pl", need: "two locations, no unified booking" },
  { name: "Dental Centre Molar", industry: "dental", category: "Dental clinic", city: "Warsaw", area: "Śródmieście", rating: 4.7, reviews: 410, website: "https://molar.pl", need: "no English booking flow for expats" },
  { name: "Jesionowa Dental Clinic", industry: "dental", category: "Dental clinic", city: "Warsaw", area: "Mokotów", rating: 4.8, reviews: 360, website: "https://jesionowa.pl", need: "weak mobile experience" },
  { name: "RIKOTA", industry: "dental", category: "Dental clinic", city: "Warsaw", area: "Wola", rating: 4.6, reviews: 600, website: "https://rikota.pl", need: "60 specialists, hard to navigate site" },

  // ── Restaurants ──
  { name: "Bez Gwiazdek", industry: "restaurants", category: "Restaurant", city: "Warsaw", area: "Śródmieście", rating: 4.6, reviews: 950, website: "https://bezgwiazdek.eu", need: "tasting menu, no online reservation" },
  { name: "Beef and Pepper", industry: "restaurants", category: "Steakhouse", city: "Warsaw", area: "Śródmieście", rating: 4.5, reviews: 1300, website: "https://beefandpepper.pl", need: "no mobile menu or booking" },
  { name: "FALLA Warszawa Śródmieście", industry: "restaurants", category: "Vegan restaurant", city: "Warsaw", area: "Śródmieście", rating: 4.7, reviews: 700, website: "https://falla.pl", need: "vegan chain, no online ordering page" },
  { name: "Bar Mleczny Familijny", industry: "restaurants", category: "Polish restaurant", city: "Warsaw", area: "Śródmieście", rating: 4.4, reviews: 500, website: "", need: "iconic milk bar, no website at all" },

  // ── Law ──
  { name: "Woźniak Legal", industry: "law", category: "Law firm", city: "Warsaw", area: "Śródmieście", rating: 4.9, reviews: 90, website: "https://wozniaklegal.com", need: "business firm, thin online presence" },
  { name: "CGO Legal", industry: "law", category: "Law firm", city: "Warsaw", area: "Śródmieście", rating: 4.8, reviews: 120, website: "https://cgolegal.com", need: "no lead capture for international clients" },
  { name: "M. Studniarek i Wspólnicy", industry: "law", category: "Law firm", city: "Warsaw", area: "Śródmieście", rating: 4.7, reviews: 70, website: "https://studniarek.pl", need: "outdated template site" },
];

export function findLeads(industry?: string): Lead[] {
  return industry ? SAMPLE_LEADS.filter((l) => l.industry === industry) : SAMPLE_LEADS;
}

export function industries(): string[] {
  return Array.from(new Set(SAMPLE_LEADS.map((l) => l.industry)));
}
