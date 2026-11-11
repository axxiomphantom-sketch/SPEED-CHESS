import { useEffect, useState } from 'react';
import { Scale } from 'lucide-react';
import { Card, Tabs } from '../components/ui';

const SECTIONS: Array<{ id: string; label: string; body: string }> = [
  {
    id: 'terms',
    label: 'Terms of service',
    body: `## 1. Agreement
By creating an account you agree to these terms. If you do not agree, do not use the platform.

## 2. Your account
One account per person. You are responsible for keeping your password private and for activity on your account. You must be at least 13 years old, or have verifiable consent from a parent or guardian if your local law requires it.

## 3. Fair play
You will not use engines, outside help, another person, or automated tools during rated games. You will not manipulate ratings, share accounts, or interfere with tournaments. Fair-play findings are reviewed by a person and can be appealed.

## 4. Content you create
You keep ownership of articles, messages and club announcements you write. You grant SPEED CHESS a non-exclusive licence to display that content on the platform. You must not post illegal, abusive or infringing material.

## 5. Paid plans
Paid plans renew until cancelled and are billed by our payment provider. Prices are shown before you pay. Cancelling stops future renewals; access continues until the end of the paid period. Paid plans never change chess outcomes.

## 6. Availability and changes
We may change or discontinue features. Where a paid feature is removed, we will pro-rata refund the unused period. We aim for high availability but do not guarantee uninterrupted service.

## 7. Ending the agreement
You may delete your account at any time from Settings. We may suspend an account for a serious or repeated breach of these terms, with a written reason and an appeal route.

## 8. Liability
The platform is provided "as is". To the extent permitted by law, our liability is limited to the amount you paid in the previous twelve months. Nothing in these terms limits liability for fraud or death and personal injury caused by negligence.

## 9. Governing law
These terms are governed by the laws of the jurisdiction in which the operating entity is registered. Consumers keep the protections of their local law.`,
  },
  {
    id: 'privacy',
    label: 'Privacy policy',
    body: `## What we collect
- **Account**: username, email, password hash, country (optional), birth year (optional), preferences.
- **Games**: moves, results, clocks, ratings derived from results.
- **Learning**: lesson progress and quiz scores; puzzle attempts and timings.
- **Social**: friends, messages, club membership and reports.
- **Technical**: session records (IP address, user agent) for security.

## Why we collect it
To run games and ratings, keep your account secure, provide learning progress, moderate abuse, and improve the product. We do not sell personal data and we do not run third-party advertising trackers.

## Legal bases
Contract (running your account and games), legitimate interests (security, fair play, abuse prevention) and consent (optional profile fields and notifications).

## Retention
Games and ratings are kept while your account is active because ratings depend on history. Session records expire. Reports are retained to prevent repeat abuse. Deleting your account removes your profile, games and messages and anonymises rating records.

## Your rights
You can export all your data from your profile page, correct it, or delete your account. Where local law provides additional rights (access, portability, objection), contact support and we will respond within the statutory period.

## Processors
Payments are handled by a payment provider; transactional email by an email provider. Neither receives your password. Details of configured providers are listed in docs/DEPLOYMENT.md.

## Children
Accounts for younger players default to stricter privacy. Guardians may contact support to review or remove a child's account.

## Contact
Privacy questions go through the Help centre; security disclosures are prioritised.`,
  },
  {
    id: 'fair-play',
    label: 'Fair play policy',
    body: `## Principle
Chess is a contest of thinking. Every result on SPEED CHESS should reflect the players' own decisions.

## What is prohibited
- Engine assistance or tablebases in rated games.
- Advice from another person during a rated game.
- Account sharing, sandbagging, rating manipulation, or deliberate losing.
- Harassment and discrimination in any channel.

## How we detect it
We look at patterns across many games: unusual accuracy relative to rating, timing that is inconsistent with human thought, abnormal consistency in complex positions, and reports from opponents. **No single metric decides anything.** Signals create a report for human review.

## Review process
1. A report is opened and the game history is examined.
2. A moderator decides whether there is a violation. The decision and a written reason are recorded in the audit log.
3. The player is notified with the category of evidence and the appeal route.
4. Appeals are reviewed by a different moderator where possible.

## Consequences
A first finding normally means a warning or a temporary restriction of rated play. Repeated or serious violations can lead to suspension. Tournament titles may be removed and results corrected, with notification to affected players.

## What we never do
- Automatically accuse or ban an account.
- Restrict an account without a written reason.
- Hide a finding behind a paid tier.
- Ignore an appeal.`,
  },
  {
    id: 'minors',
    label: 'Minors & safeguarding',
    body: `## Defaults for younger players
- Messages from non-friends are off.
- Country and activity visibility are limited to friends.
- Public profile shows no email, birth year or location detail beyond country.

## Reporting and blocking
Any player can report or block another from their profile or from a message thread. Blocking is immediate and mutual. Reports involving a minor are prioritised.

## Contact with adults
SPEED CHESS does not pair minors with adult coaches automatically. Coaching relationships are initiated by a guardian or through a club.

## Guardian requests
A parent or guardian can ask support to review an account. We may ask for reasonable verification and will remove or restrict the account where appropriate.

## Content
Articles and club announcements are moderated. Sexual, violent or hateful content is removed and the account actioned.`,
  },
  {
    id: 'cookies',
    label: 'Cookies & storage',
    body: `## Strictly necessary
A single session cookie keeps you signed in. Without it you cannot play rated games or keep progress. It is HTTP-only and same-site by default.

## Local preferences
Board theme, sound and coordinate settings are stored locally and, when you are signed in, saved to your account so they follow you between devices.

## Analytics
This build does not include third-party analytics or advertising trackers. If analytics is added in a deployment, it will be listed in docs/DEPLOYMENT.md and disclosed here.

## Managing storage
You can clear local storage in your browser at any time. Doing so signs you out and resets local preferences.`,
  },
  {
    id: 'accessibility',
    label: 'Accessibility',
    body: `## What is implemented
- Full keyboard access to the board: focus a square, use arrow keys, select with Enter or Space.
- Every board has a descriptive accessible label and a text move list.
- Colour contrast meets WCAG AA against the dark palette for text and controls.
- Reduced-motion preference disables board and page animations.
- Sound can be turned off; nothing depends on audio alone.

## Known limitations
- Screen-reader narration of every move on a live board is available through the move list rather than an automatic announcer.
- Piece art is vector and scales with board size, but extremely narrow phones show smaller pieces.

## Reporting a barrier
Send a report from Help → Contact support with the page and the assistive technology you use. Accessibility issues are treated as bugs.`,
  },
];

export function Legal() {
  const [active, setActive] = useState('terms');

  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash && SECTIONS.some(section => section.id === hash)) setActive(hash);
  }, []);

  const current = SECTIONS.find(section => section.id === active) ?? SECTIONS[0];

  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <header className="page-head">
        <div>
          <div className="eyebrow"><Scale size={13} style={{ verticalAlign: -2 }} /> Policies</div>
          <h1>Legal & policies</h1>
          <p>Plain-language terms, privacy, fair play and safeguarding. Last updated {new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long' })}.</p>
        </div>
      </header>

      <Tabs value={active} onChange={setActive} label="Policy documents"
        tabs={SECTIONS.map(section => ({ id: section.id, label: section.label }))} />

      <Card>
        <div id={current.id}>
          <MarkdownBody source={current.body} />
        </div>
        <p className="tiny muted" style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 20 }}>
          This document is a clear summary written for the SPEED CHESS platform. It is not legal advice; a production operator should have it reviewed for their jurisdiction before launch.
        </p>
      </Card>
    </div>
  );
}

import { Markdown } from '../components/Markdown';
function MarkdownBody({ source }: { source: string }) {
  return <Markdown source={source} />;
}
