"use client";
import { useEffect } from "react";
import { motion } from "framer-motion";

interface BlackholeProps {
  onSubmit: (val: any) => void;
  isLocked: boolean;
  currentSubmission: any;
  results: any;
  playerId: string;
  timeLeft: number | null;
  gameState: any;
}

export default function GameB5({ onSubmit, isLocked, currentSubmission, results, playerId, timeLeft, gameState }: BlackholeProps) {
  const gsc = gameState?.gameSpecificConfig || {};
  const puzzleImageUrl: string = gsc.puzzleImageUrl || "";
  const maxPoints = gsc.maxPoints ?? 100;
  const pointDecay = gsc.pointDecay ?? 5;
  const phase = gameState?.phase;
  const correctAnswer = gsc.correctAnswer;
  const isCorrect = results?.correctPlayerIds?.includes(playerId);
  const myRank = results?.rankMap?.[playerId];
  const myPoints = results?.pointsDeltaMap?.[playerId] ?? 0;

  if (phase === "reveal" && results) {
    return (
      <div className="w-full max-w-lg mx-auto space-y-8 font-mono py-8">
        <h2 className="text-xl font-serif text-white uppercase tracking-widest text-center">Results</h2>

        <div className="border border-border bg-background p-2">
          <img src={puzzleImageUrl} alt="Puzzle" className="w-full max-h-48 object-contain" />
        </div>

        <div className="space-y-4">
          <div className="p-4 border border-border bg-surface text-center space-y-2">
            <p className="text-[10px] text-textMuted uppercase tracking-widest">Correct Answer</p>
            <p className="text-3xl font-bold text-amber-400">{correctAnswer}</p>
          </div>

          {isCorrect && myRank && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="border border-secondary bg-secondary/10 p-6 text-center space-y-2"
            >
              <p className="text-secondary text-xs uppercase tracking-widest">Your Rank</p>
              <p className="text-5xl font-bold text-secondary">#{myRank}</p>
              <p className="text-secondary text-sm font-bold">+{myPoints} pts</p>
            </motion.div>
          )}

          {isCorrect && !myRank && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="border border-secondary bg-secondary/10 p-6 text-center"
            >
              <p className="text-secondary font-bold text-xl uppercase tracking-widest">Correct</p>
              <p className="text-secondary text-sm mt-1">+{myPoints} pts</p>
            </motion.div>
          )}

          {!isCorrect && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="border border-primary bg-primary/10 p-6 text-center"
            >
              <p className="text-primary font-bold text-xl uppercase tracking-widest">Not Marked Correct</p>
              <p className="text-primary/60 text-xs mt-1">+0 pts</p>
            </motion.div>
          )}

          {results.correctPlayers && results.correctPlayers.length > 0 && (
            <div className="border border-border bg-surface p-4 space-y-2">
              <p className="text-[10px] text-textMuted uppercase tracking-widest mb-3">Correct Players</p>
              {results.correctPlayers
                .sort((a: any, b: any) => (a.rank || 999) - (b.rank || 999))
                .map((s: any, i: number) => (
                  <div key={i} className="flex justify-between items-center text-xs p-2 border-b border-border/20">
                    <span className={s.name === gameState?.playerName ? "text-secondary font-bold" : "text-textMuted"}>
                      #{s.rank || i + 1} {s.name}
                    </span>
                    <span className="text-secondary font-bold">+{s.points} pts</span>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (phase === "lobby") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4 font-mono text-center">
        <div className="w-8 h-8 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
        <p className="text-textMuted uppercase tracking-widest text-sm">Get ready...</p>
        <p className="text-[10px] text-textMuted/50 uppercase tracking-widest max-w-xs">
          A pyramid puzzle will appear. Solve it on paper. The admin will verify your answer.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-lg mx-auto space-y-6 font-mono pb-12">
      {timeLeft !== null && (
        <div className={`flex items-center justify-between border p-3 ${timeLeft <= 10 ? "border-primary bg-primary/5 animate-pulse" : "border-border bg-surface"}`}>
          <p className="text-xs text-textMuted uppercase tracking-widest">Time Left</p>
          <p className={`text-3xl font-bold font-mono ${timeLeft <= 5 ? "text-primary animate-pulse" : "text-secondary"}`}>
            {timeLeft}s
          </p>
        </div>
      )}

      <div className="border border-border bg-background p-3">
        <img
          src={puzzleImageUrl}
          alt="Pyramid Puzzle"
          className="w-full object-contain"
        />
      </div>

      <div className="text-center space-y-2">
        <p className="text-sm text-textMuted uppercase tracking-widest">Work out the pyramid</p>
        <p className="text-xs text-textMuted/60">Fill in the ? cells and find the top number.</p>
        <p className="text-xs text-secondary uppercase tracking-widest">Raise your hand when done — admin will verify</p>
      </div>

      <div className="border border-border bg-surface p-4 text-center">
        <p className="text-[10px] text-textMuted uppercase tracking-widest">Solve on paper</p>
        <p className="text-xs text-textMuted/50 mt-1">No submission needed — admin marks correct players manually</p>
      </div>
    </div>
  );
}
