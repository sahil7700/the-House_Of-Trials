"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { registerPlayer } from "@/lib/services/player-service";
import { subscribeToGameState, GameState } from "@/lib/services/game-service";
import { motion } from "framer-motion";

export default function JoinPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [college, setCollege] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [checkingState, setCheckingState] = useState(true);

  const [authStateReady, setAuthStateReady] = useState(false);

  useEffect(() => {
    let active = true;
    import("@/lib/firebase").then(({ auth, signInAnonymously }) => {
      import("@/lib/services/player-service").then(({ getPlayer }) => {
        const checkAuth = async () => {
          let attempts = 0;
          let currentUser = auth.currentUser;
          while (!currentUser && attempts < 5) {
            await new Promise(r => setTimeout(r, 200));
            currentUser = auth.currentUser;
            attempts++;
          }
          
          if (!currentUser && active) {
            try {
              const cred = await signInAnonymously(auth);
              currentUser = cred.user;
            } catch (e) {
              console.error("Auth error:", e);
            }
          }

          if (currentUser && active) {
            try {
              const p = await getPlayer(currentUser.uid);
              if (p) {
                if (p.status === "eliminated") router.push("/eliminated");
                else router.push("/lobby");
                return;
              }
            } catch (e) {
              console.error("Player fetch error:", e);
            }
          }
          
          if (active) {
            setAuthStateReady(true);
          }
        };
        checkAuth();
      });
    });

    return () => { active = false; };
  }, [router]);

  useEffect(() => {
    if (!authStateReady) return;

    const unsub = subscribeToGameState((state) => {
      setGameState(state);
      setCheckingState(false);
    });
    
    return () => unsub();
  }, [authStateReady]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !college) return;

    setLoading(true);
    setError("");

    try {
      const isWildCard = !isFirstLobby && isWildEntryOpen;
      await registerPlayer(name, college, phone, isWildCard);
      router.push("/lobby");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to register. Please try again.");
      setLoading(false);
    }
  };

  // Determine if registration is currently allowed
  const isFirstLobby = gameState?.phase === "lobby" && gameState?.currentSlot === 1;
  const isWildEntryOpen = gameState?.wildEntryOpen === true;
  const canRegister = isFirstLobby || isWildEntryOpen;

  if (checkingState) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background">
        <p className="font-mono text-textMuted uppercase tracking-widest animate-pulse">Checking access...</p>
      </main>
    );
  }

  // Registration closed — not first lobby and no wild entry
  if (!canRegister) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-background bg-scanlines relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm bg-surface border border-primary/50 p-8 text-center relative z-10 shadow-glow-red"
        >
          <div className="text-primary text-5xl mb-6">⛔</div>
          <h1 className="text-xl font-serif text-primary tracking-widest uppercase mb-3">Registration Closed</h1>
          <p className="text-sm text-textMuted font-mono">
            The game is already in progress. New registrations are not allowed.
          </p>
          {gameState?.wildEntryOpen === false && (
            <p className="text-xs text-textMuted/50 font-mono mt-4">
              Only the admin can open a Wild Card Entry window.
            </p>
          )}
        </motion.div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-scanlines relative">
      <div className="absolute inset-0 bg-background mix-blend-overlay pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-surface border border-border p-8 shadow-[0_0_8px_rgba(192,57,43,0.1)] relative z-10"
      >
        <div className="text-center mb-8">
          {isWildEntryOpen && !isFirstLobby && (
            <div className="mb-4 px-3 py-1 border border-secondary/50 bg-secondary/10 text-secondary text-xs font-mono uppercase tracking-widest inline-block">
              ⚡ Wild Card Entry Open
            </div>
          )}
          <h1 className="text-3xl font-serif text-textDefault tracking-widest uppercase mb-2">Registration</h1>
          <p className="text-sm text-textMuted font-mono">Input requested. Identify yourself.</p>
        </div>

        {error && (
          <div className="mb-6 p-3 border border-primary/50 bg-primary/10 text-primary text-sm font-mono">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs tracking-widest text-textMuted uppercase font-mono">Full Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-background border border-border px-4 py-3 text-textDefault font-mono focus:outline-none focus:border-secondary focus:shadow-glow-gold transition-all"
              placeholder="e.g. Arisu Ryohei"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs tracking-widest text-textMuted uppercase font-mono">College / Department</label>
            <input
              type="text"
              required
              value={college}
              onChange={(e) => setCollege(e.target.value)}
              className="w-full bg-background border border-border px-4 py-3 text-textDefault font-mono focus:outline-none focus:border-secondary focus:shadow-glow-gold transition-all"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs tracking-widest text-textMuted uppercase font-mono">Phone Number (Optional)</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full bg-background border border-border px-4 py-3 text-textDefault font-mono focus:outline-none focus:border-secondary focus:shadow-glow-gold transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 mt-4 bg-primary/10 border-2 border-primary text-primary font-mono tracking-widest uppercase transition-all duration-300 hover:bg-primary hover:text-white hover:shadow-[0_0_20px_rgba(192,57,43,0.6)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Registering..." : "Submit"}
          </button>
        </form>
      </motion.div>
    </main>
  );
}
