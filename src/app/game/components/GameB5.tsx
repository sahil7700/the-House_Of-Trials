"use client";
import { useState, useEffect, useRef } from "react";
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

  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset on new round
  useEffect(() => {
    if (phase === "active") {
      setAnswer("");
      setSubmitted(false);
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [phase]);

  // Auto-submit when timer runs out
  useEffect(() => {
    if (timeLeft === 0 && !submitted) {
      handleSubmit(true);
    }
  }, [timeLeft]);

  const handleSubmit = (isTimeout = false) => {
    if (submitted || isLocked) return;

    const trimmed = answer.trim();
    if (!trimmed && !isTimeout) {
      setError("Enter your answer.");
      return;
    }

    setSubmitted(true);
    setError(null);
    onSubmit({
      answer: trimmed || null,
      submittedAt: new Date(),
      autoSubmitted: isTimeout,
    });
  };

  // ── REVEAL ──
  if (phase === "reveal" && results) {
    const myAnswer = currentSubmission?.answer;
    const correct = results.correctAnswer;
    const isCorrect = Number(myAnswer) === correct;
    const rank = results.rankMap?.[playerId];
    const myPoints = results.pointsDeltaMap?.[playerId] ?? 0;

    return (
      <div className="w-full max-w-lg mx-auto space-y-8 font-mono py-8">
        <h2 className="text-xl font-serif text-white uppercase tracking-widest text-center">Results</h2>

        {/* Puzzle reference */}
        <div className="border border-border bg-background p-2">
          <img src={puzzleImageUrl} alt="Puzzle" className="w-full max-h-48 object-contain" />
        </div>

        {/* Your answer */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 border border-border bg-surface text-center space-y-2">
              <p className="text-[10px] text-textMuted uppercase tracking-widest">Your Answer</p>
              <p className={`text-3xl font-bold ${isCorrect ? "text-secondary" : "text-primary"}`}>
                {myAnswer ?? "—"}
              </p>
              <p className={`text-xs uppercase tracking-widest ${isCorrect ? "text-secondary" : "text-primary"}`}>
                {isCorrect ? "✓ Correct" : "✗ Wrong"}
              </p>
            </div>
            <div className="p-4 border border-border bg-surface text-center space-y-2">
              <p className="text-[10px] text-textMuted uppercase tracking-widest">Correct Answer</p>
              <p className="text-3xl font-bold text-amber-400">{correct}</p>
              <p className="text-xs text-textMuted uppercase tracking-widest">The Pyramid Top</p>
            </div>
          </div>

          {isCorrect && rank && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="border border-secondary bg-secondary/10 p-6 text-center space-y-2"
            >
              <p className="text-secondary text-xs uppercase tracking-widest">Your Rank</p>
              <p className="text-5xl font-bold text-secondary">#{rank}</p>
              <p className="text-secondary text-sm font-bold">+{myPoints} pts</p>
            </motion.div>
          )}

          {isCorrect && !rank && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="border border-secondary bg-secondary/10 p-6 text-center"
            >
              <p className="text-secondary font-bold text-xl uppercase tracking-widest">✓ Correct Answer</p>
              <p className="text-secondary text-sm mt-1">+{myPoints} pts</p>
            </motion.div>
          )}

          {!isCorrect && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="border border-primary bg-primary/10 p-6 text-center"
            >
              <p className="text-primary font-bold text-xl uppercase tracking-widest">✗ Wrong Answer</p>
              <p className="text-primary/60 text-xs mt-1">You answered {myAnswer ?? "—"}, correct was {correct}</p>
              <p className="text-primary text-sm mt-1">+0 pts</p>
            </motion.div>
          )}

          {/* Leaderboard */}
          {results.submissions && results.submissions.length > 0 && (
            <div className="border border-border bg-surface p-4 space-y-2">
              <p className="text-[10px] text-textMuted uppercase tracking-widest mb-3">Leaderboard</p>
              {results.submissions
                .filter((s: any) => s.correct)
                .sort((a: any, b: any) => (a.rank || 999) - (b.rank || 999))
                .slice(0, 10)
                .map((s: any, i: number) => (
                  <div key={i} className="flex justify-between items-center text-xs p-2 border-b border-border/20">
                    <span className={s.name === gameState?.playerName ? "text-secondary font-bold" : "text-textMuted"}>
                      #{s.rank} {s.name}
                    </span>
                    <span className="text-secondary font-bold">+{s.points} pts</span>
                  </div>
                ))}
              {results.submissions.filter((s: any) => s.correct).length === 0 && (
                <p className="text-textMuted/50 text-xs text-center italic py-2">No correct answers this round.</p>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── LOBBY ──
  if (phase === "lobby") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4 font-mono text-center">
        <div className="w-8 h-8 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
        <p className="text-textMuted uppercase tracking-widest text-sm">Get ready...</p>
        <p className="text-[10px] text-textMuted/50 uppercase tracking-widest max-w-xs">
          A pyramid puzzle will appear. Solve it on paper and submit your answer.
        </p>
      </div>
    );
  }

  // ── ACTIVE — Show puzzle + answer input ──
  return (
    <div className="w-full max-w-lg mx-auto space-y-6 font-mono pb-12">
      {/* Timer */}
      {timeLeft !== null && (
        <div className={`flex items-center justify-between border p-3 ${timeLeft <= 10 ? "border-primary bg-primary/5 animate-pulse" : "border-border bg-surface"}`}>
          <p className="text-xs text-textMuted uppercase tracking-widest">Time Left</p>
          <p className={`text-3xl font-bold font-mono ${timeLeft <= 5 ? "text-primary animate-pulse" : "text-secondary"}`}>
            {timeLeft}s
          </p>
        </div>
      )}

      {/* Puzzle Image */}
      <div className="border border-border bg-background p-3">
        <img
          src={puzzleImageUrl}
          alt="Pyramid Puzzle"
          className="w-full object-contain"
        />
      </div>

      {/* Instructions */}
      <div className="text-center space-y-1">
        <p className="text-xs text-textMuted uppercase tracking-widest">Work out the pyramid, find the top number</p>
        <p className="text-[10px] text-textMuted/60">Fill in the ? cells. Submit your final answer (top of pyramid).</p>
      </div>

      {/* Answer input */}
      <div className="space-y-3">
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            value={answer}
            onChange={e => {
              const val = e.target.value.replace(/[^0-9\-]/g, "");
              setAnswer(val);
              setError(null);
            }}
            onKeyDown={e => {
              if (e.key === "Enter" && !submitted) handleSubmit();
            }}
            disabled={submitted || isLocked}
            placeholder="Enter the top number..."
            className="w-full bg-surface border-2 border-border px-6 py-5 text-2xl font-mono text-center font-bold uppercase tracking-widest outline-none focus:border-secondary transition-colors disabled:opacity-40"
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            {submitted && (
              <span className="text-secondary text-xs uppercase tracking-widest">Submitted</span>
            )}
          </div>
        </div>

        {error && (
          <p className="text-primary text-xs text-center animate-pulse">{error}</p>
        )}

        <button
          onClick={() => handleSubmit(false)}
          disabled={submitted || isLocked || !answer.trim()}
          className="w-full py-4 bg-secondary text-background font-bold uppercase tracking-widest text-sm hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitted ? "Answer Submitted" : isLocked ? "Locked" : "Submit Answer"}
        </button>

        <p className="text-[10px] text-textMuted/40 text-center">
          Press Enter or click Submit. Auto-submits when time runs out.
        </p>
      </div>
    </div>
  );
}
