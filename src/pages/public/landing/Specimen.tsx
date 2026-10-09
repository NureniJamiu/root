/**
 * Small drawn "images" for the product film: figures a researcher might
 * gather on a canvas about AI-designed, plastic-eating enzymes. Drawn as
 * SVG so they stay crisp and ship no image files.
 */

export type SpecimenKind = 'protein' | 'pocket' | 'film' | 'gel' | 'molecule' | 'chart' | 'frame' | 'board';

interface SpecimenProps {
  readonly kind: SpecimenKind;
  readonly className?: string;
}

export function Specimen({ kind, className = '' }: SpecimenProps): JSX.Element {
  return (
    <svg viewBox="0 0 80 56" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden="true">
      {kind === 'protein' && <Protein />}
      {kind === 'pocket' && <Pocket />}
      {kind === 'film' && <Film />}
      {kind === 'gel' && <Gel />}
      {kind === 'molecule' && <Molecule />}
      {kind === 'chart' && <RetentionChart />}
      {kind === 'frame' && <VideoFrame />}
      {kind === 'board' && <Storyboard />}
    </svg>
  );
}

/** A predicted structure: ribbon helices and a sheet, coloured by confidence. */
function Protein(): JSX.Element {
  const helix = (x: number, y: number, len: number, color: string, key: string): JSX.Element => {
    let d = `M ${x} ${y}`;
    for (let i = 0; i < len; i += 1) d += ` q 2.5 -6 5 0 q 2.5 6 5 0`;
    return <path key={key} d={d} stroke={color} strokeWidth={3.2} fill="none" strokeLinecap="round" />;
  };
  return (
    <>
      <rect width="80" height="56" fill="#0d1526" />
      <path d="M 8 44 C 20 52, 30 30, 40 36 S 62 50, 72 40" stroke="#2f6fd6" strokeWidth={1.4} fill="none" opacity={0.8} />
      {helix(10, 16, 3, '#2f6fd6', 'h1')}
      {helix(40, 12, 3, '#5aa0ff', 'h2')}
      {helix(24, 30, 4, '#1d4fa8', 'h3')}
      <path d="M 50 30 l 16 0 l 0 -3 l 5 5 l -5 5 l 0 -3 l -16 0 Z" fill="#f2c94c" />
      <path d="M 50 40 l 14 0 l 0 -3 l 5 5 l -5 5 l 0 -3 l -14 0 Z" fill="#f2994a" opacity={0.9} />
    </>
  );
}

/** The binding pocket: a surface with a ligand sitting in it. */
function Pocket(): JSX.Element {
  return (
    <>
      <rect width="80" height="56" fill="#f1ece4" />
      <path d="M 0 56 L 0 18 C 14 10, 22 30, 34 30 C 46 30, 50 8, 64 12 C 72 14, 78 22, 80 20 L 80 56 Z" fill="#c9b8a6" />
      <path d="M 0 56 L 0 28 C 14 22, 22 40, 34 40 C 46 40, 52 22, 64 24 C 72 26, 78 32, 80 30 L 80 56 Z" fill="#a8927c" />
      <g stroke="#1b1c1c" strokeWidth={1.2}>
        <line x1="30" y1="24" x2="38" y2="20" />
        <line x1="38" y1="20" x2="46" y2="24" />
        <line x1="46" y1="24" x2="52" y2="18" />
      </g>
      <circle cx="30" cy="24" r="3" fill="#de5052" />
      <circle cx="38" cy="20" r="3" fill="#6b6f7a" />
      <circle cx="46" cy="24" r="3" fill="#6b6f7a" />
      <circle cx="52" cy="18" r="3" fill="#de5052" />
    </>
  );
}

/** PET film after a week with the enzyme: pitted and eaten through. */
function Film(): JSX.Element {
  const pits: readonly [number, number, number][] = [
    [14, 14, 5], [30, 22, 7], [52, 12, 4], [66, 26, 6], [20, 40, 6], [44, 42, 8], [62, 46, 4], [38, 8, 3],
  ];
  return (
    <>
      <rect width="80" height="56" fill="#cfe3ea" />
      <rect x="4" y="4" width="72" height="48" rx="2" fill="#e9f3f6" stroke="#9fc3cf" />
      {pits.map(([x, y, r], i) => (
        <ellipse key={i} cx={x} cy={y} rx={r} ry={r * 0.75} fill="#7fa9b8" opacity={0.55} />
      ))}
      {pits.map(([x, y, r], i) => (
        <ellipse key={`c${i}`} cx={x + 0.8} cy={y + 0.6} rx={r * 0.5} ry={r * 0.35} fill="#3e6d7d" opacity={0.6} />
      ))}
    </>
  );
}

/** A protein gel: lanes of bands. */
function Gel(): JSX.Element {
  const lanes = [10, 24, 38, 52, 66];
  const bands: readonly [number, number, number][] = [
    [0, 12, 0.9], [0, 22, 0.7], [0, 34, 0.8], [0, 44, 0.6],
    [1, 20, 0.9], [2, 20, 0.95], [2, 36, 0.4], [3, 20, 0.85], [3, 28, 0.5], [4, 20, 1],
  ];
  return (
    <>
      <rect width="80" height="56" fill="#e8ecf4" />
      {lanes.map((x) => (
        <rect key={x} x={x - 4} y="4" width="12" height="48" fill="#dde3ef" />
      ))}
      {bands.map(([lane, y, o], i) => (
        <rect key={i} x={(lanes[lane] as number) - 4} y={y} width="12" height="3" rx="1" fill="#24366b" opacity={o} />
      ))}
    </>
  );
}

/** A ball-and-stick molecule: the PET repeat unit. */
function Molecule(): JSX.Element {
  const atoms: readonly [number, number, string][] = [
    [14, 28, '#6b6f7a'], [24, 20, '#6b6f7a'], [34, 28, '#6b6f7a'], [44, 20, '#6b6f7a'], [54, 28, '#6b6f7a'],
    [64, 20, '#6b6f7a'], [24, 10, '#de5052'], [54, 38, '#de5052'], [34, 38, '#de5052'], [70, 30, '#de5052'],
  ];
  const bonds: readonly [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [1, 6], [4, 7], [2, 8], [5, 9]];
  return (
    <>
      <rect width="80" height="56" fill="#fbf9f8" />
      {bonds.map(([a, b]) => {
        const [x1, y1] = atoms[a] as [number, number, string];
        const [x2, y2] = atoms[b] as [number, number, string];
        return <line key={`${a}-${b}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#9a9da8" strokeWidth={2} />;
      })}
      {atoms.map(([x, y, c], i) => (
        <circle key={i} cx={x} cy={y} r={4} fill={c} />
      ))}
    </>
  );
}

/** An audience-retention curve with the drop at 0:08 marked. */
function RetentionChart(): JSX.Element {
  return (
    <>
      <rect width="80" height="56" fill="#ffffff" />
      {[14, 26, 38].map((y) => (
        <line key={y} x1="6" y1={y} x2="76" y2={y} stroke="#ebebeb" strokeWidth={0.8} />
      ))}
      <path d="M 6 10 C 12 10, 14 12, 18 30 C 22 38, 40 38, 76 42 L 76 50 L 6 50 Z" fill="rgba(0, 81, 195, 0.12)" />
      <path d="M 6 10 C 12 10, 14 12, 18 30 C 22 38, 40 38, 76 42" stroke="#0051c3" strokeWidth={1.6} fill="none" />
      <line x1="17" y1="6" x2="17" y2="50" stroke="#de5052" strokeWidth={1} strokeDasharray="2 2" />
      <circle cx="17" cy="26" r="2.2" fill="#de5052" />
    </>
  );
}

/** A video frame with a play button. */
function VideoFrame(): JSX.Element {
  return (
    <>
      <rect width="80" height="56" fill="#1f2a44" />
      <circle cx="58" cy="18" r="9" fill="#f2c94c" opacity={0.9} />
      <path d="M 0 56 L 0 40 L 18 28 L 34 40 L 50 30 L 80 46 L 80 56 Z" fill="#2d7a4c" />
      <circle cx="40" cy="28" r="9" fill="rgba(255,255,255,0.9)" />
      <path d="M 37 23.5 L 45 28 L 37 32.5 Z" fill="#1f2a44" />
      <rect x="0" y="52" width="80" height="4" fill="rgba(255,255,255,0.25)" />
      <rect x="0" y="52" width="22" height="4" fill="#de5052" />
    </>
  );
}

/** A storyboard: six sketched panels. */
function Storyboard(): JSX.Element {
  const cells = [0, 1, 2, 3, 4, 5];
  return (
    <>
      <rect width="80" height="56" fill="#fbf9f8" />
      {cells.map((i) => {
        const x = 4 + (i % 3) * 25;
        const y = 4 + Math.floor(i / 3) * 25;
        return (
          <g key={i}>
            <rect x={x} y={y} width="22" height="22" fill="#ffffff" stroke="#1b1c1c" strokeWidth={0.8} />
            <circle cx={x + 7 + (i % 2) * 6} cy={y + 9} r="3" fill="none" stroke="#434653" strokeWidth={0.8} />
            <path d={`M ${x + 3} ${y + 19} L ${x + 10} ${y + 13} L ${x + 19} ${y + 19}`} fill="none" stroke="#434653" strokeWidth={0.8} />
          </g>
        );
      })}
    </>
  );
}
