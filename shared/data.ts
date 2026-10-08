// Teams (kit colours: shirt c, away shirt a, shorts s, socks k). Clubs 0-9 are Nigerian NPFL sides; 10-12 are street teams.
// Colours for 0-7 follow the RSSSF "Nigeria Team Colours" list (older, may differ from current kits); 8-9 are my guesses - edit freely.
export const TEAMS = [
  { n: 'Enugu Rangers', sh: 'RANGERS', c: 0xd62828, a: 0xffffff, s: 0xd62828, k: 0xd62828 },
  { n: 'Enyimba', sh: 'ENYIMBA', c: 0x1d4fd8, a: 0xffffff, s: 0x1d4fd8, k: 0x1d4fd8 },
  { n: 'Kano Pillars', sh: 'PILLARS', c: 0xf6c90e, a: 0x1e8f4e, s: 0xf6c90e, k: 0xf6c90e },
  { n: 'Shooting Stars', sh: '3SC', c: 0x1e4fb8, a: 0xffffff, s: 0x1e4fb8, k: 0x1e4fb8 },
  { n: 'Lobi Stars', sh: 'LOBI', c: 0xf6c90e, a: 0x1d4fd8, s: 0x1d4fd8, k: 0xf6c90e },
  { n: 'Heartland', sh: 'HEARTLAND', c: 0xc81e1e, a: 0xffffff, s: 0xc81e1e, k: 0xc81e1e },
  { n: 'Sunshine Stars', sh: 'SUNSHINE', c: 0xf6c90e, a: 0x1d4fd8, s: 0x1d4fd8, k: 0x1d4fd8 },
  { n: 'Kwara United', sh: 'KWARA', c: 0xf5f5f5, a: 0x1e8f4e, s: 0x1e8f4e, k: 0x1e8f4e },
  { n: 'Rivers United', sh: 'RIVERS', c: 0x1f9d55, a: 0xffffff, s: 0x1f9d55, k: 0x1f9d55 },
  { n: 'Remo Stars', sh: 'REMO', c: 0x4fc3f7, a: 0xffffff, s: 0x4fc3f7, k: 0x4fc3f7 },
  { n: 'Surulere', sh: 'SURULERE', c: 0x1f5fc9, a: 0xffffff, s: 0x1f5fc9, k: 0xffffff },
  { n: 'Ajegunle', sh: 'AJEGUNLE', c: 0x16a34a, a: 0xffffff, s: 0x111111, k: 0x16a34a },
  { n: 'Mushin', sh: 'MUSHIN', c: 0xf26a1b, a: 0x111111, s: 0x111111, k: 0xf26a1b },
];
export const FIELDS = [{ id: 'street', n: 'Street court' }, { id: 'dust', n: 'Dust pitch' }, { id: 'arena', n: 'Synthetic arena' }];
export const GOALS = ['GOOOAL! GBAM!', 'E DON ENTER!', 'NA WAO! GOAL!', 'OYA SCORE AM!', 'SEE GOAL! KAI!', 'BOOM! BACK OF THE NET!', 'SHARP SHOT! GOAL!', 'ON GOD! GOAL!'];
export const FOULS = ['FOUL! NO BE SO!', 'AH AH! WHY YOU KICK AM?', 'REF, YOU DEY SEE?!', 'WAHALA! FOUL!', 'ABEG! FOUL PLAY!', 'KAI! THAT ONE HURT!'];
export const PENS = ['PENALTY! NA SO?', 'SPOT KICK! OYA!', 'E DON CHOP PENALTY!', 'PENALTY! SOMEBODY DEY CRY!'];
export const MISS = ['MISSED! E NO FOR YOU', 'WIDE! OGA WHY?', 'NO LUCK! TRY AGAIN', 'SAVED BY NATURE!'];
