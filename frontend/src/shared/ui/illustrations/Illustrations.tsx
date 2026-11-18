import { Card, Drawer, type IllustrationProps, Svg } from './Svg';

// Ilustracije kartoteke (design.md 8.21, FR-020-24): prvi zagon, ni kontaktov, ni zadetkov, ni povabil, uvoz končan,
// brez povezave, 404 in prijava (pozdravna ploskev). Samo prazna stanja in pozdravne ploskve – nikoli na delovnih zaslonih.

export function FirstRunIllustration(props: IllustrationProps) {
  return (
    <Svg {...props}>
      <Card x={52} y={22} rotate={-6} fill="fill-muted" />
      <Card x={70} y={14} rotate={4} />
      <Drawer />
      <circle cx={156} cy={30} r={9} className="fill-selected stroke-primary" />
      <path d="M156 26v8M152 30h8" className="stroke-primary" />
    </Svg>
  );
}

export function NoContactsIllustration(props: IllustrationProps) {
  return (
    <Svg {...props}>
      <rect x={40} y={36} width={120} height={88} rx={12} className="fill-card" />
      <circle cx={80} cy={72} r={14} className="fill-muted" />
      <path d="M58 106c4-12 28-12 32 0" />
      <path d="M106 64h38M106 78h28M106 92h34" />
      <path d="M40 124h120" className="stroke-primary" />
    </Svg>
  );
}

export function NoResultsIllustration(props: IllustrationProps) {
  return (
    <Svg {...props}>
      <Card x={34} y={40} w={92} h={60} rotate={-3} />
      <circle cx={134} cy={90} r={24} className="fill-selected stroke-primary" />
      <path d="M152 108l16 16" className="stroke-primary" strokeWidth={3} />
      <path d="M124 90h20" className="stroke-primary" />
    </Svg>
  );
}

export function NoInvitationsIllustration(props: IllustrationProps) {
  return (
    <Svg {...props}>
      <rect x={42} y={44} width={116} height={78} rx={12} className="fill-card" />
      <path d="M44 50l56 40 56-40" />
      <rect x={72} y={22} width={56} height={40} rx={8} className="fill-selected" />
      <path d="M84 36h32M84 46h20" />
      <path d="M44 122l40-34M156 122l-40-34" className="stroke-primary" />
    </Svg>
  );
}

export function ImportDoneIllustration(props: IllustrationProps) {
  return (
    <Svg {...props}>
      <Card x={46} y={30} rotate={-5} fill="fill-muted" />
      <Card x={64} y={42} rotate={3} />
      <Drawer y={92} />
      <circle cx={150} cy={52} r={16} className="fill-success-soft stroke-success" />
      <path d="M142 52l6 6 10-12" className="stroke-success" strokeWidth={2} />
    </Svg>
  );
}

export function OfflineIllustration(props: IllustrationProps) {
  return (
    <Svg {...props}>
      <Card x={60} y={30} />
      <Drawer y={86} />
      <path d="M100 118v14" />
      <path d="M92 132h16" />
      <path d="M72 132c-14-4-20-14-14-24" strokeDasharray="4 6" />
      <path d="M128 132c14-4 20-14 14-24" strokeDasharray="4 6" />
      <path d="M150 28l12 12M162 28l-12 12" className="stroke-warning" strokeWidth={2} />
    </Svg>
  );
}

export function NotFoundIllustration(props: IllustrationProps) {
  return (
    <Svg {...props}>
      <path
        d="M40 54a8 8 0 0 1 8-8h32l10 12h62a8 8 0 0 1 8 8v58a8 8 0 0 1-8 8H48a8 8 0 0 1-8-8z"
        className="fill-card"
      />
      <path d="M40 74h120" />
      <path d="M92 96c0-8 16-8 16 0 0 6-8 6-8 14" className="stroke-primary" strokeWidth={2} />
      <circle cx={100} cy={120} r={1.5} className="fill-primary stroke-primary" />
    </Svg>
  );
}

/** Pozdravna ploskev prijave in ustvarjanja računa (do 360 px). */
export function AuthHeroIllustration({ size = 320, className }: IllustrationProps) {
  return (
    <Svg size={size} className={className}>
      <Card x={30} y={26} rotate={-8} fill="fill-muted" />
      <Card x={86} y={16} rotate={5} />
      <Card x={110} y={44} w={70} h={48} rotate={-2} fill="fill-selected" lines={1} />
      <Drawer x={34} y={84} w={132} h={62} />
      <circle cx={170} cy={30} r={7} className="fill-selected stroke-primary" />
    </Svg>
  );
}
