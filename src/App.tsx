import { useEffect } from 'react';
import { useRoute, navigate } from './lib/router';
import { AuthProvider, useAuth } from './lib/auth';
import { Home } from './kits/marketing/Home';
import { CadenIOS } from './kits/ios/IOSScreens';
import { Thumbnail } from './kits/Thumbnail';
import { AuthScreen } from './product/auth/AuthScreen';
import { ProductApp, Loading } from './product/ProductApp';

function Routes() {
  const [rawHead] = useRoute();
  const head = rawHead?.split('?')[0];
  const { session, loading } = useAuth();
  const authPage = head === 'signin' || head === 'signup';

  useEffect(() => {
    if (authPage && !loading && session) navigate('/app');
  }, [authPage, loading, session]);

  if (authPage) return loading ? <Loading /> : <AuthScreen mode={head} />;
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
      <Routes />
    </AuthProvider>
  );
}
