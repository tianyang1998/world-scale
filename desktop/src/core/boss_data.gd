class_name BossData
extends RefCounted

# All 15 bosses. Stats from boss-pve-system.md §3.1 (2026-04-10 balance pass).
# Keys: name, realm, hp, attack, defence, atk_ms, skill_ms, gold
const BOSSES: Dictionary = {
	"Apprentice": {
		"name": "The Hollow Golem", "realm": "tech",
		"hp": 3120, "attack": 220, "defence": 70,
		"atk_ms": 3000, "skill_ms": 12000, "gold": 100
	},
	"Initiate": {
		"name": "Sable Witch", "realm": "academia",
		"hp": 4430, "attack": 290, "defence": 100,
		"atk_ms": 2800, "skill_ms": 11000, "gold": 170
	},
	"Acolyte": {
		"name": "Iron Sentinel", "realm": "law",
		"hp": 6180, "attack": 380, "defence": 140,
		"atk_ms": 2600, "skill_ms": 10000, "gold": 250
	},
	"Journeyman": {
		"name": "The Pale Surgeon", "realm": "medicine",
		"hp": 8410, "attack": 490, "defence": 180,
		"atk_ms": 2400, "skill_ms": 9500, "gold": 360
	},
	"Adept": {
		"name": "Stormcaller Vex", "realm": "tech",
		"hp": 11170, "attack": 630, "defence": 230,
		"atk_ms": 2200, "skill_ms": 9000, "gold": 490
	},
	"Scholar": {
		"name": "The Archivist", "realm": "academia",
		"hp": 14520, "attack": 790, "defence": 290,
		"atk_ms": 2100, "skill_ms": 8500, "gold": 660
	},
	"Sage": {
		"name": "Mirethis the Undying", "realm": "medicine",
		"hp": 18510, "attack": 970, "defence": 360,
		"atk_ms": 2000, "skill_ms": 8000, "gold": 850
	},
	"Arcanist": {
		"name": "The Blind Judge", "realm": "law",
		"hp": 23180, "attack": 1180, "defence": 440,
		"atk_ms": 1900, "skill_ms": 7500, "gold": 1080
	},
	"Exemplar": {
		"name": "Vorath the Creator", "realm": "creative",
		"hp": 28990, "attack": 1430, "defence": 520,
		"atk_ms": 1800, "skill_ms": 7000, "gold": 1350
	},
	"Vanguard": {
		"name": "The Iron Chancellor", "realm": "law",
		"hp": 36040, "attack": 1700, "defence": 630,
		"atk_ms": 1700, "skill_ms": 6500, "gold": 1660
	},
	"Master": {
		"name": "Nexus Prime", "realm": "tech",
		"hp": 44440, "attack": 2020, "defence": 740,
		"atk_ms": 1600, "skill_ms": 6000, "gold": 2030
	},
	"Grandmaster": {
		"name": "The Hollow Oracle", "realm": "academia",
		"hp": 54280, "attack": 2400, "defence": 880,
		"atk_ms": 1500, "skill_ms": 5500, "gold": 2470
	},
	"Champion": {
		"name": "Seraph of Ruin", "realm": "creative",
		"hp": 66130, "attack": 2830, "defence": 1040,
		"atk_ms": 1400, "skill_ms": 5000, "gold": 2980
	},
	"Paragon": {
		"name": "The Last Tyrant", "realm": "law",
		"hp": 80150, "attack": 3340, "defence": 1230,
		"atk_ms": 1300, "skill_ms": 4500, "gold": 3570
	},
	"Legend": {
		"name": "The Eternal Arcanist", "realm": "academia",
		"hp": 100000, "attack": 4000, "defence": 1440,
		"atk_ms": 1200, "skill_ms": 4000, "gold": 4500
	},
}

# Boss realm special skills. Keys: effect, mult, debuff_frac, duration_ms, targets_all.
# effect values: "aoe_damage", "single_damage", "dot", "defence_debuff", "attack_debuff"
const SKILLS: Dictionary = {
	"academia": {
		"name": "Countermeasure",
		"effect": "defence_debuff", "mult": 0.0,
		"debuff_frac": 0.30, "duration_ms": 5000, "targets_all": true
	},
	"tech": {
		"name": "System Overload",
		"effect": "aoe_damage", "mult": 1.4,
		"debuff_frac": 0.0, "duration_ms": 0, "targets_all": true
	},
	"medicine": {
		"name": "Necrotic Touch",
		"effect": "dot", "mult": 0.15,
		"debuff_frac": 0.0, "duration_ms": 5000, "targets_all": false
	},
	"creative": {
		"name": "Viral Despair",
		"effect": "attack_debuff", "mult": 0.0,
		"debuff_frac": 0.25, "duration_ms": 6000, "targets_all": true
	},
	"law": {
		"name": "Absolute Verdict",
		"effect": "single_damage", "mult": 2.2,
		"debuff_frac": 0.0, "duration_ms": 0, "targets_all": false
	},
}
