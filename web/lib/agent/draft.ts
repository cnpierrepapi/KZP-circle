// Per-industry email drafting. Deterministic template now, with a clean seam to
// swap in a Claude call later (same signature). HARD RULE: no em dashes in output.

export interface Draft {
  industry: string;
  subject: string;
  body: string;
  hasEmDash: boolean; // guard flag; must always be false in what we ship
}

const ANGLE: Record<string, string> = {
  dental: "your 5-star reviews are not matched by your website, and patients cannot book online",
  law: "your firm looks established offline but is nearly invisible online",
  restaurants: "diners struggle to see your menu or book a table on mobile",
};

// Replace em dashes (and double-hyphen stand-ins) with comma+space, then tidy spacing.
export function stripEmDashes(s: string): string {
  return s
    .replace(/—/g, ", ")
    .replace(/--/g, ", ")
    .replace(/\s+,/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function draftTemplate(industry: string, sender = "Onenept"): Draft {
  const angle = ANGLE[industry] ?? "your website undersells your business";
  const raw =
    `Hi ${industry} team, I took a look and noticed ${angle}. ` +
    `I build fast, modern websites with online booking and lead capture, usually live in about two weeks. ` +
    `Would a short call this week be worth it? Happy to send a 90 second walkthrough first. ` +
    `Best, ${sender}`;
  const body = stripEmDashes(raw);
  return {
    industry,
    subject: "A quick note about your website",
    body,
    hasEmDash: body.includes("—"),
  };
}
