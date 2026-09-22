import { useEffect, useState } from 'react';
import { Home } from './kits/marketing/Home';
import { AppShell } from './kits/app/AppShell';
import { CadenIOS } from './kits/ios/IOSScreens';
import { Thumbnail } from './kits/Thumbnail';

const ROUTES = {
  '': Home,
  app: AppShell,
  ios: CadenIOS,
  thumbnail: Thumbnail,
};

const current = () => window.location.hash.replace(/^#\/?/, '') as keyof typeof ROUTES;

export function App() {
  const [route, setRoute] = useState(current);
  useEffect(() => {
    const onHash = () => setRoute(current());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const View = ROUTES[route] ?? Home;
  return <View />;
}
