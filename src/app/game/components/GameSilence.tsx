"use client";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  onSubmit: (val: any) => void;
  isLocked: boolean;
  currentSubmission: any;
  results: any;
  playerId: string;
  gameState: any;
}

export default function GameSilence({ onSubmit, isLocked, currentSubmission, results, playerId, gameState }: Props) {
  const gsc = gameState?.gameSpecificConfig || {};

  const imageUrl: string = gsc.imageUrl || "";
  const options: string[] = gsc.options || ["A", "B", "C", "D"];
  const optionLabels: Record<string, string> = gsc.optionLabels || {};
  const correctAnswer: string = gsc.correctAnswer || "";
  const imageDuration: number = gsc.imageDuration ?? 3000; // ms to show image
  const voteDuration: number = gsc.voteDuration ?? 6;      // seconds to vote
  const fakeAnswerKey: string = gsc.fakeAnswerKey || options[1]; // which answer fake majority pushes
  const fakeBias: number = gsc.fakeBias ?? 70;             // % shown for the fake majority answer
  const confidenceTrapEnabled: boolean = gsc.confidenceTrapEnabled ?? true;

  // Screen phases
  type ScreenPhase = "waiting" | "image" | "vote" | "confidence" | "locked" | "reveal";
  const [screenPhase, setScreenPhase] = useState<ScreenPhase>("waiting");
  const [imageBlurred, setImageBlurred] = useState(false);
  const [imageVisible, setImageVisible] = useState(false);
  const [voteTimer, setVoteTimer] = useState(voteDuration);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const voteIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fake majority state — updates every 500ms
  const [fakeCounts, setFakeCounts] = useState<Record<string, number>>({});
  const fakeRef = useRef<NodeJS.Timeout | null>(null);
  const totalAlive = gameState?.playersAlive || 10;

  // Detect phase transitions from gameState
  const phase = gameState?.phase;
  useEffect(() => {
    if (phase === "active") {
      startSequence();
    } else if (phase === "locked" || phase === "reveal" || phase === "confirm") {
      setScreenPhase("locked");
      if (fakeRef.current) clearInterval(fakeRef.current);
      if (voteIntervalRef.current) clearInterval(voteIntervalRef.current);
    }
  }, [phase]);

  const startSequence = () => {
    setSubmitted(false);
    setSelectedAnswer(null);
    setConfidence(null);
    setImageBlurred(false);
    setImageVisible(true);
    setScreenPhase("image");

    // After imageDuration ms → blur image, move to vote phase
    setTimeout(() => {
      setImageBlurred(true);
      setTimeout(() => {
        setImageVisible(false);
        setScreenPhase("vote");
        startFakeMajority();
        startVoteTimer();
      }, 600); // 600ms blur transition
    }, imageDuration);
  };

  const startFakeMajority = () => {
    if (fakeRef.current) clearInterval(fakeRef.current);

    // Initialize with a trickle
    const initial: Record<string, number> = {};
    options.forEach(o => initial[o] = 0);
    setFakeCounts({ ...initial });

    fakeRef.current = setInterval(() => {
      setFakeCounts(prev => {
        const next = { ...prev };
        const totalSoFar = Object.values(next).reduce((a, b) => a + b, 0);
        if (totalSoFar >= totalAlive * 0.85) {
          clearInterval(fakeRef.current!);
          return prev;
        }
        // Bias toward fakeAnswerKey
        const roll = Math.random() * 100;
        const winner = roll < fakeBias ? fakeAnswerKey : options[Math.floor(Math.random() * options.length)];
        next[winner] = (next[winner] || 0) + 1;
        return next;
      });
    }, 500);
  };

  const startVoteTimer = () => {
    setVoteTimer(voteDuration);
    if (voteIntervalRef.current) clearInterval(voteIntervalRef.current);

    voteIntervalRef.current = setInterval(() => {
      setVoteTimer(t => {
        if (t <= 1) {
          clearInterval(voteIntervalRef.current!);
          if (fakeRef.current) clearInterval(fakeRef.current);
          // Auto-submit blank if not voted
          setScreenPhase("locked");
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  };

  const handleVote = (answer: string) => {
    if (submitted || voteTimer === 0 || isLocked) return;
    setSelectedAnswer(answer);
    if (voteIntervalRef.current) clearInterval(voteIntervalRef.current);
    if (fakeRef.current) clearInterval(fakeRef.current);

    if (confidenceTrapEnabled) {
      setScreenPhase("confidence");
    } else {
      setSubmitted(true);
      onSubmit({ answer, confidence: null });
      setScreenPhase("locked");
    }
  };

  const handleConfidence = (level: number) => {
    setConfidence(level);
    setSubmitted(true);
    onSubmit({ answer: selectedAnswer, confidence: level });
    setScreenPhase("locked");
  };

  // ── REVEAL ──
  if ((screenPhase === "locked" || screenPhase === "reveal") && results) {
    const myAnswer = currentSubmission?.answer;
    const myConf = currentSubmission?.confidence;
    const isRight = myAnswer === correctAnswer;
    const highConfWrong = !isRight && myConf === 100;

    return (
      <div className="w-full max-w-lg mx-auto flex flex-col items-center space-y-8 font-mono py-8">
        <h2 className="text-xl font-serif uppercase tracking-widest text-secondary">The Truth</h2>
        {imageUrl && (
          <div className="w-full border border-border overflow-hidden">
            <img src={imageUrl} alt="The image" className="w-full object-contain max-h-48" />
          </div>
        )}
        <div className="grid grid-cols-2 gap-4 w-full">
          {options.map(opt => {
            const isCorrect = opt === correctAnswer;
            const isMine = opt === myAnswer;
            const fakeTotal = (Object.values(results.fakeCounts || {}) as number[]).reduce((a, b) => a + b, 0);
            const fakeCount = ((results.fakeCounts || {}) as Record<string,number>)[opt] || 0;
            const fakePct = fakeTotal > 0 ? Math.round((fakeCount / fakeTotal) * 100) : 0;
            return (
              <div key={opt} className={`p-5 border text-center space-y-2 ${isCorrect ? "border-secondary bg-secondary/10 text-secondary" : isMine && !isCorrect ? "border-primary bg-primary/10 text-primary" : "border-border text-textMuted opacity-50"}`}>
                <p className="text-xl font-bold uppercase">{opt}</p>
                {optionLabels[opt] && <p className="text-xs">{optionLabels[opt]}</p>}
                {isCorrect && <p className="text-[10px] uppercase tracking-widest">Correct</p>}
                {isMine && !isCorrect && <p className="text-[10px] uppercase tracking-widest text-primary">Your Answer</p>}
                <p className="text-[10px] text-textMuted">{fakePct}% voted this</p>
              </div>
            );
          })}
        </div>
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.5 }}
          className={`w-full p-6 border text-center ${isRight ? "border-secondary bg-secondary/10" : "border-primary bg-primary/10"}`}
        >
          <p className={`text-3xl font-bold uppercase tracking-widest ${isRight ? "text-secondary" : "text-primary"}`}>
            {isRight ? "✓ Correct" : "✗ Wrong"}
          </p>
          {highConfWrong && (
            <p className="text-primary text-xs mt-3 uppercase tracking-widest">High Confidence + Wrong = Instant Elimination</p>
          )}
          {myConf !== null && (
            <p className="text-textMuted text-xs mt-2">You were {myConf}% confident</p>
          )}
        </motion.div>
      </div>
    );
  }

  // ── WAITING ──
  if (screenPhase === "waiting" || phase === "lobby") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4 font-mono">
        <div className="w-8 h-8 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
        <p className="text-textMuted uppercase tracking-widest text-sm text-center">
          Prepare yourself.
        </p>
        <p className="text-xs text-textMuted/50 uppercase tracking-widest">An image will appear shortly. Observe carefully.</p>
      </div>
    );
  }

  // ── IMAGE FLASH phase ──
  if (screenPhase === "image") {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-4">
        <p className="text-textMuted text-xs uppercase tracking-widest mb-4 animate-pulse">
          Study this carefully — it will disappear
        </p>
        <AnimatePresence>
          {imageVisible && (
            <motion.div
              key="flash-img"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, filter: imageBlurred ? "blur(20px)" : "blur(0px)" }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="w-full max-w-xl"
            >
              <img src={imageUrl} alt="Observe" className="w-full object-contain max-h-[60vh] rounded-sm" />
            </motion.div>
          )}
        </AnimatePresence>
        {imageBlurred && (
          <p className="text-primary text-sm uppercase tracking-wider mt-6 animate-pulse">Fading…</p>
        )}
      </div>
    );
  }

  // ── VOTE phase ──
  if (screenPhase === "vote") {
    const totalFake = Object.values(fakeCounts).reduce((a, b) => a + b, 0);

    return (
      <div className="w-full max-w-lg mx-auto space-y-6 font-mono">
        {/* Countdown */}
        <div className="flex items-center justify-between border border-border bg-surface p-3">
          <p className="text-xs text-textMuted uppercase tracking-widest">Time remaining</p>
          <p className={`text-3xl font-bold font-mono ${voteTimer <= 3 ? "text-primary animate-pulse" : "text-secondary"}`}>
            {voteTimer}s
          </p>
        </div>

        {/* Fake majority bars */}
        <div className="border border-amber-500/30 bg-amber-900/10 p-4 space-y-3">
          <p className="text-[10px] text-amber-400 uppercase tracking-widest mb-1">Live Votes</p>
          {options.map(opt => {
            const count = fakeCounts[opt] || 0;
            const pct = totalFake > 0 ? Math.round((count / totalFake) * 100) : 0;
            return (
              <div key={opt} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-textMuted uppercase">{opt}{optionLabels[opt] ? ` — ${optionLabels[opt]}` : ""}</span>
                  <span className="text-amber-400 font-bold">{pct}%</span>
                </div>
                <div className="w-full h-3 bg-background border border-amber-500/20 overflow-hidden">
                  <motion.div className="h-full bg-amber-500/60" animate={{ width: `${pct}%` }} transition={{ duration: 0.3 }} />
                </div>
              </div>
            );
          })}
          <p className="text-[9px] text-amber-400/50 text-right">{totalFake} have voted</p>
        </div>

        {/* Vote buttons */}
        <div className="grid grid-cols-2 gap-3">
          {options.map(opt => (
            <button
              key={opt}
              onClick={() => handleVote(opt)}
              disabled={submitted || voteTimer === 0}
              className="py-6 border-2 border-border text-center text-xl font-bold uppercase tracking-widest hover:border-secondary hover:bg-secondary/10 hover:text-secondary transition-all disabled:opacity-30"
            >
              {opt}
              {optionLabels[opt] && <p className="text-xs text-textMuted font-normal normal-case mt-1">{optionLabels[opt]}</p>}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── CONFIDENCE TRAP ──
  if (screenPhase === "confidence") {
    return (
      <div className="w-full max-w-lg mx-auto flex flex-col items-center justify-center min-h-[60vh] space-y-8 font-mono">
        <div className="text-center space-y-3">
          <h2 className="text-2xl font-serif uppercase tracking-widest text-secondary">You chose: {selectedAnswer}</h2>
          <p className="text-textMuted uppercase tracking-widest text-sm">How confident are you?</p>
        </div>

        <div className="w-full space-y-4">
          {[
            { level: 100, label: "100% — Absolutely certain", color: "border-green-500 text-green-400 hover:bg-green-900/30", warning: "Wrong + 100% = Instant Elimination" },
            { level: 70,  label: "70% — Pretty sure",        color: "border-secondary text-secondary hover:bg-secondary/10", warning: null },
            { level: 50,  label: "50% — Just a guess",       color: "border-textMuted text-textMuted hover:bg-surface",     warning: null },
          ].map(({ level, label, color, warning }) => (
            <motion.button
              key={level}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleConfidence(level)}
              className={`w-full p-5 border-2 text-left space-y-1 transition-all ${color}`}
            >
              <p className="font-bold uppercase tracking-widest text-sm">{label}</p>
              {warning && (
                <p className="text-[10px] text-primary uppercase tracking-widest animate-pulse">{warning}</p>
              )}
            </motion.button>
          ))}
        </div>
      </div>
    );
  }

  // ── LOCKED ──
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4 font-mono">
      <p className="text-secondary font-bold uppercase tracking-widest text-lg">
        {submitted ? `Voted: ${selectedAnswer}` : "Time Expired"}
      </p>
      {submitted && confidence !== null && <p className="text-textMuted text-xs uppercase">Confidence: {confidence}%</p>}
      <p className="text-textMuted text-xs uppercase tracking-widest">Awaiting reveal...</p>
    </div>
  );
}
