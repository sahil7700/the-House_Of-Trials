"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { subscribeToGameState, GameState } from "@/lib/services/game-service";
import { PlayerData, subscribeToPlayer } from "@/lib/services/player-service";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { motion } from "framer-motion";

const FLAVOUR_TEXTS = [
  "The game does not care about your feelings.",
  "Survive. That is the only rule.",
  "Trust no one. Not even your own instincts.",
  "Every second brings you closer to the end.",
  "There is no salvation here. Only survival."
];

export default function LobbyPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  
  const [player, setPlayer] = useState<PlayerData | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [flavourText, setFlavourText] = useState(FLAVOUR_TEXTS[0]);
  const [aliveCount, setAliveCount] = useState(0);
  const [submittedCount, setSubmittedCount] = useState(0);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/join");
      return;
    }

    const unsubPlayer = subscribeToPlayer(user.uid, (p) => {
      setPlayer(p);
      if (p && p.status === "eliminated") router.push("/eliminated");
      if (p && p.status === "winner") router.push("/winner");
    });

    const unsubGame = subscribeToGameState((state) => {
      setGameState(state);
      if (state && state.phase === "active") {
        router.push("/game");
      }
    });

    const unsubPlayers = onSnapshot(query(collection(db, "players")), (snap) => {
      const all = snap.docs.map(d => d.data() as PlayerData);
      setAliveCount(all.filter(p => p.status === "alive").length);
      setSubmittedCount(all.filter(p => p.status === "alive" && p.currentSubmission !== null).length);
    });

    return () => {
      unsubPlayer();
      unsubGame();
      unsubPlayers();
    };
  }, [user, authLoading, router]);

  useEffect(() => {
    const interval = setInterval(() => {
      setFlavourText(FLAVOUR_TEXTS[Math.floor(Math.random() * FLAVOUR_TEXTS.length)]);
    }, 7000);
    return () => clearInterval(interval);
  }, []);

  if (authLoading || !player) {
    return <div className="min-h-screen bg-background flex items-center justify-center font-mono text-primary text-sm tracking-widest uppercase">Connecting...</div>;
  }

  const getStatusMessage = () => {
    if (!gameState) return "System offline.";
    if (gameState.phase === "standby") return gameState.displayMessage || "Stand by. Do not close this window.";
    if (gameState.phase === "lobby") return gameState.currentRoundTitle ? `Waiting for: ${gameState.currentRoundTitle}` : "Waiting for players to join...";
    return `Preparing: ${gameState.currentRoundTitle || "Next Trial"}`;
  };

  return (
    <main className="min-h-screen flex flex-col p-6 bg-scanlines bg-background text-textDefault relative overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-start z-10">
        <div>
          <h2 className="font-mono text-textMuted text-xs tracking-widest uppercase pb-1">Identification</h2>
          <p className="font-serif text-2xl drop-shadow-glow-gold">{player.name}</p>
          <p className="font-mono text-secondary mt-1 tracking-widest">{player.playerId}</p>
        </div>
        
        <div className="text-right">
          <div className="inline-block px-3 py-1 border border-secondary text-secondary font-mono uppercase text-xs shadow-glow-gold tracking-widest">
            {player.status === "waiting" ? "Standing By" : player.status}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-grow flex flex-col justify-center items-center z-10 mt-12 w-full max-w-2xl mx-auto space-y-12 text-center">
        
        {/* Animated Card Loader */}
        <div className="relative w-24 h-32 border border-border bg-surface flex items-center justify-center">
          <motion.div 
            animate={{ rotateY: 360 }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
            className="text-4xl text-primary"
          >
            ♠
          </motion.div>
        </div>

        {/* Global Status */}
        <div className="space-y-4">
          <p className="font-mono text-secondary tracking-widest uppercase text-sm animate-pulse shadow-glow-gold">
            {getStatusMessage()}
          </p>
          
          <div className="pt-8">
            <p className="text-textMuted font-mono text-xs tracking-widest uppercase mb-2">Players Alive</p>
            <p className="font-serif text-6xl text-textDefault drop-shadow-[0_0_15px_rgba(232,232,240,0.3)]">
              {aliveCount}
            </p>
          </div>

          {gameState?.phase === "active" && (
            <div className="pt-4">
              <p className="text-textMuted font-mono text-xs tracking-widest uppercase mb-1">Submissions</p>
              <p className="font-serif text-2xl text-secondary">{submittedCount} / {aliveCount}</p>
              <div className="w-48 mx-auto bg-surface border border-border h-1.5 mt-2 overflow-hidden">
                <div
                  className="h-full bg-secondary transition-all duration-500"
                  style={{ width: `${aliveCount > 0 ? (submittedCount / aliveCount) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Footer Text */}
      <div className="z-10 mt-auto text-center pt-12 pb-6 w-full max-w-xl mx-auto">
        <p className="font-serif text-textMuted/60 text-lg italic transition-opacity duration-1000">
          "{flavourText}"
        </p>
      </div>

    </main>
  );
}
