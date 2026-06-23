import { useState, useEffect, createContext, useContext } from 'react';
import { supabase } from '@/services/supabaseClient';

// ── Auth Context ──────────────────────────────────────────────────────
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [role, setRole]       = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId) => {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('role, state_id, full_name, emergency_contacts, states(id, name, code, bbox_north, bbox_south, bbox_east, bbox_west)')
      .eq('id', userId)
      .single();
    if (error) {
      console.warn('[Auth] Could not fetch profile:', error.message);
      return null;
    }
    return data;
  };

  useEffect(() => {
    // ── Initial session load ─────────────────────────────────
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        const prof = await fetchProfile(session.user.id);
        if (prof) {
          setRole(prof.role);
          setProfile(prof);
        }
      }
      // Only mark loading done AFTER profile is fetched
      setLoading(false);
    });

    // ── Auth state changes (login / logout) ──────────────────
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          // Set user immediately so UI knows someone is logged in
          setUser(session.user);
          // Fetch profile BEFORE clearing loading — this is the critical fix.
          // Previously setLoading(false) was called before fetchProfile resolved,
          // causing LoginPage to redirect with role=null → defaulting to /portal.
          const prof = await fetchProfile(session.user.id);
          if (prof) {
            setRole(prof.role);
            setProfile(prof);
          } else {
            // Profile missing — still allow app to proceed
            setRole('citizen');
          }
        } else {
          setUser(null);
          setRole(null);
          setProfile(null);
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
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, role, profile, loading, signOut }}>
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
