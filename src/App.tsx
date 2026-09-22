import { useEffect } from 'react';
import { useRoute, navigate } from './lib/router';
import { AuthProvider, useAuth } from './lib/auth';
import { Home } from './kits/marketing/Home';
import { CadenIOS } from './kits/ios/IOSScreens';
import { Thumbnail } from './kits/Thumbnail';
import { AuthScreen } from './product/auth/AuthScreen';
import { VerifyScreen } from './product/auth/VerifyScreen';
import { ProductApp, Loading } from './product/ProductApp';

function Routes() {
  const [head, ...rest] = useRoute();
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
    case 'verify':
      return <VerifyScreen token={rest[0] ?? ''} />;
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
