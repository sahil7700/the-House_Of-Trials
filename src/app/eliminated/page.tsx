"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { PlayerData, subscribeToPlayer } from "@/lib/services/player-service";
import { useRouter } from "next/navigation";

export default function EliminatedPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [player, setPlayer] = useState<PlayerData | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push("/join");
      return;
    }
    const unsub = subscribeToPlayer(user.uid, (p) => {
      setPlayer(p);
      if (p && p.status !== "eliminated") {
        router.push("/lobby"); // Should not be here if not eliminated
      }
    });
    return () => unsub();
  }, [user, loading, router]);

  if (loading || !player) return <div className="min-h-screen bg-[#0a0a0f]" />;

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
            <span className="text-textMuted font-mono">Your Number:</span>
            <span className="text-textDefault font-mono">{player.currentSubmission ?? "—"}</span>
          </div>
          <div className="flex justify-between">
             {/* If we stored target distance we could display it, otherwise omitted for brevity since it was shown on reveal */}
            <span className="text-textMuted font-mono">Status:</span>
            <span className="text-primary font-mono font-bold tracking-widest uppercase">Deceased</span>
          </div>
        </div>

        <div className="pt-12 space-y-8">
          <p className="font-serif text-sm italic text-textMuted/60">
            "The game does not forgive errors."
          </p>

          <Link href="/admin/display" className="inline-block border border-textMuted/30 px-6 py-3 font-mono text-xs text-textMuted hover:text-textDefault hover:border-textDefault transition-colors uppercase tracking-widest">
            Watch Spectator View
          </Link>
        </div>

      </motion.div>
    </main>
  );
}
