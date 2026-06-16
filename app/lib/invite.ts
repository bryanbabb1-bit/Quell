import { Share } from 'react-native';

// One home for the install link + invite copy. FORETERA_URL is a durable brand
// link — point it at TestFlight now or the App Store later by redirecting the
// domain, no app change needed.
export const FORETERA_URL = 'https://foretera.app';

// Anyone → a friend. The growth loop: "let's get a match going."
export async function sharePlayerInvite(): Promise<void> {
  try {
    await Share.share({
      message: `Join me on Foretera — let's get a match going. Head-to-head match play with your buddies. ${FORETERA_URL}`,
    });
  } catch { /* dismissed */ }
}

// Club staff → a member. Branded around the club so a new member lands knowing
// this is how the club finds games and meets people.
export async function shareClubInvite(clubName: string): Promise<void> {
  const club = clubName?.trim() || 'our club';
  try {
    await Share.share({
      message: `We use Foretera at ${club} to find games and meet members. Download it and look us up: ${FORETERA_URL}`,
    });
  } catch { /* dismissed */ }
}

// Club staff → a one-tap shareable recap of the club's month (marketing the
// board to socials / the membership).
export async function shareClubMonth(
  clubName: string,
  stats: { matches: number; golfers: number; newCount: number }
): Promise<void> {
  const club = clubName?.trim() || 'our club';
  const parts = [`${stats.matches} matches`, `${stats.golfers} golfers`];
  if (stats.newCount > 0) parts.push(`${stats.newCount} new`);
  try {
    await Share.share({
      message: `This month at ${club}: ${parts.join(' · ')}. Find your next game on Foretera. ${FORETERA_URL}`,
    });
  } catch { /* dismissed */ }
}

// Club staff → forward a suggested intro between two members. The pro sends it
// to whichever of the two they're in touch with; it names both so it's clear.
export async function shareIntro(aName: string, bName: string, clubName: string): Promise<void> {
  const club = clubName?.trim() || 'the club';
  try {
    await Share.share({
      message: `${aName} & ${bName} — you two should get a game in. Both regulars at ${club} and you haven't played yet. Set it up on Foretera: ${FORETERA_URL}`,
    });
  } catch { /* dismissed */ }
}
