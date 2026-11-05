import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { AuthProvider } from './state/AuthProvider';
import { SyncProvider } from './state/SyncProvider';
import { ToastProvider } from './state/ToastProvider';
import './styles/app.css';

// The update reload adds ?v= to get past the cache; tidy it out of the address bar
{
  const u = new URL(window.location.href);
  if (u.searchParams.has('v')) {
    u.searchParams.delete('v');
    window.history.replaceState(window.history.state, '', u.pathname + u.search + u.hash);
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The single-file app re-fetched a page every time it was opened. Query keeps a
      // short window where a revisit paints from cache, then refreshes behind it.
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <SyncProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </SyncProvider>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
