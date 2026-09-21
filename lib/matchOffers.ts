export type Offer = {
  id: string;
  brand: string;
  product_type: string;
  headline: string;
  terms_summary: string | null;
  disclosure_text: string | null;
  destination_url: string;
  payout: number;
  status: string;
  eligible_states: string[];
  min_credit_band: string | null;
  amount_min: number | null;
  amount_max: number | null;
  priority: number;
};

export type Answers = {
  amount_band?: string; // "1000-5000" | "5000-15000" | "15000-35000" | "35000+"
  timeline?: string; // asap | this_week | this_month | just_looking
  state?: string; // not collected in the current flow; filtered only when present
};

export function parseAmountBand(band: string): number | null {
  const nums = band.match(/\d+/g);
  if (!nums) return null;
  const values = nums.map(Number);
  if (band.trim().endsWith("+")) return values[values.length - 1];
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function amountInRange(offer: Offer, amountBand?: string): boolean {
  if (!amountBand) return true;
  if (offer.amount_min == null && offer.amount_max == null) return true;
  const amount = parseAmountBand(amountBand);
  if (amount == null) return true;
  if (offer.amount_min != null && amount < offer.amount_min) return false;
  if (offer.amount_max != null && amount > offer.amount_max) return false;
  return true;
}

export function matchOffers(offers: Offer[], answers: Answers): Offer[] {
  const eligible = offers.filter((offer) => {
    if (offer.status !== "active") return false;

    // State licensing can only be enforced once a state is collected; until
    // then, state-restricted offers are excluded rather than shown blindly.
    if (offer.eligible_states.length > 0) {
      if (!answers.state) return false;
      if (!offer.eligible_states.includes(answers.state)) return false;
    }

    return amountInRange(offer, answers.amount_band);
  });

  // Timeline is captured as a lead-quality signal for the buyer; it is the
  // same for every candidate here, so it cannot affect their relative order.
  eligible.sort((a, b) => b.priority - a.priority || b.payout - a.payout);

  return eligible.slice(0, 3);
}
