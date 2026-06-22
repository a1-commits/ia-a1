import type { ReactNode } from 'react';
import { RequireAuth } from '@/components/RequireAuth';

export default function MainLayout({ children }: { children: ReactNode }): React.ReactElement {
  return <RequireAuth>{children}</RequireAuth>;
}
