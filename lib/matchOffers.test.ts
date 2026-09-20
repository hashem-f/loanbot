import { describe, expect, it } from "vitest";
import { matchOffers, type Offer } from "./matchOffers";

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

describe("matchOffers", () => {
  it("excludes paused offers", () => {
    const offers = [makeOffer({ status: "paused" })];
    expect(matchOffers(offers, {})).toHaveLength(0);
  });

  it("filters by product type unless the lead said not_sure", () => {
    const offers = [
      makeOffer({ id: "loan", product_type: "personal_loan" }),
      makeOffer({ id: "card", product_type: "credit_card" }),
    ];
    expect(matchOffers(offers, { product_type: "credit_card" }).map((o) => o.id)).toEqual([
      "card",
    ]);
    expect(matchOffers(offers, { product_type: "not_sure" })).toHaveLength(2);
  });

  it("excludes a lead from a state the offer doesn't serve", () => {
    const offers = [makeOffer({ eligible_states: ["CA", "NY"] })];
    expect(matchOffers(offers, { state: "TX" })).toHaveLength(0);
    expect(matchOffers(offers, { state: "CA" })).toHaveLength(1);
  });

  it("requires the lead's credit band to meet the offer's minimum", () => {
    const offers = [makeOffer({ min_credit_band: "good" })];
    expect(matchOffers(offers, { credit_band: "building" })).toHaveLength(0);
    expect(matchOffers(offers, { credit_band: "excellent" })).toHaveLength(1);
    // Uncertainty shouldn't over-filter.
    expect(matchOffers(offers, { credit_band: "not_sure" })).toHaveLength(1);
  });

  it("keeps amount within the offer's min/max range", () => {
    const offers = [makeOffer({ amount_min: 5000, amount_max: 15000 })];
    expect(matchOffers(offers, { amount_band: "1000-5000" })).toHaveLength(0);
    expect(matchOffers(offers, { amount_band: "5000-15000" })).toHaveLength(1);
  });

  it("returns at most the top 3 by priority then payout", () => {
    const offers = [
      makeOffer({ id: "a", priority: 1 }),
      makeOffer({ id: "b", priority: 5 }),
      makeOffer({ id: "c", priority: 3 }),
      makeOffer({ id: "d", priority: 10 }),
    ];
    const result = matchOffers(offers, {});
    expect(result.map((o) => o.id)).toEqual(["d", "b", "c"]);
  });

  it("returns an empty list instead of throwing when nothing qualifies", () => {
    const offers = [makeOffer({ eligible_states: ["WY"] })];
    expect(matchOffers(offers, { state: "CA" })).toEqual([]);
  });
});
