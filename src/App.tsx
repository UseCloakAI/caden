import { lazy, Suspense, useEffect } from 'react';
import { useRoute, navigate } from './lib/router';
import { AuthProvider, useAuth } from './lib/auth';
import { Home } from './kits/marketing/Home';
import { Loading } from './product/Loading';

// Everything past the landing page loads on demand, so the home page ships light.
const AuthScreen = lazy(() => import('./product/auth/AuthScreen').then((m) => ({ default: m.AuthScreen })));
const ProductApp = lazy(() => import('./product/ProductApp').then((m) => ({ default: m.ProductApp })));
const CadenIOS = lazy(() => import('./kits/ios/IOSScreens').then((m) => ({ default: m.CadenIOS })));
const Thumbnail = lazy(() => import('./kits/Thumbnail').then((m) => ({ default: m.Thumbnail })));

function Routes() {
  const [rawHead] = useRoute();
  const head = rawHead?.split('?')[0];
  const { session, loading } = useAuth();
  const authPage = head === 'signin' || head === 'signup';

  useEffect(() => {
    if (authPage && !loading && session) navigate('/app');
  }, [authPage, loading, session]);

  if (authPage) return loading ? <Loading label="Signing you in" /> : <AuthScreen mode={head} />;
  switch (head) {
    case 'app':
    case 'join':
      return <ProductApp />;
    case 'ios':
      return <CadenIOS />;
    case 'thumbnail':
      return <Thumbnail />;
    default:
      return <Home />;
  }
}

export function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<Loading label="Loading" />}>
        <Routes />
      </Suspense>
    </AuthProvider>
  );
}
