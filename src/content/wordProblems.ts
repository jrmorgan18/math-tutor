/**
 * Hand-authored word-problem templates.
 *
 * The template supplies only the *prose*. The numbers and the answer are
 * chosen and computed by the generator, so a template can never produce a
 * wrong answer no matter how the numbers fall. Contexts are drawn from what he
 * actually cares about — dinosaurs, space, soccer, music — because a word
 * problem he wants to read is a word problem he will actually parse.
 *
 * Sentences are kept short and the question is always the final sentence, so
 * the text-to-speech read-aloud lands cleanly.
 */

export type Flavor = 'dino' | 'space' | 'soccer' | 'music' | 'lab';

export interface WordTemplate {
  id: string;
  op: '+' | '-' | '×' | '÷';
  flavor: Flavor;
  /** Prose only. `a` and `b` are supplied by the generator. */
  build: (a: number, b: number) => string;
  /** Unit noun for the answer, shown as a hint under the keypad. */
  unit: string;
}

export const WORD_TEMPLATES: WordTemplate[] = [
  // ------------------------------------------------------------ addition
  {
    id: 'add-dig-days',
    op: '+',
    flavor: 'dino',
    unit: 'fossils',
    build: (a, b) =>
      `The dig team uncovered ${a} fossils on Monday. On Tuesday they uncovered ${b} more. How many fossils did they uncover altogether?`,
  },
  {
    id: 'add-bones-crates',
    op: '+',
    flavor: 'dino',
    unit: 'bones',
    build: (a, b) =>
      `One crate holds ${a} bones. Another crate holds ${b} bones. How many bones are in both crates?`,
  },
  {
    id: 'add-eggs-nests',
    op: '+',
    flavor: 'dino',
    unit: 'eggs',
    build: (a, b) =>
      `A Maiasaura nest has ${a} eggs. A second nest has ${b} eggs. How many eggs is that in total?`,
  },
  {
    id: 'add-amber',
    op: '+',
    flavor: 'lab',
    unit: 'samples',
    build: (a, b) =>
      `The lab already had ${a} amber samples. A new shipment brought ${b} more. How many samples does the lab have now?`,
  },
  {
    id: 'add-stars',
    op: '+',
    flavor: 'space',
    unit: 'stars',
    build: (a, b) =>
      `A telescope logged ${a} stars in the first hour. It logged ${b} stars in the second hour. How many stars did it log in total?`,
  },
  {
    id: 'add-pilots',
    op: '+',
    flavor: 'space',
    unit: 'pilots',
    build: (a, b) =>
      `Red Squadron has ${a} pilots. Gold Squadron has ${b} pilots. How many pilots are in both squadrons?`,
  },
  {
    id: 'add-goals-season',
    op: '+',
    flavor: 'soccer',
    unit: 'goals',
    build: (a, b) =>
      `A team scored ${a} goals before the break. They scored ${b} goals after the break. How many goals did they score in the whole season?`,
  },
  {
    id: 'add-fans',
    op: '+',
    flavor: 'soccer',
    unit: 'fans',
    build: (a, b) =>
      `There were ${a} fans on one side of the field and ${b} fans on the other side. How many fans were at the match?`,
  },
  {
    id: 'add-notes',
    op: '+',
    flavor: 'music',
    unit: 'minutes',
    build: (a, b) =>
      `A drummer practised for ${a} minutes on Saturday and ${b} minutes on Sunday. How many minutes did she practise in total?`,
  },
  {
    id: 'add-songs',
    op: '+',
    flavor: 'music',
    unit: 'songs',
    build: (a, b) =>
      `One playlist has ${a} songs. Another playlist has ${b} songs. How many songs are on both playlists?`,
  },
  {
    id: 'add-claws-found',
    op: '+',
    flavor: 'dino',
    unit: 'claws',
    build: (a, b) =>
      `One dig team found ${a} claws. Another team found ${b} claws. How many claws did both teams find?`,
  },
  {
    id: 'add-band-members',
    op: '+',
    flavor: 'music',
    unit: 'members',
    build: (a, b) =>
      `One band has ${a} members. Another band has ${b} members. How many members is that altogether?`,
  },
  {
    id: 'add-planets',
    op: '+',
    flavor: 'space',
    unit: 'planets',
    build: (a, b) =>
      `A star system has ${a} rocky planets and ${b} gas planets. How many planets does it have in total?`,
  },

  // --------------------------------------------------------- subtraction
  {
    id: 'sub-fossils-left',
    op: '-',
    flavor: 'dino',
    unit: 'fossils',
    build: (a, b) =>
      `The museum had ${a} fossils on display. They loaned ${b} of them to another museum. How many fossils are still on display?`,
  },
  {
    id: 'sub-eggs-hatched',
    op: '-',
    flavor: 'dino',
    unit: 'eggs',
    build: (a, b) =>
      `There were ${a} eggs in the incubator. ${b} of them hatched. How many eggs have not hatched yet?`,
  },
  {
    id: 'sub-herd',
    op: '-',
    flavor: 'dino',
    unit: 'dinosaurs',
    build: (a, b) =>
      `A herd of ${a} Triceratops was grazing. ${b} of them walked into the forest. How many are still grazing?`,
  },
  {
    id: 'sub-teeth-compare',
    op: '-',
    flavor: 'dino',
    unit: 'teeth',
    build: (a, b) =>
      `A T. rex skull has ${a} teeth. An Allosaurus skull has ${b} teeth. How many more teeth does the T. rex have?`,
  },
  {
    id: 'sub-samples-used',
    op: '-',
    flavor: 'lab',
    unit: 'samples',
    build: (a, b) =>
      `The lab started with ${a} DNA samples. The team used ${b} of them in an experiment. How many samples are left?`,
  },
  {
    id: 'sub-fuel',
    op: '-',
    flavor: 'space',
    unit: 'units',
    build: (a, b) =>
      `A shuttle launched with ${a} units of fuel. It burned ${b} units reaching orbit. How many units of fuel are left?`,
  },
  {
    id: 'sub-ships',
    op: '-',
    flavor: 'space',
    unit: 'ships',
    build: (a, b) =>
      `${a} ships left the hangar. ${b} of them have already landed. How many ships are still flying?`,
  },
  {
    id: 'sub-tickets',
    op: '-',
    flavor: 'soccer',
    unit: 'tickets',
    build: (a, b) =>
      `The stadium printed ${a} tickets. ${b} tickets have been sold. How many tickets are still available?`,
  },
  {
    id: 'sub-goals-diff',
    op: '-',
    flavor: 'soccer',
    unit: 'goals',
    build: (a, b) =>
      `The home team scored ${a} goals this season. The away team scored ${b}. How many more goals did the home team score?`,
  },
  {
    id: 'sub-concert',
    op: '-',
    flavor: 'music',
    unit: 'seats',
    build: (a, b) =>
      `A concert hall has ${a} seats. ${b} people have arrived. How many seats are still empty?`,
  },
  {
    id: 'sub-fossils-cleaning',
    op: '-',
    flavor: 'lab',
    unit: 'fossils',
    build: (a, b) =>
      `The lab had ${a} fossils waiting to be cleaned. They finished cleaning ${b} of them. How many fossils are still waiting?`,
  },
  {
    id: 'sub-setlists',
    op: '-',
    flavor: 'music',
    unit: 'setlists',
    build: (a, b) =>
      `A band printed ${a} setlists for a show. ${b} of them have already been handed out. How many setlists are left?`,
  },
  {
    id: 'sub-match-time',
    op: '-',
    flavor: 'soccer',
    unit: 'minutes',
    build: (a, b) =>
      `A match lasts ${a} minutes. ${b} minutes have already been played. How many minutes are left?`,
  },

  // ------------------------------------------------------ multiplication
  {
    id: 'mul-nests',
    op: '×',
    flavor: 'dino',
    unit: 'eggs',
    build: (a, b) =>
      `There are ${a} nests. Each nest has ${b} eggs in it. How many eggs are there in total?`,
  },
  {
    id: 'mul-claws',
    op: '×',
    flavor: 'dino',
    unit: 'claws',
    build: (a, b) =>
      `Each Velociraptor has ${b} claws on its front legs. How many claws do ${a} Velociraptors have?`,
  },
  {
    id: 'mul-crates',
    op: '×',
    flavor: 'dino',
    unit: 'bones',
    build: (a, b) =>
      `The team packed ${a} crates. Each crate holds ${b} bones. How many bones did they pack?`,
  },
  {
    id: 'mul-racks',
    op: '×',
    flavor: 'lab',
    unit: 'samples',
    build: (a, b) =>
      `A storage rack holds ${b} samples per shelf. The rack has ${a} shelves. How many samples fit on the rack?`,
  },
  {
    id: 'mul-squadrons',
    op: '×',
    flavor: 'space',
    unit: 'ships',
    build: (a, b) =>
      `There are ${a} squadrons. Each squadron has ${b} ships. How many ships is that altogether?`,
  },
  {
    id: 'mul-moons',
    op: '×',
    flavor: 'space',
    unit: 'moons',
    build: (a, b) =>
      `${a} planets each have ${b} moons. How many moons are there in total?`,
  },
  {
    id: 'mul-teams',
    op: '×',
    flavor: 'soccer',
    unit: 'players',
    build: (a, b) =>
      `${a} teams came to the tournament. Each team has ${b} players. How many players came in total?`,
  },
  {
    id: 'mul-practice',
    op: '×',
    flavor: 'soccer',
    unit: 'minutes',
    build: (a, b) =>
      `A player trains for ${b} minutes a day. How many minutes does he train in ${a} days?`,
  },
  {
    id: 'mul-band',
    op: '×',
    flavor: 'music',
    unit: 'strings',
    build: (a, b) =>
      `There are ${a} guitars in the shop. Each guitar has ${b} strings. How many strings is that?`,
  },
  {
    id: 'mul-rows',
    op: '×',
    flavor: 'music',
    unit: 'seats',
    build: (a, b) =>
      `The concert hall has ${a} rows. Each row has ${b} seats. How many seats are there?`,
  },
  {
    id: 'mul-vials',
    op: '×',
    flavor: 'lab',
    unit: 'vials',
    build: (a, b) =>
      `The lab has ${a} trays. Each tray holds ${b} vials. How many vials is that in total?`,
  },
  {
    id: 'mul-crate-arrivals',
    op: '×',
    flavor: 'dino',
    unit: 'fossils',
    build: (a, b) =>
      `${a} fossil crates arrive each day. Each crate has ${b} fossils inside. How many fossils arrive in one day?`,
  },
  {
    id: 'mul-ball-bags',
    op: '×',
    flavor: 'soccer',
    unit: 'balls',
    build: (a, b) =>
      `The equipment room has ${a} bags of balls. Each bag has ${b} balls. How many balls are there?`,
  },

  // -------------------------------------------------------------- division
  {
    id: 'div-eggs-share',
    op: '÷',
    flavor: 'dino',
    unit: 'eggs',
    build: (a, b) =>
      `There are ${a} eggs to share equally between ${b} nests. How many eggs go in each nest?`,
  },
  {
    id: 'div-meat',
    op: '÷',
    flavor: 'dino',
    unit: 'kilograms',
    build: (a, b) =>
      `The keepers have ${a} kilograms of meat to split equally between ${b} raptors. How many kilograms does each raptor get?`,
  },
  {
    id: 'div-groups',
    op: '÷',
    flavor: 'dino',
    unit: 'groups',
    build: (a, b) =>
      `${a} dinosaurs need to be moved in groups of ${b}. How many groups will there be?`,
  },
  {
    id: 'div-samples',
    op: '÷',
    flavor: 'lab',
    unit: 'samples',
    build: (a, b) =>
      `${a} samples are packed equally into ${b} boxes. How many samples are in each box?`,
  },
  {
    id: 'div-pilots',
    op: '÷',
    flavor: 'space',
    unit: 'pilots',
    build: (a, b) =>
      `${a} pilots are split equally between ${b} ships. How many pilots are on each ship?`,
  },
  {
    id: 'div-cargo',
    op: '÷',
    flavor: 'space',
    unit: 'crates',
    build: (a, b) =>
      `${a} crates of cargo are loaded evenly onto ${b} shuttles. How many crates does each shuttle carry?`,
  },
  {
    id: 'div-teams',
    op: '÷',
    flavor: 'soccer',
    unit: 'players',
    build: (a, b) =>
      `${a} players are divided evenly into ${b} teams. How many players are on each team?`,
  },
  {
    id: 'div-balls',
    op: '÷',
    flavor: 'soccer',
    unit: 'balls',
    build: (a, b) =>
      `The coach shares ${a} balls equally among ${b} practice stations. How many balls go to each station?`,
  },
  {
    id: 'div-music-groups',
    op: '÷',
    flavor: 'music',
    unit: 'students',
    build: (a, b) =>
      `${a} students are split evenly into ${b} bands. How many students are in each band?`,
  },
  {
    id: 'div-vials-shelves',
    op: '÷',
    flavor: 'lab',
    unit: 'vials',
    build: (a, b) =>
      `${a} vials are shared equally among ${b} shelves. How many vials go on each shelf?`,
  },
  {
    id: 'div-instruments',
    op: '÷',
    flavor: 'music',
    unit: 'instruments',
    build: (a, b) =>
      `${a} instruments are shared equally between ${b} music rooms. How many instruments go in each room?`,
  },
  {
    id: 'div-crew',
    op: '÷',
    flavor: 'space',
    unit: 'crew members',
    build: (a, b) =>
      `${a} crew members are split evenly across ${b} ships. How many crew members are on each ship?`,
  },
];

export const TEMPLATES_BY_OP: Record<string, WordTemplate[]> = {
  '+': WORD_TEMPLATES.filter((t) => t.op === '+'),
  '-': WORD_TEMPLATES.filter((t) => t.op === '-'),
  '×': WORD_TEMPLATES.filter((t) => t.op === '×'),
  '÷': WORD_TEMPLATES.filter((t) => t.op === '÷'),
};
