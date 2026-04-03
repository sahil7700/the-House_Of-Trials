"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { GameState, subscribeToGameState, subscribeToPlayer, submitNumber } from "@/lib/services/game-service";
import { PlayerData } from "@/lib/services/player-service";
import { motion, AnimatePresence } from "framer-motion";

export default function GamePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  
  const [player, setPlayer] = useState<PlayerData | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  
  const [inputValue, setInputValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/join");
      return;
    }

    const unsubPlayer = subscribeToPlayer(user.uid, (p) => {
      setPlayer(p);
    });

    const unsubGame = subscribeToGameState((state) => {
      setGameState(state);
      
      // Handle Phase transitions
      if (state && state.phase === "standby") {
        router.push("/lobby");
      }
      if (state && state.phase === "eliminated" && player?.status === "eliminated") {
        router.push("/eliminated");
      }
    });

    return () => {
      unsubPlayer();
      unsubGame();
    };
  }, [user, authLoading, router, player?.status]);

  // Timer logic
  useEffect(() => {
    if (!gameState || !gameState.timerStartedAt || gameState.phase !== "active") return;
    
    const calculateTimeLeft = () => {
      // In JS, Firebase timestamp has .seconds
      const startMs = gameState.timerStartedAt?.seconds ? gameState.timerStartedAt.seconds * 1000 : Date.now();
      const elapsed = Math.floor((Date.now() - startMs) / 1000);
      const remaining = Math.max(0, gameState.timerDuration - elapsed);
      setTimeLeft(remaining);
      
      // Auto-submit if timer hits 0 and not submitted yet
      if (remaining === 0 && player && player.currentSubmission === null && !submitting && gameState.phase === "active") {
        handleAutoSubmit();
      }
    };

    const interval = setInterval(calculateTimeLeft, 1000);
    calculateTimeLeft(); // initial calc
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState?.timerStartedAt, gameState?.timerDuration, gameState?.phase, player?.currentSubmission]);

  // Reveal Phase Eliminated transition
  useEffect(() => {
    if (gameState?.phase === "reveal" && gameState.results && player?.currentSubmission !== null) {
      const isEliminated = gameState.results.eliminatedPlayerIds.includes(player!.id);
      if (isEliminated) {
        const timer = setTimeout(() => {
          router.push("/eliminated");
        }, 5000); // Wait 5 seconds before redirecting to show the red flash
        return () => clearTimeout(timer);
      }
    }
  }, [gameState?.phase, gameState?.results, player, router]);


  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!user || !player || !gameState || submitting || player.currentSubmission !== null) return;
    
    const num = parseInt(inputValue);
    if (isNaN(num) || num < 0 || num > 100) return;

    setSubmitting(true);
    try {
      await submitNumber(user.uid, player.name, gameState.currentGame, num);
    } catch (err) {
      console.error(err);
      setSubmitting(false); // only reset on error, success state binds to player.currentSubmission
    }
  };

  const handleAutoSubmit = () => {
    const random = Math.floor(Math.random() * 101);
    setInputValue(random.toString());
    submitNumber(user!.uid, player!.name, gameState!.currentGame, random);
  };

  if (authLoading || !player || !gameState) {
    return <div className="min-h-screen bg-background" />;
  }

  // Derived state
  const hasSubmitted = player.currentSubmission !== null;
  const isLocked = gameState.phase === "locked" || gameState.phase === "reveal";
  const inReveal = gameState.phase === "reveal" && gameState.results;
  const amIEliminated = inReveal && gameState.results?.eliminatedPlayerIds.includes(player.id);
  
  let screenBg = "bg-background";
  if (inReveal) {
    screenBg = amIEliminated ? "bg-primary/20" : "bg-success/20";
  }

  return (
    <main className={`min-h-screen flex items-center justify-center p-6 ${screenBg} transition-colors duration-1000 relative overflow-hidden bg-scanlines`}>
      
      {/* Decorative overlays */}
      <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent z-0 opacity-80" />
      
      <div className="z-10 w-full max-w-lg space-y-8">
        
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="text-secondary text-3xl mb-4">♦</div>
          <h1 className="text-3xl sm:text-4xl font-serif text-textDefault tracking-widest uppercase mb-2">Game {gameState.currentGame}</h1>
          <h2 className="text-xl font-serif text-textMuted italic tracking-wider">The Average</h2>
        </div>

        {/* Instructions */}
        <div className="text-center border-y border-border py-4 my-8">
          <p className="font-mono text-sm text-textMuted px-4 leading-relaxed">
            Enter a number from 0 to 100.
            <br />
            The target is <span className="text-secondary">2/3 of the group average</span>.
            <br />
            Farthest from the target is <span className="text-primary font-bold">eliminated</span>.
          </p>
        </div>

        {/* Phase: Active / Locked Input */}
        {!inReveal && (
          <div className="space-y-6">
            
            {/* Countdown */}
            {!isLocked && (
              <div className="text-center">
                <p className="font-mono text-xs uppercase tracking-widest text-textMuted mb-2">Time Remaining</p>
                <p className={`font-mono text-6xl ${timeLeft <= 5 ? "text-primary animate-pulse" : "text-textDefault"}`}>
                  {timeLeft.toString().padStart(2, '0')}
                </p>
              </div>
            )}

            {isLocked && (
               <div className="text-center py-4">
                 <p className="font-mono text-primary tracking-widest text-xl uppercase animate-pulse">Submissions Locked</p>
               </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <input 
                type="number"
                min="0"
                max="100"
                required
                disabled={hasSubmitted || isLocked || submitting}
                value={hasSubmitted ? player.currentSubmission! : inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className="w-full text-center text-5xl font-mono bg-surface border-2 border-border py-8 text-textDefault shadow-[inner_0_0_20px_rgba(0,0,0,0.5)] focus:border-secondary focus:outline-none focus:shadow-glow-gold transition-colors disabled:opacity-50"
                placeholder="—"
              />
              
              <button 
                type="submit"
                disabled={hasSubmitted || isLocked || submitting || inputValue === ""}
                className={`w-full py-5 font-mono tracking-widest uppercase transition-all duration-300 text-lg border-2
                  ${hasSubmitted 
                    ? "bg-secondary text-surface border-secondary shadow-glow-gold cursor-default" 
                    : "bg-primary/10 border-primary text-primary hover:bg-primary hover:text-textDefault shadow-glow-red hover:shadow-[0_0_20px_rgba(192,57,43,0.6)]"} 
                  disabled:opacity-50`}
              >
                {hasSubmitted ? "Submitted ✓" : "Submit"}
              </button>
            </form>
          </div>
        )}

        {/* Phase: Reveal */}
        <AnimatePresence>
          {inReveal && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-surface border border-border p-8 space-y-6 text-center relative shadow-2xl"
            >
               {/* Result overlay highlight */}
               <div className={`absolute inset-0 border-2 pointer-events-none ${amIEliminated ? 'border-primary shadow-glow-red' : 'border-success'}`} />

               <h3 className="font-serif text-2xl mb-8 tracking-widest uppercase text-textDefault">Results</h3>
               
               <div className="space-y-4 font-mono text-sm">
                  <div className="flex justify-between border-b border-border pb-2">
                    <span className="text-textMuted">Group Average:</span>
                    <span className="text-textDefault">{gameState.results?.average.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between border-b border-border pb-2">
                    <span className="text-textMuted">Target (2/3):</span>
                    <span className="text-secondary text-base">{gameState.results?.target.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between border-b border-border pb-2 pt-4">
                    <span className="text-textMuted">Your Number:</span>
                    <span className="text-textDefault text-lg">{player.currentSubmission}</span>
                  </div>
                  <div className="flex justify-between border-b border-border pb-2">
                    <span className="text-textMuted">Your Distance:</span>
                    <span className="text-textDefault">
                      {player.currentSubmission !== null && gameState.results?.target 
                        ? Math.abs(player.currentSubmission - gameState.results.target).toFixed(2) 
                        : "—"}
                    </span>
                  </div>
               </div>

               <div className="pt-8">
                 {amIEliminated ? (
                   <motion.div 
                     initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                     className="text-primary font-serif text-3xl tracking-widest uppercase drop-shadow-glow-red animate-pulse"
                   >
                     You Have Been<br/>Eliminated
                   </motion.div>
                 ) : (
                   <motion.div 
                     initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                     className="text-success font-serif text-3xl tracking-widest uppercase drop-shadow-[0_0_10px_rgba(26,122,74,0.5)]"
                   >
                     You Survived
                   </motion.div>
                 )}
               </div>
            </motion.div>
          )}
        </AnimatePresence>
        
      </div>
    </main>
  );
}
