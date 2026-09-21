export type Option = { value: string; label: string };

export type Step =
  | { key: "amount"; type: "choice"; prompt: string; options: Option[] }
  | { key: "timeline"; type: "choice"; prompt: string; options: Option[] }
  | { key: "email"; type: "email"; prompt: string }
  | { key: "scrub"; type: "gate" }
  | { key: "consent"; type: "consent" }
  | { key: "offer"; type: "terminal" };

export type StepKey = Step["key"] | "done" | "rejected";

// The whole flow. Reordering it is editing this array — there is no other
// place that encodes what comes next.
export const STEPS: Step[] = [
  {
    key: "amount",
    type: "choice",
    prompt: "How much are you looking for?",
    options: [
      { value: "1000-5000", label: "$1,000 – $5,000" },
      { value: "5000-15000", label: "$5,000 – $15,000" },
      { value: "15000-35000", label: "$15,000 – $35,000" },
      { value: "35000+", label: "More than $35,000" },
    ],
  },
  {
    key: "timeline",
    type: "choice",
    prompt: "How soon do you need it?",
    options: [
      { value: "asap", label: "As soon as possible" },
      { value: "this_week", label: "This week" },
      { value: "this_month", label: "This month" },
      { value: "just_looking", label: "Just looking for now" },
    ],
  },
  {
    key: "email",
    type: "email",
    prompt: "What's the best email to send your offers to?",
  },
  { key: "scrub", type: "gate" },
  { key: "consent", type: "consent" },
  { key: "offer", type: "terminal" },
];

export const FIRST_STEP: StepKey = "amount";

export function getStep(key: string): Step | undefined {
  return STEPS.find((s) => s.key === key);
}

export function nextStepKey(key: string): StepKey {
  const i = STEPS.findIndex((s) => s.key === key);
  if (i === -1 || i === STEPS.length - 1) return "done";
  return STEPS[i + 1].key;
}

// Accepts a tapped option value, or free text loosely matching a label.
export function resolveChoice(step: Step, raw: string): string | null {
  if (step.type !== "choice") return null;
  const input = raw.trim().toLowerCase();
  const exact = step.options.find((o) => o.value.toLowerCase() === input);
  if (exact) return exact.value;
  const byLabel = step.options.find(
    (o) => o.label.toLowerCase() === input || o.label.toLowerCase().includes(input)
  );
  return byLabel ? byLabel.value : null;
}

export function isValidEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw.trim());
}
