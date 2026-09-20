export type Question = {
  key: string;
  prompt: string;
  options: { value: string; label: string }[];
};

// v0 uses this fixed list. This is the exact seam to swap for an LLM-driven
// question generator later — everything else (the API, the answers table,
// the resume-by-step logic) stays the same.
export const QUESTIONS: Question[] = [
  {
    key: "product_type",
    prompt: "What are you looking for?",
    options: [
      { value: "personal_loan", label: "Personal loan" },
      { value: "credit_card", label: "Credit card" },
      { value: "debt_consolidation", label: "Debt consolidation" },
      { value: "not_sure", label: "Not sure yet" },
    ],
  },
  {
    key: "amount_band",
    prompt: "How much are you looking to borrow?",
    options: [
      { value: "1000-5000", label: "$1,000 - $5,000" },
      { value: "5000-15000", label: "$5,000 - $15,000" },
      { value: "15000-35000", label: "$15,000 - $35,000" },
      { value: "not_applicable", label: "Not applicable" },
    ],
  },
  {
    key: "credit_band",
    prompt: "How would you describe your credit?",
    options: [
      { value: "excellent", label: "Excellent" },
      { value: "good", label: "Good" },
      { value: "fair", label: "Fair" },
      { value: "building", label: "Building / limited history" },
      { value: "not_sure", label: "Not sure" },
    ],
  },
  {
    key: "state",
    prompt: "What state do you live in?",
    options: [
      { value: "CA", label: "California" },
      { value: "TX", label: "Texas" },
      { value: "NY", label: "New York" },
      { value: "FL", label: "Florida" },
      { value: "OTHER", label: "Other" },
    ],
  },
];

export const QUESTION_KEYS = QUESTIONS.map((q) => q.key);
