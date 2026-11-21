// What each destination is like, for the Explore Boston picker.
// Budget is a rough tier for one adult, never an exact price: prices change, so the
// interface labels it as an estimate and tells people to check before they go.
// Keep this file dependency-free.

export const INTERESTS = [
  { id: "history", label: "History" },
  { id: "architecture", label: "Architecture" },
  { id: "outdoors", label: "Outdoors" },
  { id: "waterfront", label: "Waterfront" },
  { id: "campus", label: "Campus life" },
  { id: "sports", label: "Sports" },
] as const;
export type Interest = (typeof INTERESTS)[number]["id"];

/** 0 free to visit · 1 a small admission or donation · 2 a paid tour or ticket */
export type Cost = 0 | 1 | 2;
export const COST_LABEL: Record<Cost, string> = { 0: "Free", 1: "Under $15", 2: "$15 to $30" };

export const DISCOVER: Record<string, { tags: Interest[]; cost: Cost }> = {
  "state-house": { tags: ["history", "architecture"], cost: 0 },
  "park-street-church": { tags: ["history", "architecture"], cost: 0 },
  granary: { tags: ["history", "outdoors"], cost: 0 },
  "kings-chapel": { tags: ["history", "architecture"], cost: 1 },
  "old-south": { tags: ["history"], cost: 1 },
  "old-state-house": { tags: ["history"], cost: 1 },
  "faneuil-hall": { tags: ["history"], cost: 0 },
  "paul-revere-house": { tags: ["history"], cost: 1 },
  "old-north-church": { tags: ["history", "architecture"], cost: 1 },
  "uss-constitution": { tags: ["history", "waterfront"], cost: 0 },
  "bunker-hill": { tags: ["history", "outdoors"], cost: 0 },
  bpl: { tags: ["architecture"], cost: 0 },
  "trinity-church": { tags: ["architecture"], cost: 1 },
  "public-garden": { tags: ["outdoors"], cost: 0 },
  "fenway-park": { tags: ["sports"], cost: 2 },
  "mit-dome": { tags: ["campus", "architecture"], cost: 0 },
  "john-harvard": { tags: ["campus", "history"], cost: 0 },
  "longfellow-bridge": { tags: ["waterfront", "outdoors"], cost: 0 },
  "zakim-bridge": { tags: ["waterfront", "architecture"], cost: 0 },
  "custom-house": { tags: ["architecture", "waterfront"], cost: 0 },
};
