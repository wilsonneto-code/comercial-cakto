import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { User as SupabaseAuthUser } from '@supabase/supabase-js';
import { supabase } from './supabase/client';

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  team_id: string | null;
  active: boolean;
}

interface AuthCtxValue {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ data: unknown; error: string | null }>;
  signUp: (name: string, email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthCtx = createContext<AuthCtxValue>({
  user: null,
  loading: true,
  signIn: async () => ({ data: null, error: null }),
  signUp: async () => ({ error: null }),
  signOut: async () => { },
  logout: async () => { },
});

// Tenta buscar o perfil real do banco com timeout de 6s.
// Se o banco não responder (projeto pausado / RLS bloqueando / rede lenta),
// cai no fallback baseado no metadata do auth.users — sem travar a UI.
async function fetchProfile(authUser: SupabaseAuthUser): Promise<User> {
  const email  = authUser.email ?? '';
  const authId = authUser.id;
  const meta   = authUser.user_metadata ?? {};

  const fallback: User = {
    id:      authId,
    name:    (meta.full_name as string | undefined) ?? email.split('@')[0],
    email,
    role:    typeof meta.role === 'string' ? meta.role : 'SDR',
    active:  true,
    team_id: null,
  };

  const dbFetch = async (): Promise<User> => {
    try {
      // 1. Por email (não depende de UUID matching entre auth.uid() e users.id)
      const { data: byEmail } = await supabase
        .from('users')
        .select('id,name,email,role,team_id,active')
        .eq('email', email)
        .maybeSingle();
      if (byEmail) {
        console.log('[fetchProfile] OK por email. role:', (byEmail as User).role);
        return byEmail as User;
      }

      // 2. Por id = auth.uid() (caso o row tenha sido criado com o UUID do auth)
      const { data: byId } = await supabase
        .from('users')
        .select('id,name,email,role,team_id,active')
        .eq('id', authId)
        .maybeSingle();
      if (byId) {
        console.log('[fetchProfile] OK por id. role:', (byId as User).role);
        return byId as User;
      }
    } catch (err) {
      console.warn('[fetchProfile] Exceção na query:', err);
    }
    console.warn('[fetchProfile] Sem linha no banco. Fallback role:', fallback.role);
    return fallback;
  };

  // Corrida entre a query real e o timeout — quem chegar primeiro vence
  const timeoutFallback = new Promise<User>(resolve =>
    setTimeout(() => {
      console.warn('[fetchProfile] Timeout 6s — usando fallback para desbloquear UI.');
      resolve(fallback);
    }, 6000)
  );

  return Promise.race([dbFetch(), timeoutFallback]);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Impede chamadas concorrentes ao fetchProfile (ex: TOKEN_REFRESHED disparando
  // ao mesmo tempo que INITIAL_SESSION / SIGNED_IN)
  const fetchingRef = useRef(false);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { data: null, error: error.message };
      return { data, error: null };
    } catch (err: unknown) {
      return { data: null, error: err instanceof Error ? err.message : 'Erro desconhecido' };
    }
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  useEffect(() => {
    let mounted = true;

    // Segurança absoluta: se após 10s o loading ainda for true, desbloqueia.
    // Cobre edge-cases onde onAuthStateChange nunca dispara (ex: erro de rede total).
    const safetyTimer = setTimeout(() => {
      if (mounted) {
        console.error('[AuthContext] Safety timer — loading forçado para false após 10s.');
        setLoading(false);
      }
    }, 10_000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('[AuthContext] evento:', event, '| email:', session?.user?.email ?? 'null');

        // TOKEN_REFRESHED só atualiza o token JWT — não altera o perfil.
        // Ignorar evita re-fetches desnecessários e possível loop.
        if (event === 'TOKEN_REFRESHED') {
          console.log('[AuthContext] TOKEN_REFRESHED ignorado.');
          return;
        }

        if (!session?.user) {
          if (mounted) {
            setUser(null);
            setLoading(false);
          }
          return;
        }

        // Lock: se já tem uma busca em andamento, não inicia outra
        if (fetchingRef.current) {
          console.log('[AuthContext] fetchProfile já em andamento, pulando.');
          return;
        }

        fetchingRef.current = true;
        try {
          const profile = await fetchProfile(session.user);
          if (mounted) {
            setUser(profile);
            console.log('[AuthContext] Usuário setado. role:', profile.role);
          }
        } catch (err) {
          console.error('[AuthContext] Erro crítico no fetchProfile:', err);
          if (mounted) setUser(null);
        } finally {
          fetchingRef.current = false;
          if (mounted) {
            setLoading(false);
            clearTimeout(safetyTimer);
          }
        }
      }
    );

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthCtx.Provider value={{ user, loading, signIn, signUp, signOut, logout: signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  return useContext(AuthCtx);
}
