import { BootSpinner } from './_layout';

// Landing route. AuthGate (in the root layout) redirects to (auth) or (app)
// as soon as Clerk resolves; until then we show the boot spinner so there's
// never a blank frame.
export default function Index() {
  return <BootSpinner />;
}
