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
  const options: string[] = gsc.options || ["A", "B"];
  const optionLabels: Record<string, string> = gsc.optionLabels || {};
  const correctAnswer: string = gsc.correctAnswer || "";
  const questionText: string = gsc.questionText || "";
  const imageDuration: number = gsc.imageDuration ?? 3000;
  const voteDuration: number = gsc.voteDuration ?? 6;
  const fakeAnswerKey: string = gsc.fakeAnswerKey || options[1];
  const fakeBias: number = gsc.fakeBias ?? 70;
  const confidenceTrapEnabled: boolean = gsc.confidenceTrapEnabled ?? true;

  type ScreenPhase = "waiting" | "image" | "vote" | "confidence" | "locked" | "reveal";
  const [screenPhase, setScreenPhase] = useState<ScreenPhase>("waiting");
  const [imageBlurred, setImageBlurred] = useState(false);
  const [imageVisible, setImageVisible] = useState(false);
  const [voteTimer, setVoteTimer] = useState(voteDuration);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const voteIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const fakeRef = useRef<NodeJS.Timeout | null>(null);
  const phase = gameState?.phase;
  const totalAlive = gameState?.playersAlive || 10;

  const [fakeCounts, setFakeCounts] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    options.forEach(o => init[o] = 0);
    return init;
  });

  // Reset fake counts when options change
  useEffect(() => {
    const init: Record<string, number> = {};
    options.forEach(o => init[o] = 0);
    setFakeCounts(init);
  }, [options]);

  useEffect(() => {
    if (phase === "active") {
      startSequence();
    } else if (phase === "locked" || phase === "reveal" || phase === "confirm") {
      setScreenPhase("locked");
      if (fakeRef.current) { clearInterval(fakeRef.current); fakeRef.current = null; }
      if (voteIntervalRef.current) { clearInterval(voteIntervalRef.current); voteIntervalRef.current = null; }
    }
  }, [phase]);

  const startSequence = () => {
    setSubmitted(false);
    setSelectedAnswer(null);
    setConfidence(null);
    setImageBlurred(false);
    setImageVisible(true);
    setScreenPhase("image");

    const blurTimer = setTimeout(() => {
      setImageBlurred(true);
      const hideTimer = setTimeout(() => {
        setImageVisible(false);
        setScreenPhase("vote");
        startFakeMajority();
        startVoteTimer();
      }, 600);
    }, imageDuration);

    return () => { clearTimeout(blurTimer); };
  };

  const startFakeMajority = () => {
    if (fakeRef.current) { clearInterval(fakeRef.current); fakeRef.current = null; }

    const targetTotal = Math.ceil(totalAlive * 0.9);
    let currentTotal = 0;

    fakeRef.current = setInterval(() => {
      if (currentTotal >= targetTotal) {
        clearInterval(fakeRef.current!);
        fakeRef.current = null;
        return;
      }

      setFakeCounts(prev => {
        const next = { ...prev };
        const roll = Math.random() * 100;
        const winner = roll < fakeBias ? fakeAnswerKey : options[Math.floor(Math.random() * options.length)];
        next[winner] = (next[winner] || 0) + 1;
        currentTotal++;
        return next;
      });
    }, 150);
  };

  const startVoteTimer = () => {
    setVoteTimer(voteDuration);
    if (voteIntervalRef.current) { clearInterval(voteIntervalRef.current); voteIntervalRef.current = null; }

    voteIntervalRef.current = setInterval(() => {
      setVoteTimer(t => {
        if (t <= 1) {
          clearInterval(voteIntervalRef.current!);
          voteIntervalRef.current = null;
          if (fakeRef.current) { clearInterval(fakeRef.current); fakeRef.current = null; }
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
    if (voteIntervalRef.current) { clearInterval(voteIntervalRef.current); voteIntervalRef.current = null; }
    if (fakeRef.current) { clearInterval(fakeRef.current); fakeRef.current = null; }

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

        {questionText && (
          <p className="text-center text-sm text-textMuted italic">&ldquo;{questionText}&rdquo;</p>
        )}

        <div className="grid grid-cols-2 gap-4 w-full">
          {options.map(opt => {
            const isCorrect = opt === correctAnswer;
            const isMine = opt === myAnswer;
            const fakeTotal = (Object.values(results.fakeCounts || {}) as number[]).reduce((a, b) => a + b, 0);
            const fakeCount = ((results.fakeCounts || {}) as Record<string, number>)[opt] || 0;
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
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.5 }}
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
        <p className="text-textMuted uppercase tracking-widest text-sm text-center">Prepare yourself.</p>
        <p className="text-xs text-textMuted/50 uppercase tracking-widest">An image will appear shortly. Observe carefully.</p>
      </div>
    );
  }

  // ── IMAGE FLASH ──
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

  // ── VOTE ──
  if (screenPhase === "vote") {
    const totalFake = Object.values(fakeCounts).reduce((a, b) => a + b, 0);

    return (
      <div className="w-full max-w-lg mx-auto space-y-5 font-mono">
        {/* Countdown */}
        <div className="flex items-center justify-between border border-border bg-surface p-3">
          <p className="text-xs text-textMuted uppercase tracking-widest">Time remaining</p>
          <p className={`text-3xl font-bold font-mono ${voteTimer <= 3 ? "text-primary animate-pulse" : "text-secondary"}`}>
            {voteTimer}s
          </p>
        </div>

        {/* Question text */}
        {questionText && (
          <div className="border border-secondary/40 bg-secondary/5 p-4 text-center">
            <p className="text-sm text-secondary font-serif italic tracking-wide">&ldquo;{questionText}&rdquo;</p>
          </div>
        )}

        {/* Fake majority bars — starts filling immediately */}
        <div className="border border-amber-500/30 bg-amber-900/10 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-amber-400 uppercase tracking-widest">Live Votes</p>
            {totalFake > 0 && (
              <span className="text-[10px] text-amber-400/60">{totalFake} voted</span>
            )}
          </div>
          {options.map(opt => {
            const count = fakeCounts[opt] || 0;
            const pct = totalFake > 0 ? Math.round((count / totalFake) * 100) : 0;
            const isFaked = opt === fakeAnswerKey;
            return (
              <div key={opt} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className={`uppercase ${isFaked ? "text-amber-300 font-bold" : "text-textMuted"}`}>
                    {opt}{optionLabels[opt] ? ` — ${optionLabels[opt]}` : ""}
                  </span>
                  <span className={`font-bold ${isFaked ? "text-amber-300" : "text-amber-400"}`}>{pct}%</span>
                </div>
                <div className="w-full h-3 bg-background border border-amber-500/20 overflow-hidden">
                  <motion.div
                    className={`h-full ${isFaked ? "bg-amber-400" : "bg-amber-600/60"}`}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.4 }}
                  />
                </div>
              </div>
            );
          })}
          <p className="text-[9px] text-amber-400/40 text-right">
            {Math.round(fakeBias)}% voted {fakeAnswerKey} — trust your observation
          </p>
        </div>

        {/* Vote buttons */}
        <div className="grid grid-cols-2 gap-3">
          {options.map(opt => (
            <button
              key={opt}
              onClick={() => handleVote(opt)}
              disabled={submitted || voteTimer === 0}
              className={`py-6 border-2 text-center text-xl font-bold uppercase tracking-widest transition-all disabled:opacity-30 ${
                selectedAnswer === opt
                  ? "border-secondary bg-secondary/10 text-secondary"
                  : "border-border hover:border-secondary hover:bg-secondary/10 hover:text-secondary"
              }`}
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
          {optionLabels[selectedAnswer || ""] && (
            <p className="text-textMuted text-sm">{optionLabels[selectedAnswer || ""]}</p>
          )}
          <p className="text-textMuted uppercase tracking-widest text-sm">How confident are you?</p>
        </div>

        <div className="w-full space-y-4">
          {([
            { level: 100, label: "100% — Absolutely certain", color: "border-green-500 text-green-400 hover:bg-green-900/30", warning: "Wrong + 100% = Instant Elimination" },
            { level: 70,  label: "70% — Pretty sure",        color: "border-secondary text-secondary hover:bg-secondary/10", warning: null },
            { level: 50,  label: "50% — Just a guess",       color: "border-textMuted text-textMuted hover:bg-surface", warning: null },
          ] as const).map(({ level, label, color, warning }) => (
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
      <p className="text-textMuted text-xs uppercase tracking-widest">Awaiting reveal…</p>
    </div>
  );
}
