import type { Setup } from '../../play/dnaLab';
import { dinoById } from '../../content/dinosaurs';
import type { ToyKind } from '../../play/paddock';

/** All art is inline SVG, shared by the living scene and the photo renderer. */
export function Landscape() {
  return <>
    <defs>
      <linearGradient id="sky" x2="0" y2="1"><stop stopColor="#b8e3db"/><stop offset="1" stopColor="#eaf5cd"/></linearGradient>
      <linearGradient id="grass" x2="0" y2="1"><stop stopColor="#8fae59"/><stop offset="1" stopColor="#426c43"/></linearGradient>
    </defs>
    <rect width="1000" height="600" fill="url(#sky)"/>
    <circle cx="695" cy="88" r="42" fill="#fff2ae"/>
    <path d="M0 215 Q120 65 310 207 Q500 70 710 205 Q850 110 1000 205 V400 H0Z" fill="#8eafa0"/>
    <path d="M0 264 Q230 140 460 247 Q770 126 1000 251 V600 H0Z" fill="url(#grass)"/>
    <path d="M0 515 Q190 465 490 534 T1000 488" fill="none" stroke="#aac177" strokeWidth="38" opacity=".35"/>
    <ellipse cx="177" cy="327" rx="134" ry="51" fill="#294d39" opacity=".24"/>
    <path d="M161 302 L170 130 L192 130 L202 302Z" fill="#6a6550"/>
    <path d="M181 195 L114 139 M183 185 L248 124" stroke="#6a6550" strokeWidth="16"/>
    <ellipse cx="172" cy="113" rx="112" ry="65" fill="#3f7353"/>
    <ellipse cx="107" cy="143" rx="68" ry="45" fill="#527f51"/>
    <ellipse cx="241" cy="141" rx="74" ry="49" fill="#608e56"/>
    <path d="M791 303 L803 195 L819 195 L824 303" fill="#716853"/>
    <path d="M749 210 Q805 190 855 205" stroke="#716853" strokeWidth="18" strokeLinecap="round" fill="none"/>
    <ellipse cx="836" cy="474" rx="94" ry="36" fill="#9ec6aa"/>
    <ellipse cx="836" cy="466" rx="83" ry="27" fill="#74adb3"/>
    <path d="M804 459 Q835 448 866 459" stroke="#bad8c7" strokeWidth="4" fill="none"/>
    <path d="M370 284 Q394 247 424 282 L435 302 H355Z" fill="#839080"/>
    {[80, 330, 548, 700, 925].map((x,i) => <g key={x} transform={`translate(${x} ${430 + i % 2 * 95})`}>
      <path d="M0 14 L-4 0 M0 14 L7 2 M0 14 L13 8" stroke="#c1cc7b" strokeWidth="3" fill="none"/>
      <circle cx="8" cy="1" r="4" fill="#f2d68d"/>
    </g>)}
    <path d="M10 578 H990" stroke="#c4b690" strokeWidth="7"/>
    {[30, 180, 330, 480, 630, 780, 930].map(x => <path key={x} d={`M${x} 558 V600`} stroke="#b5a684" strokeWidth="12"/>)}
  </>;
}
export function DinosaurArt({ id, happy = false, setup }: { id: string; happy?: boolean; setup?: Setup }) {
  const color = setup && setup.appearance.color !== 'sample' ? ({ mint: '#69d6b1', coral: '#f28b78', violet: '#b5a0f5' })[setup.appearance.color] : dinoById(id)?.color ?? '#73ae71';
  const tail = setup?.traits.tail ?? 1, legs = setup?.traits.legs ?? 1, mass = Math.sqrt(setup?.traits.mass ?? 1);
  const pattern = setup?.appearance.pattern ?? 'plain';
  const flyer = id === 'pteranodon';
  const longNeck = ['brachiosaurus', 'parasaurolophus'].includes(id);
  return <g className={happy ? 'dinosaur-art happy' : 'dinosaur-art'}>
    <ellipse cy="33" rx="45" ry="10" fill="#244330" opacity=".2"/>
    {flyer ? <>
      <path d="M-4 0 Q-30 -45 -65 -25 L-37 13 L-6 9 M4 0 Q30 -45 65 -25 L37 13 L6 9" fill={color} stroke="#304750" strokeWidth="3"/>
      <ellipse cy="1" rx={15 * mass} ry={24 * mass} fill={color}/>{setup && <path d={`M-5 19 l-4 ${10 * legs} M5 19 l4 ${10 * legs} M0 15 L${-30 * tail} 23`} stroke={color} strokeWidth="5"/>}
      {pattern !== 'plain' && <path d="M-9 -10 h18 M-9 2 h18" stroke="#253b53" strokeWidth={pattern === 'spots' ? 6 : 3} strokeDasharray={pattern === 'spots' ? '2 6' : undefined} opacity=".4"/>}<path d="M0 -21 L-18 -47 L13 -29 L35 -18 L8 -12Z" fill={color}/><path d="M12 -26 L44 -18 L12 -16" fill="#e4b573"/><circle cx="5" cy="-24" r="3" fill="#172b32"/>
    </> : <>
      <g transform={`translate(-25 0) scale(${tail} 1) translate(25 0)`}><path d={id === 'ankylosaurus' ? 'M-30 5 Q-65 -5 -73 10' : 'M-30 5 Q-67 4 -74 -22 Q-59 -9 -25 -13'} fill={color} stroke={color} strokeWidth="10" strokeLinecap="round"/>
      {id === 'ankylosaurus' && <ellipse cx="-72" cy="9" rx="12" ry="9" fill="#616d80"/>}
      </g><g transform={`translate(0 12) scale(1 ${legs}) translate(0 -12)`}><path d="M-21 15 L-25 32 L-10 32 L-5 15 M13 15 L16 32 L31 32 L29 10" fill={color} stroke="#304750" strokeWidth="2"/>
      </g><ellipse cx="0" cy="0" rx={40 * mass} ry={24 * mass} fill={color} stroke="#304750" strokeWidth="3"/>
      {pattern === 'spots' && [-20,0,20].map(x => <circle key={x} cx={x * mass} cy="-5" r="6" fill="#253b53" opacity=".4"/>)}
      {pattern === 'stripes' && [-20,0,20].map(x => <path key={x} d={`M${x * mass} -15 l-5 22`} stroke="#253b53" strokeWidth="6" opacity=".4"/>)}
      {['stegosaurus','spinosaurus'].includes(id) && [-28,-10,8,25].map(x => <path key={x} d={`M${x-9} -17 L${x} -44 L${x+9} -20Z`} fill={id === 'stegosaurus' ? '#e6be72' : '#d78a56'} stroke="#65553f" strokeWidth="2"/>)}
      {id === 'ankylosaurus' && [-23,-5,13].map(x => <path key={x} d={`M${x-8} -12 L${x} -27 L${x+8} -12`} fill="#b9c1b0"/>)}
      {id === 'triceratops' && <ellipse cx="28" cy="-12" rx="21" ry="29" fill="#b95f44" stroke="#663d33" strokeWidth="2"/>}
      {longNeck && <path d="M19 0 Q38 -30 34 -63 L52 -63 Q56 -20 39 8Z" fill={color} stroke="#304750" strokeWidth="2"/>}
      <g transform={longNeck ? 'translate(5 -52)' : ''}>
        <ellipse cx="41" cy="-12" rx="23" ry="17" fill={color} stroke="#304750" strokeWidth="3"/>
        {id === 'triceratops' && <path d="M41 -24 L50 -45 L50 -23 M56 -14 L71 -24 L64 -8" fill="#f1e7be" stroke="#706950" strokeWidth="2"/>}
        <circle cx="47" cy="-17" r="4" fill="#f4f4dc"/><circle cx="48" cy="-17" r="2" fill="#172b32"/>
        <path d="M47 -3 Q55 3 61 -5" fill="none" stroke="#304750" strokeWidth="2.5" strokeLinecap="round"/>
      </g>
    </>}
    {happy && <text x="-12" y="-55" fontSize="25" fill="#fff0b4">♥</text>}
  </g>;
}
export function ToyArt({ kind, active }: { kind: ToyKind; active: boolean }) {
  if (kind === 'ball') return <><circle r="22" fill="#f0bc57" stroke="#75582d" strokeWidth="3"/><path d="M-20 -5 Q0 10 20 -5 M0 -22 Q-12 0 0 22" fill="none" stroke="#fff0b4" strokeWidth="5"/></>;
  if (kind === 'brush') return <g transform="rotate(-25)"><rect x="-7" y="0" width="14" height="34" rx="6" fill="#d5ad79"/><rect x="-20" y="-20" width="40" height="26" rx="8" fill="#e192a7"/><path d="M-13 -20 V-30 M-4 -20 V-30 M5 -20 V-30 M14 -20 V-30" stroke="#f7dbc9" strokeWidth="5"/></g>;
  return <><ellipse cy="13" rx="30" ry="12" fill="#dfb285" stroke="#82664d" strokeWidth="3"/>{active && <><path d="M-21 6 Q-31 -20 -7 -10 Q-7 8 -21 6 M-1 9 Q-4 -20 15 -12 Q21 3 -1 9" fill="#b7d47b"/><circle cx="18" cy="2" r="9" fill="#e98965"/></>}</>;
}
