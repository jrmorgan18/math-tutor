export type DiscoveryKind = 'fact' | 'upgrade' | 'badge';

export interface Discovery {
  id: string;
  kind: DiscoveryKind;
  glyph: string;
  title: string;
  text: string;
}

const DISCOVERIES: Discovery[] = [
  {
    id: 'fact-raptor-tail',
    kind: 'fact',
    glyph: '🦖',
    title: 'Raptor field note',
    text: 'A Velociraptor used its long, stiff tail to balance while turning quickly.',
  },
  {
    id: 'upgrade-amber-lamp',
    kind: 'upgrade',
    glyph: '💡',
    title: 'Amber analysis lamp',
    text: 'A new golden lamp now glows over the specimen bench.',
  },
  {
    id: 'badge-careful-counter',
    kind: 'badge',
    glyph: '🏅',
    title: 'Careful Counter',
    text: 'Awarded for continuing the research after the DNA tanks were full.',
  },
  {
    id: 'fact-triceratops-horns',
    kind: 'fact',
    glyph: '🦕',
    title: 'Triceratops field note',
    text: 'Its horns grew from bone and were covered by keratin, like your fingernails.',
  },
  {
    id: 'upgrade-holo-map',
    kind: 'upgrade',
    glyph: '🗺️',
    title: 'Holographic dig map',
    text: 'The lab can now mark promising fossil sites with glowing pins.',
  },
  {
    id: 'badge-pattern-finder',
    kind: 'badge',
    glyph: '🔎',
    title: 'Pattern Finder',
    text: 'Awarded for pushing beyond the day’s main expedition.',
  },
  {
    id: 'fact-stegosaurus-plates',
    kind: 'fact',
    glyph: '🦴',
    title: 'Stegosaurus field note',
    text: 'Its back plates contained blood vessels and may have helped control body temperature.',
  },
  {
    id: 'upgrade-robot-arm',
    kind: 'upgrade',
    glyph: '🦾',
    title: 'Fossil-cleaning robot',
    text: 'A tiny robot arm now brushes dust from delicate fossils.',
  },
  {
    id: 'badge-extra-mile',
    kind: 'badge',
    glyph: '⭐',
    title: 'Extra-Mile Scientist',
    text: 'Awarded for choosing discovery even after the day’s DNA was secured.',
  },
];

/** The collection never runs dry: later awards become numbered veteran badges. */
export function discoveryForAward(index: number): Discovery {
  const curated = DISCOVERIES[index];
  if (curated) return curated;
  const rank = index - DISCOVERIES.length + 1;
  return {
    id: `badge-veteran-${rank}`,
    kind: 'badge',
    glyph: '🔬',
    title: `Veteran Researcher ${rank}`,
    text: 'Another full set of after-hours observations has been logged.',
  };
}

export function discoveryById(id: string): Discovery | null {
  const curated = DISCOVERIES.find((item) => item.id === id);
  if (curated) return curated;
  const match = /^badge-veteran-(\d+)$/.exec(id);
  if (!match) return null;
  return discoveryForAward(DISCOVERIES.length + Number(match[1]) - 1);
}

export const POST_CAP_CORRECT_PER_DISCOVERY = 3;

