"use client";
import { useState, useEffect, useCallback } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  gameState: any;
  playerId: string;
}

interface PairData {
  pairId: string;
  playerAId: string;
  playerAName: string;
  playerBId: string;
  playerBName: string;
  playerA_sequence: number[] | null;
  playerB_sequence: number[] | null;
  playerA_guess: number[] | null;
  playerB_guess: number[] | null;
  playerA_score: number | null;
  playerB_score: number | null;
  winnerId: string | null;
  loserId: string | null;
  tied: boolean;
  byePair: boolean;
}

export default function GameC9({ gameState, playerId }: Props) {
  const phase = (gameState as any).phase || gameState.phase;
  const gsc = (gameState as any).sequenceConfig || {};
  const showOpponentName = gsc.showOpponentName !== false;
  const revealStep: number = (gameState as any).sequenceRevealStep || 0;

  const [mySequence, setMySequence] = useState<number[]>([0, 0, 0]);
  const [myGuess, setMyGuess] = useState<number[]>([0, 0, 0]);
  const [activeSlot, setActiveSlot] = useState(0);
  const [hasSubmittedA, setHasSubmittedA] = useState(false);
  const [hasSubmittedB, setHasSubmittedB] = useState(false);
  const [opponentName, setOpponentName] = useState<string>("Your Opponent");
  const [myPair, setMyPair] = useState<PairData | null>(null);
  const [sealedCount, setSealedCount] = useState(0);
  const [guessedCount, setGuessedCount] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmType, setConfirmType] = useState<"sequence" | "guess" | null>(null);
  const [isEliminated, setIsEliminated] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState(0);
  const [totalPairs, setTotalPairs] = useState(0);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "sequencePairs", `${gameState.currentSlot}_pairs`),
      async (snap) => {
        if (!snap.exists()) {
          const res = await fetch(`/api/game/sequence/pairs?slotNumber=${gameState.currentSlot}`);
          const data = await res.json();
          if (data.pairs) {
            const pair = data.pairs.find((p: PairData) => p.playerAId === playerId || p.playerBId === playerId);
            if (pair) {
              setMyPair(pair);
              setIsPlayerA(pair.playerAId === playerId);
              setOpponentName(showOpponentName
                ? (pair.playerBId === "BYE" ? "BYE (Auto-advance)" : pair.playerBName)
                : `Opponent #${(pair.playerBId === "BYE" ? pair.playerAId : pair.playerBId).substring(0, 4)}`
              );
            }
          }
          return;
        }
        const pairs = snap.data().pairs || [];
        const pair = pairs.find((p: any) => p.playerAId === playerId || p.playerBId === playerId);
        if (pair) {
          setMyPair(pair);
          const oppId = pair.playerAId === playerId ? pair.playerBId : pair.playerAId;
          setIsPlayerA(pair.playerAId === playerId);
          setOpponentName(showOpponentName
            ? (oppId === "BYE" ? "BYE (Auto-advance)" : (pairs.find((p: any) => p.playerBId === oppId)?.playerBName || `Opponent`))
            : `Opponent #${oppId.substring(0, 4)}`
          );
          setTotalPairs(pairs.length);
          const sealed = pairs.filter((p: any) => p.playerA_sequence && (p.byePair || p.playerB_sequence)).length;
          const guessed = pairs.filter((p: any) => p.byePair || (p.playerA_guess && p.playerB_guess)).length;
          setSealedCount(sealed);
          setGuessedCount(guessed);
        }
      },
      (e) => console.error("Pair snapshot error:", e)
    );
    return () => unsub();
  }, [gameState.currentSlot, playerId, showOpponentName]);

  const [isPlayerA, setIsPlayerA] = useState(true);

  useEffect(() => {
    if (phase === "phase_a_open") {
      setHasSubmittedA(!!myPair?.playerA_sequence || !!myPair?.playerB_sequence);
    }
    if (phase === "phase_b_open" || phase === "phase_b_locked") {
      setHasSubmittedB(!!myPair?.playerA_guess || !!myPair?.playerB_guess);
    }
    if (phase === "reveal") {
      const elimIds: string[] = (gameState as any).pendingEliminations || [];
      const elim = (gameState as any).results?.eliminatedPlayerIds || elimIds;
      setIsEliminated(elim.includes(playerId));
      if (isEliminated) {
        setRedirectCountdown(5);
      }
    }
  }, [phase, myPair, playerId, gameState]);

  useEffect(() => {
    if (redirectCountdown > 0) {
      const t = setTimeout(() => setRedirectCountdown(redirectCountdown - 1), 1000);
      return () => clearTimeout(t);
    } else if (redirectCountdown === 0 && isEliminated && phase === "reveal") {
      window.location.href = "/eliminated";
    }
  }, [redirectCountdown, isEliminated, phase]);

  const submitSequence = async () => {
    if (hasSubmittedA) return;
    try {
      const { doc, updateDoc, serverTimestamp, collection, getDocs, query, where } = await import("firebase/firestore");
      const { db } = await import("@/lib/firebase");
      const snap = await getDocs(query(collection(db, "sequencePairs"), where("slotNumber", "==", gameState.currentSlot)));
      const pair = snap.docs.find(d => d.data().playerAId === playerId || d.data().playerBId === playerId);
      if (!pair) return;
      
      const isA = pair.data().playerAId === playerId;
      await updateDoc(doc(db, "sequencePairs", pair.id), {
        [isA ? "playerA_sequence" : "playerB_sequence"]: mySequence,
      });
      await updateDoc(doc(db, "players", playerId), {
        currentSubmission: { type: "sequence", value: mySequence },
        submittedAt: serverTimestamp()
      });
      setHasSubmittedA(true);
    } catch (e) { console.error(e); }
  };

  const submitGuess = async () => {
    if (hasSubmittedB) return;
    try {
      const { doc, updateDoc, serverTimestamp, collection, getDocs, query, where } = await import("firebase/firestore");
      const { db } = await import("@/lib/firebase");
      const snap = await getDocs(query(collection(db, "sequencePairs"), where("slotNumber", "==", gameState.currentSlot)));
      const pair = snap.docs.find(d => d.data().playerAId === playerId || d.data().playerBId === playerId);
      if (!pair) return;
      
      const isA = pair.data().playerAId === playerId;
      await updateDoc(doc(db, "sequencePairs", pair.id), {
        [isA ? "playerA_guess" : "playerB_guess"]: myGuess,
      });
      await updateDoc(doc(db, "players", playerId), {
        currentSubmission: { type: "guess", value: myGuess },
        submittedAt: serverTimestamp()
      });
      setHasSubmittedB(true);
    } catch (e) { console.error(e); }
  };

  const increment = (idx: number, type: "seq" | "guess") => {
    if (type === "seq" && !hasSubmittedA) {
      const next = [...mySequence];
      next[idx] = next[idx] === 9 ? 0 : next[idx] + 1;
      setMySequence(next);
      setActiveSlot(idx);
    }
    if (type === "guess" && !hasSubmittedB) {
      const next = [...myGuess];
      next[idx] = next[idx] === 9 ? 0 : next[idx] + 1;
      setMyGuess(next);
      setActiveSlot(idx);
    }
  };

  const decrement = (idx: number, type: "seq" | "guess") => {
    if (type === "seq" && !hasSubmittedA) {
      const next = [...mySequence];
      next[idx] = next[idx] === 0 ? 9 : next[idx] - 1;
      setMySequence(next);
      setActiveSlot(idx);
    }
    if (type === "guess" && !hasSubmittedB) {
      const next = [...myGuess];
      next[idx] = next[idx] === 0 ? 9 : next[idx] - 1;
      setMyGuess(next);
      setActiveSlot(idx);
    }
  };

  const handleNumpad = (num: number, type: "seq" | "guess") => {
    if (type === "seq" && !hasSubmittedA) {
      const next = [...mySequence];
      next[activeSlot] = num;
      setMySequence(next);
      setActiveSlot((activeSlot + 1) % 3);
    }
    if (type === "guess" && !hasSubmittedB) {
      const next = [...myGuess];
      next[activeSlot] = num;
      setMyGuess(next);
      setActiveSlot((activeSlot + 1) % 3);
    }
  };

  if (phase === "lobby" || phase === "pairing") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4 text-center px-4">
        <div className="w-12 h-12 border-4 border-secondary border-t-transparent rounded-full animate-spin" />
        <h2 className="text-xl uppercase tracking-widest text-secondary font-bold">Sequence Match</h2>
        <p className="text-textMuted text-sm uppercase tracking-widest animate-pulse">
          {phase === "pairing" ? "Pairs are being assigned..." : "Stand by for pairing..."}
        </p>
      </div>
    );
  }

  const renderInputBox = (val: number, idx: number, isAmber: boolean, type: "seq" | "guess") => {
    const isActive = activeSlot === idx;
    const disabled = type === "seq" ? hasSubmittedA : hasSubmittedB;
    return (
      <div className="flex flex-col items-center space-y-2" key={idx}>
        <button onClick={() => increment(idx, type)}
          className={`w-14 h-10 flex items-center justify-center transition-colors ${disabled ? "opacity-30 cursor-not-allowed" : `hover:bg-border ${isAmber ? "text-amber-500 border-amber-500" : "text-primary border-primary"} bg-surface border border-border`}`}>
          ▲
        </button>
        <div onClick={() => !disabled && setActiveSlot(idx)}
          className={`w-16 h-20 flex items-center justify-center border-2 cursor-pointer transition-all ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"} ${isActive ? (isAmber ? "border-amber-500 shadow-glow-gold scale-105" : "border-primary shadow-glow-red scale-105") : "border-border bg-surface"}`}>
          <span className={`font-mono text-4xl ${isActive ? (isAmber ? "text-amber-500" : "text-white") : "text-textDefault"}`}>{val}</span>
        </div>
        <button onClick={() => decrement(idx, type)}
          className={`w-14 h-10 flex items-center justify-center transition-colors ${disabled ? "opacity-30 cursor-not-allowed" : `hover:bg-border ${isAmber ? "text-amber-500 border-amber-500" : "text-primary border-primary"} bg-surface border border-border`}`}>
          ▼
        </button>
      </div>
    );
  };

  const renderNumpad = (type: "seq" | "guess") => {
    const disabled = type === "seq" ? hasSubmittedA : hasSubmittedB;
    return (
      <div className="grid grid-cols-3 gap-2 w-full max-w-[200px] mx-auto mt-6">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
          <button key={n} onClick={() => handleNumpad(n, type)}
            className={`aspect-square flex items-center justify-center text-xl font-mono transition-colors active:scale-95 ${disabled ? "opacity-30 cursor-not-allowed" : "bg-surface border border-border hover:bg-border"}`}>
            {n}
          </button>
        ))}
        <button onClick={() => setActiveSlot(Math.max(0, activeSlot - 1))}
          className={`aspect-square flex items-center justify-center text-lg hover:bg-border transition-colors ${disabled ? "opacity-30" : "bg-surface border border-border"}`}>◄</button>
        <button onClick={() => handleNumpad(0, type)}
          className={`aspect-square flex items-center justify-center text-xl font-mono transition-colors active:scale-95 ${disabled ? "opacity-30 cursor-not-allowed" : "bg-surface border border-border hover:bg-border"}`}>0</button>
        <button onClick={() => setActiveSlot(Math.min(2, activeSlot + 1))}
          className={`aspect-square flex items-center justify-center text-lg hover:bg-border transition-colors ${disabled ? "opacity-30" : "bg-surface border border-border"}`}>►</button>
      </div>
    );
  };

  const renderConfirmOverlay = () => (
    <AnimatePresence>
      {showConfirm && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-8 space-y-8">
          <h3 className="text-2xl text-white font-serif uppercase tracking-widest text-center">
            {confirmType === "sequence" ? "Seal Your Sequence" : "Lock In Your Guess"}
          </h3>
          <div className="flex justify-center space-x-6 text-5xl font-mono">
            {confirmType === "sequence" ? mySequence.map((v, i) => (
              <span key={i} className="text-primary">{v}</span>
            )) : myGuess.map((v, i) => (
              <span key={i} className="text-amber-500">{v}</span>
            ))}
          </div>
          <p className="text-textMuted text-center text-sm max-w-xs">
            {confirmType === "sequence"
              ? "Your opponent must guess this exactly. You cannot change it after sealing."
              : "This will be your final guess. No changes allowed after locking."}
          </p>
          <div className="flex flex-col gap-3 w-full max-w-[250px]">
            <button onClick={() => { setShowConfirm(false); confirmType === "sequence" ? submitSequence() : submitGuess(); }}
              className="py-4 bg-secondary text-background font-bold uppercase tracking-widest text-lg shadow-glow-gold hover:bg-white transition-colors">
              Confirm — Lock It
            </button>
            <button onClick={() => setShowConfirm(false)}
              className="py-3 border border-border text-textMuted uppercase tracking-widest text-sm hover:text-white transition-colors">
              Go Back — Change It
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (phase === "phase_a_open" || phase === "phase_a_locked") {
    return (
      <div className="w-full flex flex-col items-center px-4 pt-4 pb-12">
        <div className="w-full text-center space-y-3 mb-8">
          <div className="flex justify-center space-x-2 text-primary"><span>●</span><span className="opacity-20">●</span></div>
          <p className="text-[10px] text-textMuted uppercase tracking-widest">Step 1 of 2</p>
          <h2 className="text-xl font-serif text-white">Create Your Secret Sequence</h2>
          <p className="text-xs text-textMuted max-w-xs mx-auto">Three digits, 0–9. Your opponent will try to guess it.</p>
        </div>

        <div className="flex justify-center space-x-6">
          {mySequence.map((v, i) => renderInputBox(v, i, false, "seq"))}
        </div>

        {!hasSubmittedA ? (
          <>
            {renderNumpad("seq")}
            <button onClick={() => { setConfirmType("sequence"); setShowConfirm(true); }}
              className="w-full max-w-xs mt-10 py-4 bg-primary text-background text-lg font-bold uppercase tracking-widest shadow-glow-red hover:bg-primary/80 transition-colors">
              Seal My Sequence
            </button>
          </>
        ) : (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="mt-10 p-8 border border-border bg-surface text-center max-w-xs w-full">
            <p className="text-[10px] uppercase tracking-widest text-textMuted mb-4">Your Sealed Sequence</p>
            <p className="text-4xl font-mono text-white tracking-[0.5em]">{mySequence.join("")} ✓</p>
            <p className="text-[10px] text-textMuted mt-4 uppercase tracking-widest">
              {phase === "phase_a_locked" ? "Phase B opening..." : `Waiting... (${sealedCount} / ${totalPairs || 0} sealed)`}
            </p>
          </motion.div>
        )}

        {renderConfirmOverlay()}
      </div>
    );
  }

  if (phase === "phase_b_open" || phase === "phase_b_locked") {
    return (
      <div className="w-full flex flex-col items-center px-4 pt-4 pb-12">
        <div className="w-full text-center space-y-3 mb-8">
          <div className="flex justify-center space-x-2 text-amber-500"><span className="opacity-20">●</span><span>●</span></div>
          <p className="text-[10px] text-textMuted uppercase tracking-widest">Step 2 of 2</p>
          <h2 className="text-xl font-serif text-amber-500">Guess Opponent Sequence</h2>
          <div className="bg-surface border border-border p-3 max-w-sm mx-auto">
            <p className="text-[10px] text-textMuted mb-1">Your Opponent</p>
            <p className="text-primary font-bold tracking-widest">{opponentName}</p>
          </div>
        </div>

        <div className="flex justify-center space-x-6">
          {myGuess.map((v, i) => renderInputBox(v, i, true, "guess"))}
        </div>

        {!hasSubmittedB ? (
          <>
            {renderNumpad("guess")}
            <button onClick={() => { setConfirmType("guess"); setShowConfirm(true); }}
              className="w-full max-w-xs mt-10 py-4 bg-amber-500 text-black text-lg font-bold uppercase tracking-widest shadow-glow-gold hover:bg-amber-400 transition-colors">
              Lock In Guess
            </button>
          </>
        ) : (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="mt-10 p-8 border border-amber-500/50 bg-surface text-center max-w-xs w-full">
            <p className="text-[10px] uppercase tracking-widest text-textMuted mb-4">Your Locked Guess</p>
            <p className="text-4xl font-mono text-amber-500 tracking-[0.5em]">{myGuess.join("")} ✓</p>
            <p className="text-[10px] text-textMuted mt-4 uppercase tracking-widest">
              {phase === "phase_b_locked" ? "Calculating..." : `Waiting... (${guessedCount} / ${totalPairs || 0} guessed)`}
            </p>
          </motion.div>
        )}

        {renderConfirmOverlay()}
      </div>
    );
  }

  if (phase === "calculating") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4 text-center">
        <div className="w-12 h-12 border-4 border-secondary border-t-transparent rounded-full animate-spin" />
        <p className="text-textMuted uppercase tracking-widest animate-pulse">Calculating Scores...</p>
      </div>
    );
  }

  if (phase === "reveal") {
    const isA = myPair?.playerAId === playerId;
    const myActualSeq = isA ? myPair?.playerA_sequence : myPair?.playerB_sequence;
    const oppActualSeq = isA ? myPair?.playerB_sequence : myPair?.playerA_sequence;
    const myGuessOfOpp = isA ? myPair?.playerA_guess : myPair?.playerB_guess;
    const oppGuessOfMe = isA ? myPair?.playerB_guess : myPair?.playerA_guess;
    const myScore = isA ? myPair?.playerA_score : myPair?.playerB_score;
    const oppScore = isA ? myPair?.playerB_score : myPair?.playerA_score;
    const iWin = (myScore ?? 999) < (oppScore ?? 999);
    const tie = myScore === oppScore;

    if (isEliminated) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4 px-4">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="border-4 border-primary bg-primary/10 p-12 text-center space-y-4 max-w-sm">
            <h2 className="text-5xl font-serif text-primary uppercase tracking-widest animate-pulse">Eliminated</h2>
            <p className="text-textMuted font-mono">
              Your score: {myScore} — Their score: {oppScore}
            </p>
            <p className="text-primary/70 text-sm uppercase tracking-widest">
              They read you better.
            </p>
          </motion.div>
          <p className="text-textMuted text-sm">Redirecting in {redirectCountdown}s...</p>
        </div>
      );
    }

    return (
      <div className="w-full max-w-lg mx-auto px-4 pt-6 space-y-8">
        <div className="text-center space-y-3">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className={`border-4 p-8 text-center space-y-3 ${iWin ? "border-secondary bg-secondary/10 shadow-glow-gold" : tie ? "border-amber-500 bg-amber-500/10" : "border-border bg-surface grayscale"}`}>
            <h2 className="text-3xl font-serif uppercase tracking-widest">
              {iWin ? "You Survive" : tie ? "Tied — Awaiting Decision" : "They Survive"}
            </h2>
            <div className="flex justify-center items-center gap-6 font-mono text-2xl">
              <div className={iWin ? "text-secondary font-bold" : tie ? "text-amber-500" : "text-textMuted"}>
                <p className="text-[10px] mb-1 uppercase">Your Score</p>
                <p>{myScore ?? "—"}</p>
              </div>
              <span className="text-textMuted/50">VS</span>
              <div className={!iWin && !tie ? "text-secondary font-bold" : tie ? "text-amber-500" : "text-textMuted"}>
                <p className="text-[10px] mb-1 uppercase">Their Score</p>
                <p>{oppScore ?? "—"}</p>
              </div>
            </div>
          </motion.div>
        </div>

        {revealStep >= 1 && oppGuessOfMe && myActualSeq && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="p-4 border border-border bg-surface space-y-3">
            <h4 className="text-xs uppercase tracking-widest text-textMuted text-center">Their guess of your sequence</h4>
            <div className="flex justify-center space-x-4 text-xl font-mono">
              <div className="flex flex-col items-center space-y-2">
                <span className="text-[8px] text-textMuted">Your Seq</span>
                {myActualSeq.map((v, i) => (
                  <span key={i} className="w-10 h-10 flex items-center justify-center border border-border bg-background">{v}</span>
                ))}
              </div>
              <div className="flex flex-col justify-center space-y-1 pt-4">
                <span className="text-textMuted/50">−</span><span className="text-textMuted/50">−</span><span className="text-textMuted/50">−</span>
              </div>
              <div className="flex flex-col items-center space-y-2">
                <span className="text-[8px] text-amber-500">They Guessed</span>
                {oppGuessOfMe.map((v, i) => (
                  <span key={i} className="w-10 h-10 flex items-center justify-center border border-amber-500/50 bg-amber-500/10">{v}</span>
                ))}
              </div>
              <div className="flex flex-col justify-center space-y-1 pt-4">
                <span className="text-textMuted/50">=</span><span className="text-textMuted/50">=</span><span className="text-textMuted/50">=</span>
              </div>
              <div className="flex flex-col items-center space-y-2">
                <span className="text-[8px] text-green-400">Diff</span>
                {myActualSeq?.map((v, i) => (
                  <span key={i} className="w-10 h-10 flex items-center justify-center border-l border-border pl-2 text-green-400">
                    {Math.abs(v - (oppGuessOfMe?.[i] || 0))}
                  </span>
                ))}
              </div>
            </div>
            <p className="text-center text-sm text-textMuted pt-2">Their score: <span className="text-amber-500 font-bold">{oppScore}</span></p>
          </motion.div>
        )}

        {revealStep >= 2 && myGuessOfOpp && oppActualSeq && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="p-4 border border-border bg-surface space-y-3">
            <h4 className="text-xs uppercase tracking-widest text-textMuted text-center">Your guess of their sequence</h4>
            <div className="flex justify-center space-x-4 text-xl font-mono">
              <div className="flex flex-col items-center space-y-2">
                <span className="text-[8px] text-textMuted">Their Seq</span>
                {oppActualSeq.map((v, i) => (
                  <span key={i} className="w-10 h-10 flex items-center justify-center border border-border bg-background">{v}</span>
                ))}
              </div>
              <div className="flex flex-col justify-center space-y-1 pt-4">
                <span className="text-textMuted/50">−</span><span className="text-textMuted/50">−</span><span className="text-textMuted/50">−</span>
              </div>
              <div className="flex flex-col items-center space-y-2">
                <span className="text-[8px] text-primary">You Guessed</span>
                {myGuessOfOpp.map((v, i) => (
                  <span key={i} className="w-10 h-10 flex items-center justify-center border border-primary/50 bg-primary/10">{v}</span>
                ))}
              </div>
              <div className="flex flex-col justify-center space-y-1 pt-4">
                <span className="text-textMuted/50">=</span><span className="text-textMuted/50">=</span><span className="text-textMuted/50">=</span>
              </div>
              <div className="flex flex-col items-center space-y-2">
                <span className="text-[8px] text-green-400">Diff</span>
                {oppActualSeq?.map((v, i) => (
                  <span key={i} className="w-10 h-10 flex items-center justify-center border-l border-border pl-2 text-green-400">
                    {Math.abs(v - (myGuessOfOpp?.[i] || 0))}
                  </span>
                ))}
              </div>
            </div>
            <p className="text-center text-sm text-textMuted pt-2">Your score: <span className="text-primary font-bold">{myScore}</span></p>
          </motion.div>
        )}
      </div>
    );
  }

  return null;
}
