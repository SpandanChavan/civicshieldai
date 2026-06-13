import { useState, useEffect, createContext, useContext } from 'react';
import { supabase } from '@/services/supabaseClient';

// ── Auth Context ──────────────────────────────────────────────────────
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]     = useState(null);
  const [role, setRole]     = useState(null);  // 'citizen' | 'coordinator' | 'responder'
  const [loading, setLoading] = useState(true);

  const fetchRole = async (userId) => {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', userId)
      .single();
    if (error) {
      console.warn('[Auth] Could not fetch role:', error.message);
      return 'citizen';
    }
    return data?.role || 'citizen';
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        const r = await fetchRole(session.user.id);
        setRole(r);
      }
      setLoading(false);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          setUser(session.user);
          const r = await fetchRole(session.user.id);
          setRole(r);
        } else {
          setUser(null);
          setRole(null);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider value={{ user, role, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
