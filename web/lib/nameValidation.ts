// web/lib/nameValidation.ts

/** Returns an error message if the name fails format rules, otherwise null. */
export function validateNameFormat(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < 2) return "Name must be at least 2 characters";
  if (trimmed.length > 30) return "Name must be 30 characters or fewer";
  if (!/^[a-zA-Z0-9 \-'.]+$/.test(trimmed)) return "Only letters, numbers, spaces, - ' . are allowed";
  return null;
}

// Server-side only — not imported in client components
export const PROFANITY_LIST: readonly string[] = [
  "ass", "asshole", "bastard", "bitch", "bollocks", "bullshit",
  "cock", "coon", "crap", "cunt", "damn", "dick", "dildo",
  "dyke", "fag", "faggot", "fuck", "fucker", "fucking",
  "homo", "jackass", "jerk", "kike", "motherfucker",
  "nigga", "nigger", "piss", "prick", "pussy", "retard",
  "shit", "shithead", "slut", "spic", "twat", "wank", "wanker",
  "whore", "chink", "gook", "wetback", "tranny", "trannies",
  "rape", "rapist", "nazi", "hitler", "pedophile", "pedo",
  "nonce", "spunk", "cum", "cumshot", "anus", "rectum",
];

// Pre-compiled for performance — rebuilt once at module load
const PROFANITY_REGEX = new RegExp(
  `\\b(${PROFANITY_LIST.join("|")})\\b`,
  "i"
);

/** Returns true if the name contains a profanity word (whole-word, case-insensitive). */
export function containsProfanity(name: string): boolean {
  return PROFANITY_REGEX.test(name);
}
