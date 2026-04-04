"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { subscribeToGameState, subscribeToEventConfig, submitGameInput, GameState, EventConfig } from "@/lib/services/game-service";
import { getPlayer, subscribeToPlayer, PlayerData } from "@/lib/services/player-service";
import { motion, AnimatePresence } from "framer-motion";

// Dynamic Imports
import GameA1 from "./components/GameA1";
import GameA2 from "./components/GameA2";
import GameA3 from "./components/GameA3";
import GameA4 from "./components/GameA4";
import GameB7 from "./components/GameB7";
import GameC10 from "./components/GameC10";
import OfflineGame from "./components/OfflineGame";

export default function GameUI() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [eventConfig, setEventConfig] = useState<EventConfig | null>(null);
  const [player, setPlayer] = useState<PlayerData | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/join");
      return;
    }

    const unsubGame = subscribeToGameState(setGameState);
    const unsubConfig = subscribeToEventConfig(setEventConfig);
    const unsubPlayer = subscribeToPlayer(user.uid, setPlayer);

    return () => {
      unsubGame();
      unsubConfig();
      unsubPlayer();
    };
  }, [user, authLoading, router]);

  useEffect(() => {
    if (gameState?.phase === "lobby" || gameState?.phase === "standby") {
      router.push("/lobby");
    }
    if (gameState?.phase === "reveal" && player?.status === "eliminated") {
       setTimeout(() => router.push("/eliminated"), 3000); 
    }
  }, [gameState?.phase, player?.status, router]);

  useEffect(() => {
    if (!gameState || gameState.phase !== "active" || !gameState.timerStartedAt) {
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
      }
    }, 500);

    return () => clearInterval(interval);
  }, [gameState]);

  if (authLoading || !gameState || !player || !eventConfig) {
    return <div className="min-h-screen bg-background flex items-center justify-center font-mono text-textMuted uppercase tracking-widest">Loading...</div>;
  }

  const currentSlotConfig = eventConfig.slots.find(s => s.slotNumber === gameState.currentSlot);
  if (!currentSlotConfig) return <div>Invalid Slot Configuration</div>;

  const handleSubmission = async (val: any) => {
    if (!user) return;
    await submitGameInput(user.uid, player.name, gameState.currentSlot, gameState.currentGameId, val);
  };

  const isLocked = gameState.phase === "locked" || gameState.phase === "calculating" || gameState.phase === "reveal" || gameState.phase === "confirm";

  const renderGameLogic = () => {
     const commonProps = {
        onSubmit: handleSubmission,
        isLocked,
        currentSubmission: player.currentSubmission ?? null,
        results: gameState.phase === "reveal" || gameState.phase === "confirm" ? gameState.results : null
     };

     switch (gameState.currentGameId) {
       case "A1": return <GameA1 {...commonProps} />;
       case "A2": return <GameA2 {...commonProps} />;
       case "A3": return <GameA3 {...commonProps} />;
       case "A4": return <GameA4 {...commonProps} />;
       case "B7": return <GameB7 {...commonProps} />;
       case "C10": return <GameC10 {...commonProps} />;
       default: return <OfflineGame isLocked={isLocked} gameName={currentSlotConfig.gameName} />;
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

        {timeLeft !== null && gameState.phase === "active" && (
          <div className="text-center">
             <span className={`text-4xl font-bold font-mono tracking-widest ${timeLeft <= 5 ? "text-primary animate-pulse" : "text-textDefault"}`}>
               {timeLeft < 10 ? `0${timeLeft}` : timeLeft}
             </span>
             <span className="block text-[10px] text-textMuted uppercase tracking-widest">Seconds</span>
          </div>
        )}

        <div className="text-right">
          <span className="text-textMuted text-[10px] uppercase tracking-widest block">Slot {gameState.currentSlot}</span>
          <span className="text-primary font-bold uppercase tracking-widest">{currentSlotConfig.gameId}</span>
        </div>
      </header>

      {/* Submission Progress Bar — visible during active phase */}
      {gameState.phase === "active" && (
        <div className="relative z-10 mb-4">
          <div className="flex justify-between text-[10px] uppercase tracking-widest text-textMuted mb-1">
            <span>Submissions</span>
            <span>{gameState.submissionsCount ?? 0} / {gameState.playersAlive} Players</span>
          </div>
          <div className="w-full bg-surface border border-border h-1.5 overflow-hidden">
            <div
              className="h-full bg-secondary transition-all duration-500"
              style={{ width: `${gameState.playersAlive > 0 ? ((gameState.submissionsCount ?? 0) / gameState.playersAlive) * 100 : 0}%` }}
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
        
        {gameState.phase === "reveal" && gameState.results?.eliminatedPlayerIds?.includes(player.id) && (
           <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }} className="fixed inset-0 z-50 bg-[#0a0a0f] border-8 border-primary flex items-center justify-center p-8">
             <div className="text-center space-y-6">
                <div className="text-primary text-6xl drop-shadow-glow-red animate-pulse">☠</div>
                <h1 className="text-primary font-serif uppercase tracking-widest text-4xl sm:text-6xl">Eliminated</h1>
                <p className="text-textMuted">Your journey ends here.</p>
             </div>
           </motion.div>
        )}

        {gameState.phase === "reveal" && !gameState.results?.eliminatedPlayerIds?.includes(player.id) && player.status !== "eliminated" && (
           <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1.5 }} className="fixed inset-0 z-50 bg-secondary/10 flex items-center justify-center pointer-events-none">
             <div className="text-center text-secondary drop-shadow-glow-gold animate-pulse">
                <h1 className="font-serif uppercase tracking-[0.2em] text-4xl">Survived</h1>
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
              {renderGameLogic()}
            </motion.div>
         </AnimatePresence>
      </div>

    </main>
  );
}
