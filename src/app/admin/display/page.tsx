"use client";

import { useEffect, useState } from "react";
import { GameState, subscribeToGameState } from "@/lib/services/game-service";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PlayerData } from "@/lib/services/player-service";
import { motion, AnimatePresence } from "framer-motion";

export default function AdminDisplay() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    const unsubGame = subscribeToGameState(setGameState);
    const unsubPlayers = onSnapshot(query(collection(db, "players")), (snap) => {
      setPlayers(snap.docs.map(d => d.data() as PlayerData));
    });
    return () => { unsubGame(); unsubPlayers(); };
  }, []);

  useEffect(() => {
    if (!gameState || !gameState.timerStartedAt || gameState.phase !== "active") return;
    const interval = setInterval(() => {
      const startMs = gameState.timerStartedAt?.seconds ? gameState.timerStartedAt.seconds * 1000 : Date.now();
      const elapsed = Math.floor((Date.now() - startMs) / 1000);
      const remaining = Math.max(0, gameState.timerDuration - elapsed);
      setTimeLeft(remaining);
    }, 1000);
    return () => clearInterval(interval);
  }, [gameState]);

  if (!gameState) return <div className="min-h-screen bg-background" />;

  const alivePlayers = players.filter(p => p.status === "alive");
  const totalAlive = alivePlayers.length;
  const submissionsCount = alivePlayers.filter(p => p.currentSubmission !== null).length;
  
  const inReveal = gameState.phase === "reveal" && gameState.results;
  const eliminatedNames = inReveal 
    ? players.filter(p => gameState.results!.eliminatedPlayerIds.includes(p.id)).map(p => p.name)
    : [];

  return (
    <main className="min-h-screen bg-background text-textDefault flex flex-col p-8 overflow-hidden bg-scanlines relative">
      <div className="absolute inset-0 bg-primary/5 pointer-events-none mix-blend-overlay" />
      
      {/* Top Header */}
      <header className="flex justify-between items-start z-10 w-full">
        <div className="space-y-2">
          <h1 className="text-4xl font-serif tracking-widest uppercase text-textDefault drop-shadow-[0_0_10px_rgba(232,232,240,0.5)]">House of Trials</h1>
          <p className="text-xl font-mono text-secondary tracking-widest uppercase shadow-glow-gold">
            Round {gameState.currentRound} <span className="opacity-50 mx-2">|</span> Game {gameState.currentGame}
          </p>
        </div>
        
        <div className="text-right">
          <p className="text-sm font-mono text-textMuted tracking-widest uppercase mb-2">Players Remaining</p>
          <p className="text-6xl font-serif text-textDefault">{totalAlive}</p>
        </div>
      </header>

      {/* Center Screen */}
      <div className="flex-1 flex flex-col items-center justify-center z-10 w-full max-w-5xl mx-auto mt-12 pb-16">
        
        <AnimatePresence mode="wait">
          
          {/* Phase: Active - Timer and Progress */}
          {gameState.phase === "active" && (
            <motion.div 
              key="active"
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="text-center w-full space-y-16"
            >
              <div>
                <motion.p 
                  className={`font-mono text-[12rem] leading-none ${timeLeft <= 10 ? "text-primary drop-shadow-glow-red animate-pulse" : "text-textDefault"}`}
                >
                  {timeLeft.toString().padStart(2, '0')}
                </motion.p>
              </div>

              <div className="w-full max-w-3xl mx-auto space-y-4">
                <div className="flex justify-between font-mono text-xl uppercase tracking-widest text-textMuted">
                  <span>Submissions</span>
                  <span>{submissionsCount} / {totalAlive}</span>
                </div>
                <div className="w-full h-8 bg-surface border-2 border-border p-1">
                  <motion.div 
                    className="h-full bg-secondary shadow-glow-gold"
                    initial={{ width: 0 }}
                    animate={{ width: `${totalAlive > 0 ? (submissionsCount / totalAlive) * 100 : 0}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </div>
            </motion.div>
          )}

          {/* Phase: Locked */}
          {gameState.phase === "locked" && (
            <motion.div 
              key="locked"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="text-center"
            >
              <h2 className="text-8xl font-serif tracking-widest uppercase text-textMuted opacity-50">Submissions Locked</h2>
              <div className="mt-12 text-secondary text-6xl animate-pulse">♦</div>
            </motion.div>
          )}

          {/* Phase: Reveal */}
          {inReveal && (
            <motion.div 
              key="reveal"
              initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1 }}
              className="w-full text-center space-y-16"
            >
              <h2 className="text-5xl font-serif tracking-widest uppercase text-secondary drop-shadow-glow-gold mb-12">Results</h2>
              
              <div className="flex justify-center gap-24 font-mono">
                <div className="text-center">
                  <p className="text-2xl text-textMuted uppercase tracking-widest mb-4">Average</p>
                  <p className="text-6xl text-textDefault">{gameState.results?.average.toFixed(2)}</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl text-textMuted uppercase tracking-widest mb-4">Target (2/3)</p>
                  <p className="text-6xl text-secondary">{gameState.results?.target.toFixed(2)}</p>
                </div>
              </div>

              <motion.div 
                initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 2, duration: 1 }}
                className="mt-20 pt-16 border-t border-border"
              >
                <p className="text-xl font-mono text-textMuted uppercase tracking-widest mb-8">Eliminated</p>
                <div className="space-y-4">
                  {eliminatedNames.map((name, i) => (
                    <p key={i} className="text-7xl font-serif text-primary drop-shadow-glow-red tracking-widest uppercase">
                      {name}
                    </p>
                  ))}
                  {eliminatedNames.length === 0 && (
                    <p className="text-5xl font-serif text-textMuted italic tracking-widest uppercase">
                      Unknown
                    </p>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}

          {/* Phase: Standby or Lobby */}
          {(gameState.phase === "standby" || gameState.phase === "lobby") && (
            <motion.div 
              key="standby"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="text-center"
            >
              <h2 className="text-6xl font-serif tracking-widest uppercase text-textMuted">
                {gameState.displayMessage || "Stand By"}
              </h2>
              <div className="mt-8 text-primary text-4xl animate-bounce">♠</div>
            </motion.div>
          )}
          
        </AnimatePresence>
      </div>
      
    </main>
  );
}
