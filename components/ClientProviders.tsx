import { AuthProvider } from '@/lib/authContext';
import { ThemeProvider } from '@/components/ui/ThemeProvider';

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>{children}</AuthProvider>
    </ThemeProvider>
  );
}
