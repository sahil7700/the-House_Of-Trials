"use client";

import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { PlayerData, subscribeToPlayer } from "@/lib/services/player-service";
import { subscribeToGameState, GameState } from "@/lib/services/game-service";
import { useRouter } from "next/navigation";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function EliminatedPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [player, setPlayer] = useState<PlayerData | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [reviving, setReviving] = useState(false);
  const [revived, setRevived] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push("/join");
      return;
    }
    const unsubPlayer = subscribeToPlayer(user.uid, (p) => {
      setPlayer(p);
      // If player status is no longer eliminated, redirect to lobby
      if (p && p.status === "alive") {
        router.push("/lobby");
      }
    });
    const unsubGame = subscribeToGameState(setGameState);
    return () => {
      unsubPlayer();
      unsubGame();
    };
  }, [user, loading, router]);

  const handleClaimWildCard = async () => {
    if (!user) return;
    setReviving(true);
    try {
      await updateDoc(doc(db, "players", user.uid), {
        status: "alive",
        currentSubmission: null,
        submittedAt: null,
      });
      setRevived(true);
      // The subscribeToPlayer callback above will detect status change and redirect
    } catch (e) {
      console.error(e);
    }
    setReviving(false);
  };

  if (loading || !player) return <div className="min-h-screen bg-[#0a0a0f]" />;

  const wildEntryOpen = gameState?.wildEntryOpen === true;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#0a0a0f] text-textDefault relative overflow-hidden">
      
      <div className="absolute inset-0 bg-primary/20 pointer-events-none mix-blend-overlay" />
      <div className="absolute inset-0 bg-scanlines pointer-events-none opacity-50" />

      <motion.div 
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1 }}
        className="z-10 text-center space-y-8 max-w-md w-full"
      >
        <div className="text-6xl text-primary drop-shadow-glow-red animate-pulse">♠</div>
        
        <h1 className="text-5xl sm:text-7xl font-serif tracking-widest text-primary drop-shadow-glow-red uppercase mt-4 mb-2">
          Game Over
        </h1>
        
        <p className="font-mono text-textMuted tracking-wider uppercase text-sm">
          You have been eliminated from the House of Trials.
        </p>

        <div className="border border-border bg-surface p-6 mt-8 space-y-4">
          <p className="font-mono text-xs text-textMuted uppercase tracking-widest border-b border-border pb-2">Final Statistics</p>
          <div className="flex justify-between">
            <span className="text-textMuted font-mono">Player:</span>
            <span className="text-textDefault font-mono">{player.playerId}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-textMuted font-mono">Status:</span>
            <span className="text-primary font-mono font-bold tracking-widest uppercase">Eliminated</span>
          </div>
          <div className="flex justify-between">
            <span className="text-textMuted font-mono">Points:</span>
            <span className="text-textDefault font-mono">{player.points ?? 0}</span>
          </div>
        </div>

        {/* Wild Card Re-Entry Section */}
        <AnimatePresence>
          {wildEntryOpen && !revived && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="border border-secondary/60 bg-secondary/10 p-6 space-y-4"
            >
              <div className="text-secondary text-2xl">⚡</div>
              <p className="font-mono text-secondary text-xs uppercase tracking-widest font-bold">Wild Card Entry Open</p>
              <p className="font-mono text-textMuted text-sm">
                The admin has opened a Wild Card window. You can re-enter the game and rejoin as an alive player.
              </p>
              <button
                onClick={handleClaimWildCard}
                disabled={reviving}
                className="w-full py-3 bg-secondary/20 border-2 border-secondary text-secondary font-mono tracking-widest uppercase transition-all hover:bg-secondary hover:text-background shadow-glow-gold disabled:opacity-50"
              >
                {reviving ? "Reviving..." : "⚡ CLAIM WILD CARD RE-ENTRY"}
              </button>
            </motion.div>
          )}
          {revived && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="border border-secondary bg-secondary/20 p-4 text-secondary font-mono text-sm uppercase tracking-widest animate-pulse"
            >
              ✓ Revived! Redirecting to lobby...
            </motion.div>
          )}

          {gameState?.phase === "game_over" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="border-2 border-secondary bg-secondary/5 p-6 space-y-4"
            >
              <h2 className="text-secondary font-serif text-2xl uppercase tracking-widest">Tournament Concluded</h2>
              <p className="text-textMuted text-xs font-mono uppercase">A Champion has been crowned.</p>
              <div className="py-2 px-4 bg-secondary/20 inline-block">
                  <span className="text-secondary font-bold tracking-widest">VICTORY ASCENDED</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="pt-4 space-y-8">
          <p className="font-serif text-sm italic text-textMuted/60">
            &quot;The game does not forgive errors.&quot;
          </p>

          <Link href="/admin/display" className="inline-block border border-textMuted/30 px-6 py-3 font-mono text-xs text-textMuted hover:text-textDefault hover:border-textDefault transition-colors uppercase tracking-widest">
            Watch Spectator View
          </Link>
        </div>

      </motion.div>
    </main>
  );
}
