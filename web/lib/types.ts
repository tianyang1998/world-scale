export type Realm = "academia" | "tech" | "medicine" | "creative" | "law";

export interface CharacterScore {
  name: string;
  realm: Realm;
  tier: string;
  power: number;
  stats: {
    expertise: number;
    prestige: number;
    impact: number;
    credentials: number;
    network: number;
  };
  abilities: { name: string; icon: string; desc: string }[];
  source: {
    h_index?: number;
    citations?: number;
    years_active?: number;
    pub_count?: number;
    i10_index?: number;
    // github
    repos?: number;
    stars?: number;
    followers?: number;
    commits?: number;
  };
}

export const TIER_GROUPS: Record<string, { color: string; bg: string; text: string }> = {
  Apprentice:  { color: "#888780", bg: "#F1EFE8", text: "#444441" },
  Initiate:    { color: "#888780", bg: "#F1EFE8", text: "#444441" },
  Acolyte:     { color: "#639922", bg: "#EAF3DE", text: "#27500A" },
  Journeyman:  { color: "#639922", bg: "#EAF3DE", text: "#27500A" },
  Adept:       { color: "#639922", bg: "#EAF3DE", text: "#27500A" },
  Scholar:     { color: "#378ADD", bg: "#E6F1FB", text: "#0C447C" },
  Sage:        { color: "#378ADD", bg: "#E6F1FB", text: "#0C447C" },
  Arcanist:    { color: "#378ADD", bg: "#E6F1FB", text: "#0C447C" },
  Exemplar:    { color: "#7F77DD", bg: "#EEEDFE", text: "#3C3489" },
  Vanguard:    { color: "#7F77DD", bg: "#EEEDFE", text: "#3C3489" },
  Master:      { color: "#BA7517", bg: "#FAEEDA", text: "#633806" },
  Grandmaster: { color: "#BA7517", bg: "#FAEEDA", text: "#633806" },
  Champion:    { color: "#D85A30", bg: "#FAECE7", text: "#712B13" },
  Paragon:     { color: "#D85A30", bg: "#FAECE7", text: "#712B13" },
  Legend:      { color: "#A32D2D", bg: "#FCEBEB", text: "#501313" },
};

export const TIERS = [
  { name: "Apprentice",  min: 0,     max: 799   },
  { name: "Initiate",    min: 800,   max: 1599  },
  { name: "Acolyte",     min: 1600,  max: 2399  },
  { name: "Journeyman",  min: 2400,  max: 3199  },
  { name: "Adept",       min: 3200,  max: 3999  },
  { name: "Scholar",     min: 4000,  max: 4799  },
  { name: "Sage",        min: 4800,  max: 5599  },
  { name: "Arcanist",    min: 5600,  max: 6399  },
  { name: "Exemplar",    min: 6400,  max: 7199  },
  { name: "Vanguard",    min: 7200,  max: 7999  },
  { name: "Master",      min: 8000,  max: 8799  },
  { name: "Grandmaster", min: 8800,  max: 9599  },
  { name: "Champion",    min: 9600,  max: 10399 },
  { name: "Paragon",     min: 10400, max: 11199 },
  { name: "Legend",      min: 11200, max: 99999 },
];

// Add to the bottom of types.ts

export function getTier(totalPower: number): string {
  const tier = TIERS.find(t => totalPower >= t.min && totalPower <= t.max);
  return tier?.name ?? "Apprentice";
}

export function getTierStyle(totalPower: number) {
  const name = getTier(totalPower);
  return { name, ...TIER_GROUPS[name] };
}