import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { User as SupabaseAuthUser } from '@supabase/supabase-js';
import { supabase } from './supabase/client';

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  extra_roles: string[];
  team_id: string | null;
  active: boolean;
}

/** Verifica se o usuário tem um determinado cargo (primário ou extra) */
export function hasRole(user: User | null, role: string): boolean {
  if (!user) return false;
  return user.role === role || (user.extra_roles ?? []).includes(role);
}

/** Verifica se o usuário tem pelo menos um dos cargos listados */
export function hasAnyRole(user: User | null, roles: string[]): boolean {
  return roles.some(r => hasRole(user, r));
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

async function fetchProfile(authUser: SupabaseAuthUser): Promise<User> {
  const email  = authUser.email ?? '';
  const authId = authUser.id;
  const meta   = authUser.user_metadata ?? {};

  const fallback: User = {
    id:          authId,
    name:        (meta.full_name as string | undefined) ?? email.split('@')[0],
    email,
    role:        typeof meta.role === 'string' ? meta.role : 'SDR',
    extra_roles: [],
    active:      true,
    team_id:     null,
  };

  const dbFetch = async (): Promise<User> => {
    try {
      const { data: byEmail } = await supabase
        .from('users')
        .select('id,name,email,role,extra_roles,team_id,active')
        .eq('email', email)
        .maybeSingle();
      if (byEmail) {
        const u = byEmail as any;
        return { ...u, extra_roles: u.extra_roles ?? [] };
      }

      const { data: byId } = await supabase
        .from('users')
        .select('id,name,email,role,extra_roles,team_id,active')
        .eq('id', authId)
        .maybeSingle();
      if (byId) {
        const u = byId as any;
        return { ...u, extra_roles: u.extra_roles ?? [] };
      }
    } catch (err) {
      console.warn('[fetchProfile] Exceção na query:', err);
    }
    return fallback;
  };

  const timeoutFallback = new Promise<User>(resolve =>
    setTimeout(() => resolve(fallback), 6000)
  );

  return Promise.race([dbFetch(), timeoutFallback]);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchingRef   = useRef(false);
  const loadedAuthId  = useRef<string | null>(null); // auth UID já carregado

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
    loadedAuthId.current = null;
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  useEffect(() => {
    let mounted = true;
    const safetyTimer = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 10_000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT') {
          loadedAuthId.current = null;
          if (mounted) { setUser(null); setLoading(false); }
          return;
        }

        if (!session?.user) {
          if (mounted) { setUser(null); setLoading(false); }
          return;
        }

        // Se já temos o perfil deste auth UID carregado, não sobrescreve.
        // Evita que TOKEN_REFRESHED ou SIGNED_IN duplicado apague o role correto.
        if (loadedAuthId.current === session.user.id) {
          if (mounted) setLoading(false);
          return;
        }

        if (fetchingRef.current) return;
        fetchingRef.current = true;
        try {
          const profile = await fetchProfile(session.user);
          if (mounted) {
            setUser(profile);
            loadedAuthId.current = session.user.id;
          }
        } catch (err) {
          if (mounted) setUser(null);
        } finally {
          fetchingRef.current = false;
          if (mounted) { setLoading(false); clearTimeout(safetyTimer); }
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
