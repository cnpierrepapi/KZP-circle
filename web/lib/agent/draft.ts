import Anthropic from "@anthropic-ai/sdk";
import { Lead } from "./leads";

// Per-industry email drafting. Uses Claude Sonnet when ANTHROPIC_API_KEY is set,
// otherwise falls back to a deterministic template (so the demo runs with no key).
// HARD RULE: no em dashes in the shipped output, regardless of source.

export interface Draft {
  industry: string;
  city: string;
  subject: string;
  body: string;
  model: string; // "claude-sonnet-4-6" or "template (no API key)"
  hasEmDash: boolean; // guard flag; must stay false
}

const SONNET = "claude-sonnet-4-6";

// Replace em dashes (and double-hyphen stand-ins) with comma+space, then tidy.
export function stripEmDashes(s: string): string {
  return s
    .replace(/—/g, ", ")
    .replace(/–/g, ", ")
    .replace(/--/g, ", ")
    .replace(/\s+,/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const FALLBACK_ANGLE: Record<string, string> = {
  dental: "your strong reviews are not matched by your website, and patients cannot book online",
  law: "your firm is respected offline but nearly invisible online",
  restaurants: "guests struggle to see your menu or reserve a table on mobile",
};

export async function draftTemplate(
  industry: string,
  leads: Lead[],
  sender = "Onenept"
): Promise<Draft> {
  const city = leads[0]?.city ?? "Warsaw";
  const sample = leads
    .slice(0, 4)
    .map((l) => `${l.name} (${l.rating} stars, ${l.reviews} reviews): ${l.need}`)
    .join("; ");

  const key = process.env.ANTHROPIC_API_KEY;
  if (key) {
    try {
      const anthropic = new Anthropic({ apiKey: key });
      const msg = await anthropic.messages.create({
        model: SONNET,
        max_tokens: 400,
        system:
          "You write concise B2B cold outreach. Write ONE short email body (under 110 words) to a group of businesses in a single industry and city, offering a fast modern website with online booking and lead capture. Rules: absolutely no em dashes or en dashes anywhere; warm and specific; reference the industry and city naturally; exactly one clear call to action. Return only the email body, no subject line, no preamble.",
        messages: [
          {
            role: "user",
            content: `Industry: ${industry}. City: ${city}, Poland. Example businesses and their gaps: ${sample}. Sender name: ${sender}.`,
          },
        ],
      });
      const text = msg.content
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("")
        .trim();
      const body = stripEmDashes(text);
      return {
        industry,
        city,
        subject: `A quick note about your website`,
        body,
        model: SONNET,
        hasEmDash: body.includes("—") || body.includes("–"),
      };
    } catch {
      // fall through to deterministic template
    }
  }

  const angle = FALLBACK_ANGLE[industry] ?? "your website undersells your business";
  const body = stripEmDashes(
    `Hi ${industry} team in ${city}, I took a look and noticed ${angle}. ` +
      `I build fast, modern websites with online booking and lead capture, usually live in about two weeks. ` +
      `Would a short call this week be worth it? Best, ${sender}`
  );
  return {
    industry,
    city,
    subject: "A quick note about your website",
    body,
    model: "template (no API key)",
    hasEmDash: body.includes("—") || body.includes("–"),
  };
}
