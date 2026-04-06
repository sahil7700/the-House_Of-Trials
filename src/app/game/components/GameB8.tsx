"use client";
import { useState, useEffect, useRef } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  gameState: any;
  playerId: string;
}

export default function GameB8({ gameState, playerId }: Props) {
  const b8Config: any = (gameState as any).b8Config || {};
  const phase = (gameState as any).phase || gameState.phase;
  const b8RevealStep: number = (gameState as any).b8RevealStep || 0;
  const b8Results: any = (gameState as any).b8Results || null;
  const imageFlashStartedAt: any = (gameState as any).imageFlashStartedAt;
  const votingStartedAt: any = (gameState as any).votingStartedAt;
  const confidenceStartedAt: any = (gameState as any).confidenceStartedAt;

  const [myVote, setMyVote] = useState<string | null>(null);
  const [myConfidence, setMyConfidence] = useState<number | null>(null);
  const [votedCount, setVotedCount] = useState(0);
  const [votesA, setVotesA] = useState(0);
  const [votesB, setVotesB] = useState(0);
  const [flashRemaining, setFlashRemaining] = useState<number | null>(null);
  const [votingRemaining, setVotingRemaining] = useState<number | null>(null);
  const [confidenceRemaining, setConfidenceRemaining] = useState<number | null>(null);
  const [isEliminated, setIsEliminated] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingVote, setPendingVote] = useState<string | null>(null);
  const [fakeA, setFakeA] = useState(0);
  const [fakeB, setFakeB] = useState(0);

  const fakeMajorityEnabled = b8Config.fakeMajorityEnabled !== false;
  const fakeBiasToward = b8Config.fakeMajorityBiasToward || "A";
  const fakeStartPercent = b8Config.fakeMajorityStartPercent || 72;
  const imageFlashSeconds = b8Config.imageFlashSeconds || 3;
  const votingSeconds = b8Config.votingSeconds || 7;
  const confidenceSeconds = b8Config.confidenceSeconds || 5;
  const correctAnswer = b8Config.correctAnswer || "A";
  const optionALabel = b8Config.optionALabel || "Option A";
  const optionBLabel = b8Config.optionBLabel || "Option B";
  const totalPlayers = gameState.playersAlive || 10;

  const intervalRefs = useRef<{ [key: string]: NodeJS.Timeout }>({});

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "submissions"), where("playerId", "==", playerId), where("gameId", "==", "B8")),
      (snap) => {
        if (!snap.empty) {
          const data = snap.docs[0].data();
          setMyVote(data.vote);
          setMyConfidence(data.confidence);
          const elim: string[] = (gameState as any).pendingEliminations || [];
          const elimResults = (gameState as any).results?.eliminatedPlayerIds || elim;
          setIsEliminated(elimResults.includes(playerId));
        }
      }
    );
    return () => unsub();
  }, [playerId, gameState]);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "submissions"), where("gameId", "==", "B8")),
      (snap) => {
        const all = snap.docs.map(d => d.data());
        setVotedCount(all.filter((s: any) => s.vote !== null).length);
        setVotesA(all.filter((s: any) => s.vote === "A").length);
        setVotesB(all.filter((s: any) => s.vote === "B").length);
      }
    );
    return () => unsub();
  }, [phase]);

  useEffect(() => {
    if (phase === "image_flash" && imageFlashStartedAt) {
      const update = () => {
        const start = imageFlashStartedAt?.toDate?.()?.getTime() || Date.now();
        const remaining = Math.max(0, imageFlashSeconds - Math.floor((Date.now() - start) / 1000));
        setFlashRemaining(remaining);
      };
      update();
      intervalRefs.current["flash"] = setInterval(update, 100);
    } else {
      setFlashRemaining(null);
    }
    return () => { if (intervalRefs.current["flash"]) clearInterval(intervalRefs.current["flash"]); };
  }, [phase, imageFlashStartedAt, imageFlashSeconds]);

  useEffect(() => {
    if (phase === "voting_open" && votingStartedAt) {
      const update = () => {
        const start = votingStartedAt?.toDate?.()?.getTime() || Date.now();
        const remaining = Math.max(0, votingSeconds - Math.floor((Date.now() - start) / 1000));
        setVotingRemaining(remaining);
      };
      update();
      intervalRefs.current["voting"] = setInterval(update, 100);
    } else {
      setVotingRemaining(null);
    }
    return () => { if (intervalRefs.current["voting"]) clearInterval(intervalRefs.current["voting"]); };
  }, [phase, votingStartedAt, votingSeconds]);

  useEffect(() => {
    if (phase === "confidence" && confidenceStartedAt) {
      const update = () => {
        const start = confidenceStartedAt?.toDate?.()?.getTime() || Date.now();
        const remaining = Math.max(0, confidenceSeconds - Math.floor((Date.now() - start) / 1000));
        setConfidenceRemaining(remaining);
      };
      update();
      intervalRefs.current["confidence"] = setInterval(update, 100);
    } else {
      setConfidenceRemaining(null);
    }
    return () => { if (intervalRefs.current["confidence"]) clearInterval(intervalRefs.current["confidence"]); };
  }, [phase, confidenceStartedAt, confidenceSeconds]);

  useEffect(() => {
    if (!fakeMajorityEnabled || phase !== "voting_open") return;
    let wrongPct = fakeStartPercent + (Math.random() * 4 - 2);
    const drift = setInterval(() => {
      wrongPct += (Math.random() * 2 - 1);
      wrongPct = Math.max(55, Math.min(85, wrongPct));
      if (votingRemaining !== null && votingRemaining <= 3) {
        wrongPct = Math.min(90, wrongPct + 3);
      }
      if (fakeBiasToward === "A") {
        setFakeA(Math.round(wrongPct));
        setFakeB(Math.round(100 - wrongPct));
      } else {
        setFakeB(Math.round(wrongPct));
        setFakeA(Math.round(100 - wrongPct));
      }
    }, 500);
    return () => clearInterval(drift);
  }, [phase, fakeMajorityEnabled, fakeBiasToward, fakeStartPercent, votingRemaining]);

  useEffect(() => {
    if (isEliminated && phase === "reveal" && b8RevealStep >= 3) {
      setRedirectCountdown(4);
    }
  }, [isEliminated, phase, b8RevealStep]);

  useEffect(() => {
    if (redirectCountdown > 0) {
      const t = setTimeout(() => setRedirectCountdown(redirectCountdown - 1), 1000);
      return () => clearTimeout(t);
    } else if (redirectCountdown === 0 && isEliminated) {
      window.location.href = "/eliminated";
    }
  }, [redirectCountdown, isEliminated]);

  const handleVote = async (vote: string) => {
    setPendingVote(vote);
    setShowConfirm(true);
  };

  const confirmVote = async () => {
    if (!pendingVote) return;
    try {
      await fetch("/api/game/b8/submit-vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, slotNumber: gameState.currentSlot, vote: pendingVote }),
      });
      setMyVote(pendingVote);
      setShowConfirm(false);
      setPendingVote(null);
    } catch (e) { console.error(e); }
  };

  const handleConfidence = async (conf: number) => {
    try {
      await fetch("/api/game/b8/submit-confidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, slotNumber: gameState.currentSlot, confidence: conf }),
      });
      setMyConfidence(conf);
    } catch (e) { console.error(e); }
  };

  if (phase === "lobby") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4 text-center px-4">
        <div className="w-12 h-12 border-4 border-secondary border-t-transparent rounded-full animate-spin" />
        <h2 className="text-xl uppercase tracking-widest text-secondary font-bold">Information Cascade</h2>
        <p className="text-textMuted text-sm uppercase tracking-widest animate-pulse">Stand by for the trial...</p>
      </div>
    );
  }

  if (phase === "image_flash") {
    const displayLabel = b8Config?.customQuestion || b8Config?.optionALabel || "Option A";
    const displayLabelB = b8Config?.optionBLabel || "Option B";
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center overflow-hidden">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="absolute inset-0 flex items-center justify-center"
        >
          <div className="w-full h-full bg-gradient-to-br from-[#0a0015] via-[#150025] to-[#0a0015] flex items-center justify-center">
            <div className="text-center space-y-6 max-w-2xl px-8">
              <motion.h2 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-3xl font-serif text-white uppercase tracking-widest"
              >
                Observe Carefully
              </motion.h2>
              
              {b8Config?.customQuestion ? (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="border-2 border-secondary/50 p-6 bg-surface/50 backdrop-blur-sm"
                >
                  <p className="text-secondary text-lg font-mono uppercase tracking-widest">{displayLabel}</p>
                </motion.div>
              ) : (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.5 }}
                  className="flex items-center justify-center gap-8"
                >
                  <div className="border-2 border-primary p-6 bg-primary/10 shadow-glow-red">
                    <p className="text-primary text-2xl font-mono uppercase tracking-widest font-bold">{displayLabel}</p>
                  </div>
                  <div className="text-textMuted text-3xl font-bold">VS</div>
                  <div className="border-2 border-blue-500 p-6 bg-blue-500/10">
                    <p className="text-blue-400 text-2xl font-mono uppercase tracking-widest font-bold">{displayLabelB}</p>
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        </motion.div>
        <div className="absolute top-0 left-0 right-0 z-30">
          <div className="h-2 bg-background/50">
            <motion.div
              className="h-full bg-gradient-to-r from-secondary via-primary to-secondary"
              animate={{ width: `${((flashRemaining ?? imageFlashSeconds) / imageFlashSeconds) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>
        <div className="absolute bottom-8 left-0 right-0 text-center z-30">
          <p className={`text-5xl font-mono font-bold ${(flashRemaining ?? imageFlashSeconds) <= 1 ? "text-primary animate-pulse" : "text-white/60"}`}>
            {flashRemaining ?? imageFlashSeconds}
          </p>
        </div>
      </div>
    );
  }

  if (phase === "voting_open" && !myVote) {
    const voteLabelA = b8Config?.optionALabel || "Option A";
    const voteLabelB = b8Config?.optionBLabel || "Option B";
    return (
      <div className="w-full max-w-md mx-auto px-4 pt-8 pb-12 space-y-8 font-mono">
        {fakeMajorityEnabled && (
          <div className="space-y-2 p-4 bg-surface border border-border">
            <p className="text-[10px] uppercase tracking-widest text-textMuted text-center">Live Votes</p>
            <div className="space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="text-primary font-bold">{voteLabelA}</span>
                <span className="text-primary font-mono">{fakeA}%</span>
              </div>
              <div className="w-full h-3 bg-background border border-border overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${fakeA}%` }} />
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="text-blue-400 font-bold">{voteLabelB}</span>
                <span className="text-blue-400 font-mono">{fakeB}%</span>
              </div>
              <div className="w-full h-3 bg-background border border-border overflow-hidden">
                <div className="h-full bg-blue-500" style={{ width: `${fakeB}%` }} />
              </div>
            </div>
          </div>
        )}

        <div className="text-center space-y-2">
          <p className={`text-7xl font-mono font-bold ${(votingRemaining ?? votingSeconds) <= 3 ? "text-primary animate-pulse" : "text-white"}`}>
            {votingRemaining ?? votingSeconds}
          </p>
          <p className="text-[10px] text-textMuted uppercase tracking-widest">Vote Now</p>
        </div>

        <div className="space-y-3">
          <button onClick={() => handleVote("A")}
            className="w-full py-6 bg-surface border-2 border-primary text-primary font-bold uppercase tracking-widest text-lg hover:bg-primary hover:text-white transition-colors shadow-glow-red">
            {voteLabelA}
          </button>
          <button onClick={() => handleVote("B")}
            className="w-full py-6 bg-surface border-2 border-blue-500 text-blue-400 font-bold uppercase tracking-widest text-lg hover:bg-blue-500 hover:text-white transition-colors">
            {voteLabelB}
          </button>
        </div>

        <AnimatePresence>
          {showConfirm && pendingVote && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-8 space-y-6">
              <h3 className="text-2xl text-white font-serif uppercase tracking-widest text-center">
                Confirm Your Vote
              </h3>
              <p className={`text-5xl font-mono font-bold ${pendingVote === "A" ? "text-primary" : "text-blue-400"}`}>
                {pendingVote === "A" ? optionALabel : optionBLabel}
              </p>
              <p className="text-textMuted text-sm text-center max-w-xs">
                You cannot change your vote after confirmation.
              </p>
              <div className="flex flex-col gap-3 w-full max-w-[250px]">
                <button onClick={confirmVote}
                  className="py-4 bg-secondary text-background font-bold uppercase tracking-widest text-lg shadow-glow-gold hover:bg-white transition-colors">
                  Confirm Vote
                </button>
                <button onClick={() => { setShowConfirm(false); setPendingVote(null); }}
                  className="py-3 border border-border text-textMuted uppercase tracking-widest text-sm hover:text-white transition-colors">
                  Go Back
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  if (phase === "voting_open" && myVote) {
    return (
      <div className="w-full max-w-md mx-auto px-4 pt-12 pb-12 text-center space-y-6 font-mono">
        <div className="p-6 border-2 border-border bg-surface text-center space-y-3">
          <p className="text-[10px] uppercase tracking-widest text-textMuted">Your Vote is Locked</p>
          <p className={`text-5xl font-bold ${myVote === "A" ? "text-primary" : "text-blue-400"}`}>
            {myVote === "A" ? optionALabel : optionBLabel}
          </p>
          <p className="text-[10px] text-textMuted uppercase">Waiting for voting to close...</p>
        </div>
        <div className="flex justify-center gap-8 text-sm text-textMuted">
          <span>{votesA} A</span>
          <span>{votesB} B</span>
          <span>{votedCount} voted</span>
        </div>
        <p className="text-4xl font-mono text-white animate-pulse">{votingRemaining ?? votingSeconds}s</p>
      </div>
    );
  }

  if (phase === "confidence" && myConfidence === null) {
    return (
      <div className="w-full max-w-md mx-auto px-4 pt-12 pb-12 space-y-8 font-mono">
        <div className="text-center space-y-2">
          <h2 className="text-xl font-serif text-white uppercase tracking-widest">How Certain Were You?</h2>
          <p className="text-xs text-textMuted">Your confidence level matters for the verdict.</p>
          {confidenceRemaining !== null && (
            <p className="text-3xl font-mono text-amber-500">{confidenceRemaining}s</p>
          )}
        </div>
        <div className="space-y-3">
          <button onClick={() => handleConfidence(100)}
            className="w-full py-5 bg-surface border-2 border-amber-500 text-amber-500 font-bold uppercase tracking-widest hover:bg-amber-500 hover:text-black transition-colors">
            100% — Certain
          </button>
          <button onClick={() => handleConfidence(70)}
            className="w-full py-5 bg-surface border-2 border-amber-500/50 text-amber-500/70 font-bold uppercase tracking-widest hover:bg-amber-500/20 transition-colors">
            70% — Pretty Sure
          </button>
          <button onClick={() => handleConfidence(50)}
            className="w-full py-5 bg-surface border-2 border-border text-textMuted font-bold uppercase tracking-widest hover:border-textMuted transition-colors">
            50% — Just Guessing
          </button>
        </div>
      </div>
    );
  }

  if ((phase === "confidence" && myConfidence !== null) || phase === "confidence_locked") {
    return (
      <div className="w-full max-w-md mx-auto px-4 pt-12 pb-12 text-center space-y-6 font-mono">
        <div className="p-6 border-2 border-amber-500/50 bg-surface text-center space-y-3">
          <p className="text-[10px] uppercase tracking-widest text-textMuted">Confidence Noted</p>
          <p className="text-4xl font-bold text-amber-500">{myConfidence}%</p>
          <p className="text-[10px] text-textMuted uppercase">Waiting for results...</p>
        </div>
      </div>
    );
  }

  if (phase === "reveal") {
    const isCorrect = myVote === correctAnswer;
    const isOverconfident = isEliminated && myConfidence === 100;

    return (
      <div className="w-full max-w-md mx-auto px-4 pt-8 pb-12 space-y-8 font-mono">
        {b8RevealStep >= 1 && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className="p-6 bg-surface border border-secondary text-center space-y-3">
            <p className="text-[10px] uppercase tracking-widest text-textMuted">The Correct Answer Is</p>
            <p className="text-6xl font-serif text-secondary uppercase tracking-widest">{correctAnswer}</p>
            <p className="text-sm text-textMuted">{correctAnswer === "A" ? optionALabel : optionBLabel}</p>
          </motion.div>
        )}

        {b8RevealStep >= 2 && b8Results && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="p-4 bg-surface border border-border space-y-2">
            <p className="text-[10px] uppercase tracking-widest text-textMuted text-center">Real Vote Split</p>
            <div className="flex h-8 w-full overflow-hidden border border-border">
              <div className="h-full bg-primary" style={{ width: `${(b8Results.votesA / Math.max(b8Results.totalVoters, 1)) * 100}%` }} />
              <div className="h-full bg-blue-500" style={{ width: `${(b8Results.votesB / Math.max(b8Results.totalVoters, 1)) * 100}%` }} />
            </div>
            <div className="flex justify-between text-xs text-textMuted">
              <span className="text-primary">A: {b8Results.votesA}</span>
              <span className="text-blue-400">B: {b8Results.votesB}</span>
            </div>
          </motion.div>
        )}

        {b8RevealStep >= 3 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className={`p-8 border-4 text-center space-y-4 ${isEliminated ? "border-primary bg-primary/10" : "border-secondary bg-secondary/10"}`}>
            <h2 className={`text-4xl font-serif uppercase tracking-widest ${isEliminated ? "text-primary animate-pulse" : "text-secondary"}`}>
              {isEliminated ? "Eliminated" : "Correct — You Survive"}
            </h2>
            <p className="text-textMuted">
              You voted: <span className={myVote === "A" ? "text-primary font-bold" : "text-blue-400 font-bold"}>
                {myVote === "A" ? optionALabel : optionBLabel}
              </span>
            </p>
            {isOverconfident && (
              <div className="p-4 border border-amber-500 bg-amber-500/10">
                <p className="text-amber-500 font-bold uppercase tracking-widest">Overconfident</p>
                <p className="text-textMuted text-xs mt-1">You were certain of the wrong answer.</p>
              </div>
            )}
            {!isEliminated && myConfidence === 100 && (
              <p className="text-secondary text-sm uppercase tracking-widest">+20 bonus — Confidence rewarded</p>
            )}
          </motion.div>
        )}

        {isEliminated && b8RevealStep >= 3 && (
          <p className="text-center text-textMuted text-sm">Redirecting in {redirectCountdown}s...</p>
        )}
      </div>
    );
  }

  return null;
}
