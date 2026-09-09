import { RouterProvider } from 'react-router';

import { SessionProvider } from '../features/auth/SessionProvider';
import { BrandingProvider } from './providers/BrandingProvider';
import { QueryProvider } from './providers/QueryProvider';
import { router } from './router';

export function App() {
  return (
    <QueryProvider>
      <BrandingProvider>
        <SessionProvider>
          <RouterProvider router={router} />
        </SessionProvider>
      </BrandingProvider>
    </QueryProvider>
  );
}
