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
  product_type?: string; // personal_loan | credit_card | debt_consolidation | not_sure
  amount_band?: string; // e.g. "1000-5000", "5000-15000", "15000+"
  credit_band?: string; // excellent | good | fair | building | not_sure
  state?: string; // two-letter state code
};

const CREDIT_RANK: Record<string, number> = {
  building: 0,
  fair: 1,
  good: 2,
  excellent: 3,
};

function meetsCreditBand(offerMin: string | null, leadBand?: string): boolean {
  if (!offerMin) return true;
  if (!leadBand || leadBand === "not_sure") return true; // don't over-filter on uncertainty
  const leadRank = CREDIT_RANK[leadBand] ?? 0;
  const offerRank = CREDIT_RANK[offerMin] ?? 0;
  return leadRank >= offerRank;
}

function amountInRange(offer: Offer, amountBand?: string): boolean {
  if (!amountBand || (offer.amount_min == null && offer.amount_max == null)) return true;
  const approxAmount = parseAmountBand(amountBand);
  if (approxAmount == null) return true;
  if (offer.amount_min != null && approxAmount < offer.amount_min) return false;
  if (offer.amount_max != null && approxAmount > offer.amount_max) return false;
  return true;
}

function parseAmountBand(band: string): number | null {
  const match = band.match(/\d+/g);
  if (!match) return null;
  const nums = match.map(Number);
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function matchOffers(offers: Offer[], answers: Answers): Offer[] {
  const eligible = offers.filter((offer) => {
    if (offer.status !== "active") return false;

    const productOk =
      !answers.product_type ||
      answers.product_type === "not_sure" ||
      offer.product_type === answers.product_type;
    if (!productOk) return false;

    const stateOk =
      offer.eligible_states.length === 0 ||
      (!!answers.state && offer.eligible_states.includes(answers.state));
    if (!stateOk) return false;

    if (!meetsCreditBand(offer.min_credit_band, answers.credit_band)) return false;
    if (!amountInRange(offer, answers.amount_band)) return false;

    return true;
  });

  eligible.sort((a, b) => b.priority - a.priority || b.payout - a.payout);

  return eligible.slice(0, 3);
}
