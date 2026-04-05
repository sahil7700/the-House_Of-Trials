"use client";

import { useEffect, useState, useRef } from "react";
import PostGameTracker from "./components/PostGameTracker";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { subscribeToGameState, subscribeToEventConfig, submitGameInput, GameState, EventConfig } from "@/lib/services/game-service";
import { subscribeToPlayer, PlayerData } from "@/lib/services/player-service";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { motion, AnimatePresence } from "framer-motion";

// Dynamic Imports
import GameA1 from "./components/GameA1";
import GameA2 from "./components/GameA2";
import GameA3 from "./components/GameA3";
import GameA4 from "./components/GameA4";
import GameB6 from "./components/GameB6";
import GameB7 from "./components/GameB7";
import GameB8 from "./components/GameB8";
import GameC9 from "./components/GameC9";
import GameC10 from "./components/GameC10";
import GameLemons from "./components/GameLemons";
import GameSilence from "./components/GameSilence";
import OfflineGame from "./components/OfflineGame";

export default function GameUI() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [eventConfig, setEventConfig] = useState<EventConfig | null>(null);
  const [player, setPlayer] = useState<PlayerData | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [liveAliveCount, setLiveAliveCount] = useState(0);
  const [liveSubmittedCount, setLiveSubmittedCount] = useState(0);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/join");
      return;
    }

    const unsubGame = subscribeToGameState(setGameState);
    const unsubConfig = subscribeToEventConfig(setEventConfig);
    const unsubPlayer = subscribeToPlayer(user.uid, setPlayer);

    const unsubPlayers = onSnapshot(query(collection(db, "players")), (snap) => {
      const all = snap.docs.map(d => d.data() as PlayerData);
      setLiveAliveCount(all.filter(p => p.status === "alive").length);
      setLiveSubmittedCount(all.filter(p => p.status === "alive" && p.currentSubmission !== null).length);
    });

    return () => {
      unsubGame();
      unsubConfig();
      unsubPlayer();
      unsubPlayers();
    };
  }, [user, authLoading, router]);

  // Single-fire lock ref for auto-submit triggers
  const autoLockFiredRound = useRef<number>(-1);

  useEffect(() => {
    if (gameState?.phase === "lobby" || gameState?.phase === "standby") {
      router.push("/lobby");
    }
    if (gameState?.phase === "reveal" && player?.status === "eliminated") {
       setTimeout(() => router.push("/eliminated"), 3000); 
    }
  }, [gameState?.phase, player?.status, router]);

  useEffect(() => {
    if (!gameState || !["active", "active_a", "active_b", "open_a", "open_b"].includes(gameState.phase) || !gameState.timerStartedAt) {
      setTimeLeft(null);
      return;
    }

    const interval = setInterval(() => {
      const now = new Date().getTime();
      const start = gameState.timerStartedAt.toDate().getTime();
      const diff = Math.floor((now - start) / 1000);
      const remaining = Math.max(0, gameState.timerDuration - diff);
      setTimeLeft(remaining);

      if (remaining === 0) {
        clearInterval(interval);
        if (autoLockFiredRound.current !== gameState.currentSlot) {
           autoLockFiredRound.current = gameState.currentSlot;
           fetch('/api/game/auto-lock', {
              method: 'POST',
              body: JSON.stringify({ slotNumber: gameState.currentSlot, gameId: gameState.currentGameId })
           }).catch(e => console.error("Auto lock failed:", e));
        }
      }
    }, 500);

    return () => clearInterval(interval);
  }, [gameState]);

  if (authLoading || !gameState || !player || !eventConfig) {
    return <div className="min-h-screen bg-background flex items-center justify-center font-mono text-textMuted uppercase tracking-widest">Loading...</div>;
  }

  const currentSlotConfig = eventConfig.slots.find(s => s.slotNumber === gameState.currentSlot);

  const handleSubmission = async (val: any) => {
    if (!user) return;
    const result = await submitGameInput(user.uid, player.name, gameState.currentSlot, activeGameId, val);
    if (!result.success && !result.duplicate) {
      console.warn("Submission failed:", result.error);
    }
  };

  const isLocked = ["locked", "locked_a", "locked_b", "calculating", "reveal", "confirm"].includes(gameState.phase);

  // Use slot config's gameId as the authoritative game type when a pre-built slot is active.
  // For dynamic rounds (no slot config) fall back to gameState.currentGameId.
  const activeGameId = currentSlotConfig?.gameId || gameState.currentGameId;

  const renderGameLogic = () => {
     const commonProps = {
        onSubmit: handleSubmission,
        isLocked,
        currentSubmission: player.currentSubmission ?? null,
        results: gameState.phase === "reveal" || gameState.phase === "confirm" ? gameState.results : null,
        playerId: player.id,
        customOptions: gameState.customOptions,
        gameSpecificConfig: (gameState as any).gameSpecificConfig,
        timeLeft,
        gameState
     };

     switch (activeGameId) {
       case "A1": return <GameA1 {...commonProps} />;
       case "A2": return <GameA2 {...commonProps} />;
       case "A3": return <GameA3 {...commonProps} />;
       case "A4": return <GameA4 {...commonProps} />;
       case "B6": return <GameB6 {...commonProps} />;
       case "B7": return <GameB7 {...commonProps} />;
       case "B8": return <GameB8 {...commonProps} />;
       case "C9": return <GameC9 {...commonProps} />;
       case "C10": return <GameC10 {...commonProps} />;
       case "LEMONS": return <GameLemons playerId={player.id} gameState={gameState} isLocked={isLocked} />;
       case "SILENCE": return <GameSilence {...commonProps} />;
       default: return <OfflineGame isLocked={isLocked} gameName={gameState?.currentRoundTitle || currentSlotConfig?.gameName || "Physical Trial"} />;
     }
  };

  return (
    <main className="min-h-screen bg-background overflow-hidden relative font-mono flex flex-col p-4 md:p-8">
      {/* Background layer */}
      <div className="absolute inset-0 bg-scanlines mix-blend-overlay opacity-20 pointer-events-none" />

      {/* Header */}
      <header className="relative z-10 flex justify-between items-center bg-surface/80 border border-border p-4 mb-8">
        <div>
          <span className="text-secondary text-sm uppercase tracking-widest font-bold block">{player.playerId}</span>
          <span className="text-textDefault block truncate max-w-[150px]">{player.name}</span>
        </div>

        {timeLeft !== null && ["active", "active_a", "active_b", "open_a", "open_b"].includes(gameState.phase) && (
          <div className="text-center">
             <span className={`text-4xl font-bold font-mono tracking-widest ${timeLeft <= 5 ? "text-primary animate-pulse" : "text-textDefault"}`}>
               {timeLeft < 10 ? `0${timeLeft}` : timeLeft}
             </span>
             <span className="block text-[10px] text-textMuted uppercase tracking-widest">Seconds</span>
          </div>
        )}

        <div className="text-right">
          <span className="text-textMuted text-[10px] uppercase tracking-widest block">{gameState.currentRoundTitle || `Slot ${gameState.currentSlot}`}</span>
          <span className="text-primary font-bold uppercase tracking-widest">{gameState.currentGameId}</span>
        </div>
      </header>

      {/* Submission Progress Bar — visible during active phase */}
      {["active", "active_a", "active_b", "open_a", "open_b"].includes(gameState.phase) && (
        <div className="relative z-10 mb-4">
          <div className="flex justify-between text-[10px] uppercase tracking-widest text-textMuted mb-1">
            <span>Submissions</span>
            <span>{liveSubmittedCount} / {liveAliveCount} Players</span>
          </div>
          <div className="w-full bg-surface border border-border h-1.5 overflow-hidden">
            <div
              className="h-full bg-secondary transition-all duration-500"
              style={{ width: `${liveAliveCount > 0 ? (liveSubmittedCount / liveAliveCount) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Full screen status overlays */}
      <AnimatePresence>
        {gameState.emergencyPause && (
           <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center">
             <h1 className="text-primary font-serif uppercase text-4xl tracking-widest animate-pulse">Emergency Standby</h1>
           </motion.div>
        )}
        
        {gameState.phase === "reveal" && gameState.results?.eliminatedPlayerIds?.includes(player.id) && !["A1", "A2", "A3", "A4", "B6", "B7", "B8", "C9", "C10"].includes(activeGameId) && (
           <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }} className="fixed inset-0 z-50 bg-[#0a0a0f] border-8 border-primary flex items-center justify-center p-8">
             <div className="text-center space-y-6">
                <div className="text-primary text-6xl drop-shadow-glow-red animate-pulse">☠</div>
                <h1 className="text-primary font-serif uppercase tracking-widest text-4xl sm:text-6xl">Eliminated</h1>
                <p className="text-textMuted">Your journey ends here.</p>
             </div>
           </motion.div>
        )}

        {gameState.phase === "reveal" && !gameState.results?.eliminatedPlayerIds?.includes(player.id) && player.status !== "eliminated" && !["A1", "A2", "A3", "A4", "B6", "B7", "B8", "C9", "C10"].includes(activeGameId) && (
           <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1.5 }} className="fixed inset-0 z-50 bg-secondary/10 flex items-center justify-center pointer-events-none">
             <div className="text-center text-secondary drop-shadow-glow-gold animate-pulse">
                <h1 className="font-serif uppercase tracking-[0.2em] text-4xl">Survived</h1>
             </div>
           </motion.div>
        )}

        {/* Phase: Game Over - Tournament Results */}
        {gameState.phase === "game_over" && (
           <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[60] bg-background flex flex-col items-center justify-center p-8 text-center">
             <div className="absolute inset-0 bg-scanlines opacity-20 pointer-events-none" />
             
             {gameState.winnerId === player.id ? (
               <div className="space-y-6">
                 <div className="text-secondary text-7xl drop-shadow-glow-gold animate-bounce">🏆</div>
                 <h1 className="text-5xl font-serif text-secondary tracking-widest uppercase italic">The Winner</h1>
                 <p className="text-textDefault max-w-xs font-mono uppercase tracking-widest bg-secondary/10 border border-secondary p-4 mx-auto">
                   Congratulations, Player {player.playerId}. You are the last one standing.
                 </p>
               </div>
             ) : (
               <div className="space-y-6">
                 <h1 className="text-4xl font-serif text-textMuted tracking-[0.3em] uppercase">Tournament Ended</h1>
                 <p className="text-textMuted text-xs uppercase tracking-widest">Final Status</p>
                 <div className="border border-border p-6 bg-surface space-y-2 min-w-[200px]">
                    <p className="text-textMuted font-mono text-sm">Status: <span className="text-textDefault">FINALIST</span></p>
                    <p className="text-textMuted font-mono text-sm">Total Points: <span className="text-textDefault">{player.points}</span></p>
                 </div>
               </div>
             )}
             
             <div className="mt-12 space-y-2">
                <p className="text-[10px] text-textMuted uppercase tracking-widest">Victory</p>
                <div className="text-secondary text-xl font-bold tracking-widest uppercase">
                   THE CHAMPION HAS BEEN CROWNED
                </div>
             </div>
           </motion.div>
        )}
      </AnimatePresence>

      {/* Main Game Interface Container */}
      <div className="relative z-10 flex-1 flex flex-col justify-center max-w-2xl mx-auto w-full">
         <AnimatePresence mode="wait">
            <motion.div
              key={gameState.currentGameId + gameState.phase}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full"
            >
              {gameState.phase === "confirm" ? (
                <PostGameTracker gameState={gameState} player={player} />
              ) : renderGameLogic()}
            </motion.div>
         </AnimatePresence>
      </div>

    </main>
  );
}
