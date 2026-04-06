"use client";
import { useEffect } from "react";
import { motion } from "framer-motion";

interface GameB8Props {
  onSubmit: (val: any) => void;
  isLocked: boolean;
  currentSubmission: any;
  results: any;
  playerId: string;
  timeLeft: number | null;
  gameState: any;
}

const BATCH_SIZE = 20;

export default function GameB8({ onSubmit, isLocked, currentSubmission, results, playerId, timeLeft, gameState }: GameB8Props) {
  const gsc = gameState?.gameSpecificConfig || {};
  const queue: string[] = gsc.queue || [];
  const signals: Record<string, string> = gsc.signals || {};
  const publicFeed: any[] = gsc.publicFeed || [];
  const currentBatchIndex: number = gsc.currentBatchIndex ?? 0;
  const trueMajority: string = gsc.trueMajority || "";
  const phase = gameState?.phase;

  const mySignal = signals[playerId];
  const myQueueIndex = queue.indexOf(playerId);
  const myBatchIndex = Math.floor(myQueueIndex / BATCH_SIZE);
  const inQueue = myQueueIndex !== -1;

  const totalBatches = Math.ceil(queue.length / BATCH_SIZE);
  const myBatchStart = myBatchIndex * BATCH_SIZE;
  const myBatchEnd = Math.min(myBatchStart + BATCH_SIZE, queue.length);

  const feedUpToMyBatch = publicFeed.filter((_, i) => {
    const batchIdx = Math.floor(i / BATCH_SIZE);
    return batchIdx < myBatchIndex;
  });

  const myBatchFeed = publicFeed.filter((_, i) => {
    const batchIdx = Math.floor(i / BATCH_SIZE);
    return batchIdx === myBatchIndex;
  });

  const isMyBatchProcessed = myBatchFeed.length > 0;
  const redInFeed = publicFeed.filter(f => f.choice === "RED").length;
  const blueInFeed = publicFeed.filter(f => f.choice === "BLUE").length;
  const totalProcessed = publicFeed.length;

  if (phase === "reveal" && results) {
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
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.5 }}
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

  if (phase === "lobby") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4 font-mono text-center">
        <div className="w-8 h-8 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
        <p className="text-textMuted uppercase tracking-widest text-sm">Awaiting cascade setup...</p>
      </div>
    );
  }

  if (!inQueue) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4 font-mono text-center">
        <div className="w-8 h-8 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
        <p className="text-textMuted uppercase tracking-widest text-sm">Cascade is in progress...</p>
        <p className="text-[10px] text-primary uppercase tracking-widest">You are not in this cascade round.</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto space-y-6 mt-4 pb-12 font-mono">
      <div className="text-center space-y-2 mb-6">
        <p className="text-secondary text-sm uppercase tracking-widest font-bold">Information Cascade</p>
        <p className="text-xs text-textMuted leading-relaxed px-4">
          Your private signal is revealed. Watch others decide — then decide yourself.
        </p>
      </div>

      {mySignal && (
        <div className={`p-5 border-2 bg-surface text-center ${mySignal === "RED" ? "border-primary" : "border-blue-500"}`}>
          <p className="text-[10px] text-textMuted uppercase tracking-widest mb-1">Your Private Signal</p>
          <p className={`text-4xl font-bold tracking-widest ${mySignal === "RED" ? "text-primary" : "text-blue-400"}`}>{mySignal}</p>
          <p className="text-[10px] text-textMuted mt-2">Only visible to you</p>
        </div>
      )}

      <div className="border border-border bg-surface p-4">
        <div className="flex justify-between items-center mb-3">
          <p className="text-[10px] uppercase tracking-widest text-textMuted">Cascade Feed</p>
          <p className="text-[10px] font-mono text-textMuted">{totalProcessed}/{queue.length} decided</p>
        </div>

        {publicFeed.length > 0 && (
          <div className="mb-4 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-primary">{redInFeed} RED</span>
              <span className="text-blue-400">{blueInFeed} BLUE</span>
            </div>
            <div className="w-full h-3 bg-background flex overflow-hidden border border-border">
              <motion.div
                className="h-full bg-primary"
                animate={{ width: `${(redInFeed / Math.max(publicFeed.length, 1)) * 100}%` }}
                transition={{ duration: 0.5 }}
              />
              <motion.div
                className="h-full bg-blue-500"
                animate={{ width: `${(blueInFeed / Math.max(publicFeed.length, 1)) * 100}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </div>
        )}

        <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
          {publicFeed.length === 0 && (
            <p className="text-textMuted/50 text-center text-xs py-6 italic">Waiting for cascade to begin...</p>
          )}
          {publicFeed.map((f, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex justify-between items-center p-2 border-b border-border/30 text-xs"
            >
              <span className="text-textMuted">#{i + 1} <span className="opacity-40">{f.playerId?.substring(0, 6)}</span></span>
              <span className={`font-bold ${f.choice === "RED" ? "text-primary" : "text-blue-400"}`}>{f.choice}</span>
            </motion.div>
          ))}

          {phase === "active" && (
            <div className="flex justify-between items-center p-2 border border-secondary/40 border-dashed bg-secondary/5 text-secondary text-xs animate-pulse mt-1">
              <span>Batch {currentBatchIndex + 1}/{totalBatches} — {myBatchStart + 1}-{myBatchEnd} deciding...</span>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border pt-4 space-y-3">
        <div className="text-center space-y-1">
          <p className="text-xs uppercase tracking-widest text-textMuted">Your Position</p>
          <p className="text-xl font-bold font-mono text-textDefault">#{myQueueIndex + 1} of {queue.length}</p>
          <p className="text-[10px] text-textMuted">Batch {myBatchIndex + 1} of {totalBatches}</p>
        </div>

        {isMyBatchProcessed ? (
          <div className={`p-5 border text-center space-y-2 ${mySignal === "RED" ? "border-primary bg-primary/10" : "border-blue-500 bg-blue-900/10"}`}>
            <p className="text-xs uppercase tracking-widest text-textMuted">Your decision is recorded</p>
            <p className={`text-3xl font-bold ${mySignal === "RED" ? "text-primary" : "text-blue-400"}`}>{mySignal}</p>
            <p className="text-[10px] text-textMuted uppercase">Waiting for remaining batches...</p>
          </div>
        ) : myBatchIndex > 0 && feedUpToMyBatch.length === 0 ? (
          <div className="p-5 border border-border bg-surface text-center space-y-2">
            <p className="text-xs uppercase tracking-widest text-textMuted">Waiting for your batch</p>
            <p className="text-[10px] text-textMuted">Previous batches must finish first. Watch the cascade unfold.</p>
          </div>
        ) : (
          <div className="p-5 border border-border bg-surface text-center space-y-2">
            <p className="text-xs uppercase tracking-widest text-textMuted">Your batch is next</p>
            <p className="text-[10px] text-textMuted">Watch the decisions above, then your batch processes automatically.</p>
          </div>
        )}
      </div>

      {timeLeft !== null && (
        <div className={`text-center text-xs uppercase tracking-widest border p-2 ${timeLeft <= 10 ? "text-primary border-primary/40 bg-primary/5 animate-pulse" : "text-textMuted border-border"}`}>
          {timeLeft}s remaining
        </div>
      )}
    </div>
  );
}
