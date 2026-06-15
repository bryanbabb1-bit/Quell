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
