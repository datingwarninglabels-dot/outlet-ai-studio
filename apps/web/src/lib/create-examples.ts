// Concrete example ideas offered on the dashboard first-run panel and as
// fill-in chips on the Create Video form. Kept in a plain module so both a
// server component (dashboard) and a client component (the form) can
// import them without crossing the "use client" boundary either way.
export const EXAMPLE_IDEAS = [
  "A 45-second explainer on why compound interest matters in your 20s, upbeat and encouraging.",
  "A 60-second story about a lighthouse keeper who befriends a storm, calm and cinematic.",
  "A punchy 30-second list of 3 common houseplant mistakes, friendly and direct.",
] as const;
