"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface GameB8Props {
  onSubmit: (val: any) => void;
  isLocked: boolean;
  currentSubmission: any;
  results: any;
  playerId: string;
  timeLeft: number | null;
  gameState: any;
}

export default function GameB8({ onSubmit, isLocked, currentSubmission, results, playerId, timeLeft, gameState }: GameB8Props) {
  const [showConfirm, setShowConfirm] = useState<"RED" | "BLUE" | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const autoSubmitRef = useRef<NodeJS.Timeout | null>(null);

  const gsc = gameState?.gameSpecificConfig || {};
  const queue: string[] = gsc.queue || [];
  const signals: Record<string, string> = gsc.signals || {};
  const publicFeed: any[] = gsc.publicFeed || [];
  const currentTurnIndex: number = gsc.currentTurnIndex ?? 0;
  const trueMajority: string = gsc.trueMajority || "";

  const mySignal = signals[playerId];
  const myQueueIndex = queue.indexOf(playerId);
  const isMyTurn = myQueueIndex === currentTurnIndex && gameState?.phase === "active";
  const myTurnHasPassed = myQueueIndex !== -1 && myQueueIndex < currentTurnIndex;
  const inQueue = myQueueIndex !== -1;

  // Standard submission — the Admin Dashboard will detect this and advance the cascade
  const advanceTurn = useCallback(async (choice: "RED" | "BLUE") => {
    if (advancing) return;
    setAdvancing(true);
    setServerError(null);

    try {
      if (!isMyTurn) throw new Error("Not your turn");
      
      // Submit securely to this player's document
      await onSubmit(choice);
      
      // Client-side visual delay while the Admin Dashboard updates the queue
      setTimeout(() => setAdvancing(false), 2000);

    } catch (e: any) {
      setServerError(e.message);
      console.error("B8 advance turn error:", e);
    } finally {
      setAdvancing(false);
    }
  }, [advancing, playerId, gameState?.currentSlot, onSubmit]);

  // Auto-submit when time runs out
  useEffect(() => {
    if (timeLeft === 0 && isMyTurn && currentSubmission === null && mySignal && !advancing) {
      autoSubmitRef.current = setTimeout(() => {
        advanceTurn(mySignal as "RED" | "BLUE");
      }, 500);
    }
    return () => {
      if (autoSubmitRef.current) clearTimeout(autoSubmitRef.current);
    };
  }, [timeLeft, isMyTurn, currentSubmission, mySignal, advancing, advanceTurn]);

  // Reset error when turn changes
  useEffect(() => {
    setServerError(null);
    setShowConfirm(null);
  }, [currentTurnIndex]);

  // ── REVEAL ──
  if (gameState?.phase === "reveal" && results) {
    const isEliminated = results.eliminatedPlayerIds?.includes(playerId);

    return (
      <div className="w-full max-w-md mx-auto space-y-8 flex flex-col items-center pt-8 font-mono">
        <h2 className="text-2xl font-serif text-white tracking-widest uppercase text-center">The Verdict</h2>

        <div className="w-full p-6 border border-border bg-surface text-center space-y-3">
          <p className="text-xs uppercase tracking-widest text-textMuted">True Signal Majority</p>
          <h3 className={`text-6xl font-bold tracking-widest ${trueMajority === "RED" ? "text-primary drop-shadow-[0_0_20px_rgba(255,0,0,0.6)]" : "text-blue-400 drop-shadow-[0_0_20px_rgba(59,130,246,0.6)]"}`}>
            {trueMajority}
          </h3>
        </div>

        <motion.div
          initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.5 }}
          className={`w-full p-8 border-2 text-center space-y-3 ${isEliminated ? "border-primary bg-primary/10" : "border-secondary bg-secondary/10"}`}
        >
          <p className={`text-4xl font-serif uppercase tracking-widest ${isEliminated ? "text-primary animate-pulse" : "text-secondary"}`}>
            {isEliminated ? "Eliminated" : "Survived"}
          </p>
          <p className="text-textMuted text-sm">You chose: <span className="font-bold text-white">{currentSubmission || "—"}</span></p>
          {isEliminated && <p className="text-xs text-primary/70 uppercase">You were misled by the cascade.</p>}
          {!isEliminated && <p className="text-xs text-secondary/70 uppercase">You correctly aligned with the true majority.</p>}
        </motion.div>
      </div>
    );
  }

  // ── LOBBY / NOT IN QUEUE ──
  if (gameState?.phase === "lobby" || !inQueue) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4 font-mono text-center">
        <div className="w-8 h-8 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
        <p className="text-textMuted uppercase tracking-widest text-sm">Awaiting cascade setup...</p>
        {!inQueue && gameState?.phase === "active" && (
          <p className="text-[10px] text-primary uppercase tracking-widest">You are not in the active cascade queue.</p>
        )}
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto space-y-6 mt-4 pb-12 font-mono">
      {/* Header */}
      <div className="text-center space-y-2 mb-6">
        <p className="text-secondary text-sm uppercase tracking-widest font-bold">Information Cascade</p>
        <p className="text-xs text-textMuted leading-relaxed px-4">
          Trust your private signal — or follow the crowd. Choose which color is the <em>majority signal</em> of all players.
        </p>
      </div>

      {/* Private Signal */}
      {mySignal && (
        <div className={`p-5 border-2 bg-surface text-center ${mySignal === "RED" ? "border-primary" : "border-blue-500"}`}>
          <p className="text-[10px] text-textMuted uppercase tracking-widest mb-1">Your Private Signal</p>
          <p className={`text-4xl font-bold tracking-widest ${mySignal === "RED" ? "text-primary" : "text-blue-400"}`}>{mySignal}</p>
          <p className="text-[10px] text-textMuted mt-2">Only visible to you</p>
        </div>
      )}

      {/* Public Decision Log */}
      <div className="border border-border bg-surface p-4">
        <p className="text-[10px] uppercase tracking-widest text-textMuted mb-3">Public Decision Log</p>

        {/* Live vote bar */}
        {publicFeed.length > 0 && (
          <div className="mb-4 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-primary">{publicFeed.filter(f => f.choice === "RED").length} RED</span>
              <span className="text-blue-400">{publicFeed.filter(f => f.choice === "BLUE").length} BLUE</span>
            </div>
            <div className="w-full h-3 bg-background flex overflow-hidden border border-border">
              <motion.div
                className="h-full bg-primary"
                animate={{ width: `${(publicFeed.filter(f => f.choice === "RED").length / publicFeed.length) * 100}%` }}
                transition={{ duration: 0.5 }}
              />
              <motion.div
                className="h-full bg-blue-500"
                animate={{ width: `${(publicFeed.filter(f => f.choice === "BLUE").length / publicFeed.length) * 100}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </div>
        )}

        {/* Feed entries */}
        <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
          {publicFeed.length === 0 && (
            <p className="text-textMuted/50 text-center text-xs py-6 italic">No decisions made yet.</p>
          )}
          {publicFeed.map((f, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
              className="flex justify-between items-center p-2 border-b border-border/30 text-xs"
            >
              <span className="text-textMuted">#{i + 1} <span className="opacity-40 hover:opacity-100 transition-opacity">{f.playerName}</span></span>
              <span className={`font-bold ${f.choice === "RED" ? "text-primary" : "text-blue-400"}`}>{f.choice}</span>
            </motion.div>
          ))}

          {/* Currently deciding indicator */}
          {gameState?.phase === "active" && currentTurnIndex < queue.length && (
            <div className="flex justify-between items-center p-2 border border-secondary/40 border-dashed bg-secondary/5 text-secondary text-xs animate-pulse mt-1">
              <span>#{currentTurnIndex + 1} {isMyTurn ? "YOU" : "Player"}</span>
              <span>Deciding...</span>
            </div>
          )}
        </div>
      </div>

      {/* Interaction Block */}
      <div className="border-t border-border pt-4">
        {!inQueue ? (
          <p className="text-xs text-textMuted text-center py-6 uppercase tracking-widest">You are not in the cascade queue.</p>
        ) : myTurnHasPassed ? (
          <div className="p-5 border border-border bg-surface text-center space-y-2">
            <p className="text-xs uppercase tracking-widest text-textMuted">Your decision is recorded.</p>
            <p className={`text-3xl font-bold ${currentSubmission === "RED" ? "text-primary" : "text-blue-400"}`}>{currentSubmission}</p>
            <p className="text-[10px] text-textMuted uppercase">Waiting for remaining players...</p>
          </div>
        ) : isMyTurn ? (
          <div className="space-y-4">
            <p className="text-center text-sm uppercase tracking-widest text-secondary font-bold animate-pulse">
              ▶ It is your turn — choose now
            </p>
            {serverError && (
              <p className="text-primary text-xs text-center animate-pulse">{serverError}</p>
            )}
            {timeLeft !== null && (
              <div className={`text-center text-xs uppercase tracking-widest border p-2 ${timeLeft <= 5 ? "text-primary border-primary/40 bg-primary/5 animate-pulse" : "text-textMuted border-border"}`}>
                {timeLeft}s — auto-submits your signal if time runs out
              </div>
            )}
            <div className="flex gap-4">
              <button
                onClick={() => setShowConfirm("RED")}
                disabled={advancing}
                className="flex-1 bg-primary/20 border-2 border-primary text-primary hover:bg-primary hover:text-white py-8 text-2xl tracking-widest font-bold transition-all shadow-[0_0_20px_rgba(255,0,0,0.2)] disabled:opacity-40"
              >
                RED
              </button>
              <button
                onClick={() => setShowConfirm("BLUE")}
                disabled={advancing}
                className="flex-1 bg-blue-500/20 border-2 border-blue-500 text-blue-400 hover:bg-blue-500 hover:text-white py-8 text-2xl tracking-widest font-bold transition-all shadow-[0_0_20px_rgba(59,130,246,0.2)] disabled:opacity-40"
              >
                BLUE
              </button>
            </div>
          </div>
        ) : (
          <div className="p-6 border border-border bg-surface text-center space-y-2">
            <p className="text-xs uppercase tracking-widest text-textMuted">Waiting for your turn</p>
            <p className="text-xl font-bold font-mono text-textDefault">Queue Position: #{myQueueIndex + 1}</p>
            <p className="text-[10px] text-textMuted">{currentTurnIndex < myQueueIndex ? `${myQueueIndex - currentTurnIndex} players before you` : "Your turn is next"}</p>
          </div>
        )}
      </div>

      {/* Confirm Overlay */}
      <AnimatePresence>
        {showConfirm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4 backdrop-blur-sm"
          >
            <div className="max-w-sm w-full bg-surface border-2 border-secondary p-8 space-y-8 text-center">
              <h3 className="font-serif text-2xl uppercase tracking-widest text-white">Lock in your choice?</h3>
              <div className="space-y-2">
                <p className="text-textMuted text-sm">You believe the majority is</p>
                <p className={`text-6xl font-bold font-mono tracking-widest ${showConfirm === "RED" ? "text-primary" : "text-blue-400"}`}>
                  {showConfirm}
                </p>
                <p className="text-primary text-[10px] uppercase tracking-widest mt-4">
                  This will be visible to everyone who votes after you.
                </p>
              </div>
              <div className="flex gap-4">
                <button onClick={() => setShowConfirm(null)}
                  className="flex-1 border border-border bg-background py-3 uppercase tracking-widest text-xs hover:bg-border transition">
                  Change
                </button>
                <button onClick={() => { setShowConfirm(null); advanceTurn(showConfirm); }}
                  className={`flex-1 text-white py-3 uppercase tracking-widest text-xs font-bold transition ${showConfirm === "RED" ? "bg-primary hover:bg-primary/80" : "bg-blue-500 hover:bg-blue-500/80"}`}>
                  Confirm
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
