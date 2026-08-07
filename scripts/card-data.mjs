// The browser build gets this from src/ui/share.ts, which also owns the
// buttons. This is the same mapping without the DOM, for the headless render.

export const CARD_FOOTER = 'keivanmalhani.github.io/weapon-report';

const num = (v) => v.toLocaleString('en-US');
const fullName = (p) => p.displayName + '#' + String(p.displayNameCode).padStart(4, '0');

export function cardDataFromReport(report) {
  const owned = report.account.rows.length;
  const caption =
    owned > 0
      ? 'of ' +
        num(report.account.totalKills) +
        ' kills come from ' +
        report.headlineCount +
        ' of the ' +
        num(owned) +
        ' guns this account has ever used.'
      : 'No recorded kills on this account.';
  return {
    eyebrow: 'WEAPON REPORT',
    headlineNumber: Math.round(report.headlineShare * 100) + '%',
    caption,
    giniLabel: 'concentration ' + report.gini.toFixed(2),
    areaNote:
      'Dotted line: every gun doing equal work. Shaded gap: how far off that you are.',
    subject: fullName(report.account.player),
    lorenz: report.lorenz,
    top: report.top.slice(0, 3).map((row) => ({ name: row.name, value: num(row.kills) })),
    footer: CARD_FOOTER
  };
}
