// Stub used by jest's moduleNameMapper for `src/lib/supabase`. Pure-logic
// tests never call into it; they just need the module-load to succeed
// without an EXPO_PUBLIC_SUPABASE_URL env var.
module.exports = {
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
      upsert: () => Promise.resolve({ error: null }),
      delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
      insert: () => Promise.resolve({ error: null }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
    storage: {
      from: () => ({
        createSignedUrl: () => Promise.resolve({ data: null, error: null }),
        upload: () => Promise.resolve({ error: null }),
      }),
    },
    auth: {
      getUser: () => Promise.resolve({ data: { user: null } }),
    },
  },
};
