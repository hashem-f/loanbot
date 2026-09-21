import { describe, expect, it } from "vitest";
import { matchOffers, parseAmountBand, type Offer } from "./matchOffers";

function makeOffer(overrides: Partial<Offer>): Offer {
  return {
    id: "id",
    brand: "Brand",
    product_type: "personal_loan",
    headline: "Headline",
    terms_summary: null,
    disclosure_text: null,
    destination_url: "https://example.com",
    payout: 10,
    status: "active",
    eligible_states: [],
    min_credit_band: null,
    amount_min: null,
    amount_max: null,
    priority: 0,
    ...overrides,
  };
}

describe("parseAmountBand", () => {
  it("averages a range", () => {
    expect(parseAmountBand("5000-15000")).toBe(10000);
  });

  it("treats a trailing + as the floor, not an average", () => {
    expect(parseAmountBand("35000+")).toBe(35000);
  });

  it("returns null for unparseable input", () => {
    expect(parseAmountBand("not sure")).toBeNull();
  });
});

describe("matchOffers", () => {
  it("excludes paused offers", () => {
    expect(matchOffers([makeOffer({ status: "paused" })], {})).toHaveLength(0);
  });

  it("keeps amount within the offer's range", () => {
    const offers = [makeOffer({ amount_min: 5000, amount_max: 15000 })];
    expect(matchOffers(offers, { amount_band: "1000-5000" })).toHaveLength(0);
    expect(matchOffers(offers, { amount_band: "5000-15000" })).toHaveLength(1);
  });

  it("excludes an offer whose ceiling is below a 35000+ request", () => {
    const offers = [makeOffer({ amount_min: 1000, amount_max: 35000 })];
    expect(matchOffers(offers, { amount_band: "35000+" })).toHaveLength(1);
    const lower = [makeOffer({ amount_min: 1000, amount_max: 20000 })];
    expect(matchOffers(lower, { amount_band: "35000+" })).toHaveLength(0);
  });

  it("does not filter on amount when the offer has no range", () => {
    const offers = [makeOffer({ amount_min: null, amount_max: null })];
    expect(matchOffers(offers, { amount_band: "35000+" })).toHaveLength(1);
  });

  it("withholds state-restricted offers while no state is collected", () => {
    const offers = [makeOffer({ eligible_states: ["CA", "NY"] })];
    expect(matchOffers(offers, {})).toHaveLength(0);
    expect(matchOffers(offers, { state: "CA" })).toHaveLength(1);
    expect(matchOffers(offers, { state: "TX" })).toHaveLength(0);
  });

  it("timeline never changes eligibility", () => {
    const offers = [makeOffer({})];
    expect(matchOffers(offers, { timeline: "just_looking" })).toHaveLength(1);
    expect(matchOffers(offers, { timeline: "asap" })).toHaveLength(1);
  });

  it("returns at most 3, ranked by priority then payout", () => {
    const offers = [
      makeOffer({ id: "a", priority: 1 }),
      makeOffer({ id: "b", priority: 5, payout: 1 }),
      makeOffer({ id: "c", priority: 5, payout: 99 }),
      makeOffer({ id: "d", priority: 10 }),
    ];
    expect(matchOffers(offers, {}).map((o) => o.id)).toEqual(["d", "c", "b"]);
  });

  it("returns an empty list rather than throwing when nothing qualifies", () => {
    expect(matchOffers([makeOffer({ eligible_states: ["WY"] })], {})).toEqual([]);
  });
});
