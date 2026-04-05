import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface GameC9Props {
  onSubmit: (val: any) => void;
  isLocked: boolean; // Derived from page, so it's true during locked_a, locked_b, etc.
  currentSubmission: any; // Used differently here probably
  results: any;
  playerId: string;
  timeLeft: number | null;
  gameState: any;
}

export default function GameC9({ onSubmit, isLocked, currentSubmission, results, playerId, timeLeft, gameState }: GameC9Props) {
  const [phase, setPhase] = useState("waiting"); // 'waiting', 'a', 'b', 'reveal'
  const [sequence, setSequence] = useState([0, 0, 0]);
  const [guess, setGuess] = useState([0, 0, 0]);
  const [myPair, setMyPair] = useState<any>(null);
  const [opponentName, setOpponentName] = useState("Unknown");
  const [showConfirm, setShowConfirm] = useState(false);
  const [revealStep, setRevealStep] = useState(0);

  // Determine local UI state based on global phase
  useEffect(() => {
    if (gameState.phase === "active_a" || gameState.phase === "locked_a") {
      setPhase("a");
    } else if (gameState.phase === "active_b" || gameState.phase === "locked_b" || gameState.phase === "calculating") {
      setPhase("b");
    } else if (gameState.phase === "reveal" || gameState.phase === "confirm") {
      setPhase("reveal");
    } else {
      setPhase("waiting");
    }
  }, [gameState.phase]);

  // Subscribe to pairs for opponent naming and pair status
  useEffect(() => {
    if (!gameState.currentSlot) return;
    const unsub = onSnapshot(doc(db, "pairs", String(gameState.currentSlot)), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const pair = data.pairs?.find((p: any) => p.playerAId === playerId || p.playerBId === playerId);
        setMyPair(pair);
        if (pair) {
          const isA = pair.playerAId === playerId;
          // In a real app we'd fetch the opponent's name from players, but we might just store names in the pair doc.
          // Let's assume the pairing process stores playerAName and playerBName for convenience.
          if (isA) setOpponentName(pair.playerBName || pair.playerBId);
          else setOpponentName(pair.playerAName || pair.playerAId);
        }
      }
    });
    return () => unsub();
  }, [gameState.currentSlot, playerId]);

  // Auto submit when time runs out
  useEffect(() => {
    if (timeLeft === 0 && !isLocked && currentSubmission === null) {
      if (gameState.phase === "active_a") onSubmit({ type: "sequence", value: sequence });
      if (gameState.phase === "active_b") onSubmit({ type: "guess", value: guess });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, isLocked, currentSubmission, gameState.phase]);

  useEffect(() => {
    if (phase === "reveal" && results?.pairs) {
      setRevealStep(1);
      const t1 = setTimeout(() => setRevealStep(2), 2000);
      const t2 = setTimeout(() => setRevealStep(3), 4000);
      const t3 = setTimeout(() => setRevealStep(4), 5000);
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    }
  }, [phase, results]);


  const handleAdjustSequence = (index: number, delta: number) => {
    const newSeq = [...sequence];
    let val = newSeq[index] + delta;
    if (val > 9) val = 0;
    if (val < 0) val = 9;
    newSeq[index] = val;
    setSequence(newSeq);
  };

  const handleAdjustGuess = (index: number, delta: number) => {
    const newSeq = [...guess];
    let val = newSeq[index] + delta;
    if (val > 9) val = 0;
    if (val < 0) val = 9;
    newSeq[index] = val;
    setGuess(newSeq);
  };

  const handleConfirm = () => {
    if (gameState.phase === "active_a") {
      onSubmit({ type: "sequence", value: sequence });
    } else if (gameState.phase === "active_b") {
      onSubmit({ type: "guess", value: guess });
    }
    setShowConfirm(false);
  };

  if (phase === "waiting") {
    return (
       <div className="flex flex-col items-center justify-center p-8 text-center space-y-4 h-[60vh]">
          <p className="text-secondary text-lg animate-pulse tracking-widest uppercase">You will be paired with an opponent...</p>
          <p className="text-sm text-textMuted font-mono">Wait for the host to assign pairs.</p>
       </div>
    );
  }

  if (phase === "reveal" && results?.pairs && myPair) {
    const pairResult = results.pairs.find((p: any) => p.pairId === myPair?.pairId);
    if (!pairResult) return <div className="text-center p-8">Error finding your result.</div>;

    const isA = pairResult.playerAId === playerId;
    
    const mySequence = isA ? pairResult.playerA_sequence : pairResult.playerB_sequence;
    const oppGuessOfMe = isA ? pairResult.playerB_guess : pairResult.playerA_guess;
    const oppScore = isA ? pairResult.playerB_score : pairResult.playerA_score;

    const oppSequence = isA ? pairResult.playerB_sequence : pairResult.playerA_sequence;
    const myGuessOfOpp = isA ? pairResult.playerA_guess : pairResult.playerB_guess;
    const myScore = isA ? pairResult.playerA_score : pairResult.playerB_score;

    const didIWin = pairResult.winnerId === playerId;
    const isEliminated = results.eliminatedPlayerIds?.includes(playerId);
    const isTied = pairResult.tied;

    return (
      <div className="w-full space-y-8 flex flex-col items-center mt-4">
        <h2 className="text-3xl font-serif text-white tracking-widest uppercase mb-4 text-center">Reveal</h2>

        <div className="w-full space-y-6">
          {/* STEP 1: Opponent's guess of my sequence */}
          <div className={`p-4 border ${revealStep >= 1 ? 'border-border bg-surface' : 'border-transparent opacity-0'} transition-all duration-500`}>
             <p className="text-xs text-textMuted uppercase tracking-widest mb-4">Your opponent guessing you:</p>
             <div className="flex justify-between items-center bg-background p-2 border border-border mb-2">
                <span className="text-xs text-secondary">Your Secret:</span>
                <span className="font-mono text-lg tracking-widest">{mySequence?.join(' · ')}</span>
             </div>
             <div className="flex justify-between items-center bg-background p-2 border border-border">
                <span className="text-xs text-textMuted">Their Guess:</span>
                <span className="font-mono text-lg tracking-widest">{oppGuessOfMe?.join(' · ') || "— · — · —"}</span>
             </div>
             <div className="mt-4 pt-2 border-t border-border flex justify-between items-center text-primary font-bold">
                <span className="uppercase text-xs tracking-widest">Their Score (Lower is better):</span>
                <span>{oppScore} pts away</span>
             </div>
          </div>

          {/* STEP 2: My guess of Opponent's sequence */}
          <div className={`p-4 border ${revealStep >= 2 ? 'border-secondary/50 bg-secondary/10' : 'border-transparent opacity-0'} transition-all duration-500`}>
             <p className="text-xs text-secondary uppercase shadow-glow-gold mb-4">You guessing them:</p>
             <div className="flex justify-between items-center bg-background p-2 border border-border mb-2">
                <span className="text-xs text-textMuted">Their Secret:</span>
                <span className="font-mono text-lg tracking-widest">{oppSequence?.join(' · ')}</span>
             </div>
             <div className="flex justify-between items-center bg-background p-2 border border-border">
                <span className="text-xs text-secondary">Your Guess:</span>
                <span className="font-mono text-lg tracking-widest">{myGuessOfOpp?.join(' · ') || "— · — · —"}</span>
             </div>
             <div className="mt-4 pt-2 border-t border-border flex justify-between items-center text-secondary font-bold">
                <span className="uppercase text-xs tracking-widest">Your Score (Lower is better):</span>
                <span>{myScore} pts away</span>
             </div>
          </div>
        </div>

        {/* STEP 3 & 4: Verdict */}
        {revealStep >= 3 && (
           <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full text-center p-6 border-2 border-border bg-surface mt-4">
              {isTied ? (
                 <div className="text-secondary tracking-widest">
                    <h3 className="text-3xl font-serif uppercase animate-pulse">TIED</h3>
                    <p className="text-sm mt-2">Both scored {myScore}. Awaiting admin decision.</p>
                 </div>
              ) : didIWin ? (
                 <div className="text-secondary tracking-widest">
                    <p className="text-xs uppercase mb-2 shadow-glow-gold">You guessed better ({myScore} vs {oppScore})</p>
                    <h3 className="text-4xl font-serif uppercase">YOU SURVIVE</h3>
                 </div>
              ) : isEliminated ? (
                 <div className="text-primary tracking-widest">
                    <p className="text-xs uppercase mb-2">They guessed better ({oppScore} vs {myScore})</p>
                    <h3 className="text-5xl font-serif uppercase animate-pulse drop-shadow-glow-red">ELIMINATED</h3>
                    <p className="text-xs mt-2">They read you better.</p>
                 </div>
              ) : (
                 <div className="text-textMuted tracking-widest">
                    <h3 className="text-2xl font-serif uppercase">Round Ended</h3>
                 </div>
              )}
           </motion.div>
        )}
      </div>
    );
  }

  // --- Phase A & B Shared Layout ---
  const isPhaseA = phase === "a";
  const isActive = isPhaseA ? gameState.phase === "active_a" : gameState.phase === "active_b";
  const myCurrentSub = currentSubmission; // from game-service: value sent in submitGameInput
  // Because myCurrentSub is overwritten in active_b, we should ideally separate them if we want to show 'your secret is X'.
  // However, isLocked checks if myCurrentSub is sent for THIS active phase realistically.
  
  // To avoid complexity, we rely on the global 'active_a'/'locked_a' phase state and the player's 'currentSubmission' doc, which gets cleared by the admin between 'active_a' and 'active_b' ideally?
  // Wait, the orchestrator needs to clear submissions between active_a and active_b if we use the same pipeline!!
  // I must remember to clear submissions when transitioning. Let's just trust isLocked checks for now, or implement local lock state.
  const locLocked = !isActive || myCurrentSub !== null;

  return (
    <div className="w-full max-w-md mx-auto space-y-6 mt-4 pb-20">
       <div className="text-center space-y-2 mb-8">
          <p className="text-secondary text-sm uppercase tracking-widest font-bold">Round {gameState.currentSlot} · Sequence Match</p>
          <div className="flex justify-center gap-2 mt-4 text-[10px] uppercase tracking-widest text-textMuted pb-4">
             <div className={`flex items-center gap-1 ${isPhaseA ? 'text-secondary' : 'text-textMuted'}`}>
                <div className={`w-2 h-2 rounded-full ${isPhaseA ? 'bg-secondary shadow-glow-gold' : 'bg-border'}`} /> Step 1
             </div>
             <div className="w-8 h-px bg-border my-auto mx-2" />
             <div className={`flex items-center gap-1 ${!isPhaseA ? 'text-secondary' : 'text-textMuted'}`}>
                <div className={`w-2 h-2 rounded-full ${!isPhaseA ? 'bg-secondary shadow-glow-gold' : 'bg-border'}`} /> Step 2
             </div>
          </div>
       </div>

       {isPhaseA ? (
          <div className="bg-surface border border-border p-6 text-center space-y-8">
             <h2 className="text-xl tracking-widest uppercase font-bold text-white">Create your Secret</h2>
             <p className="text-xs text-textMuted uppercase leading-relaxed">Create your secret 3-digit sequence. Each digit can be 0–9. Your opponent will try to guess it. Make it hard.</p>
             
             <div className="flex gap-4 justify-center">
                {[0, 1, 2].map(i => (
                   <div key={i} className="flex flex-col items-center bg-background border border-border rounded-sm w-20">
                      <button disabled={locLocked} onClick={() => handleAdjustSequence(i, 1)} className="w-full py-4 text-textMuted hover:text-white transition active:bg-white/10">▲</button>
                      <div className="text-4xl font-mono text-white py-2">{sequence[i]}</div>
                      <button disabled={locLocked} onClick={() => handleAdjustSequence(i, -1)} className="w-full py-4 text-textMuted hover:text-white transition active:bg-white/10">▼</button>
                   </div>
                ))}
             </div>
             
             {!locLocked ? (
                <button 
                  onClick={() => setShowConfirm(true)}
                  className="w-full bg-primary/20 hover:bg-primary text-primary hover:text-white border border-primary py-4 uppercase tracking-widest font-bold transition-colors shadow-glow-red"
                >
                   SEAL YOUR SEQUENCE
                </button>
             ) : (
                <div className="p-4 border border-secondary text-secondary bg-secondary/10 shadow-glow-gold uppercase tracking-widest">
                   <p className="text-xs font-bold mb-2">Sequence Sealed ✓</p>
                   <p className="text-[10px] opacity-70">Waiting for other players to finish...</p>
                </div>
             )}
          </div>
       ) : (
          <div className="bg-surface border border-border p-6 text-center space-y-8">
             <h2 className="text-xl tracking-widest uppercase font-bold text-secondary text-shadow-glow">Guess Opponent</h2>
             <div className="bg-background border border-border p-3">
                <p className="text-[10px] text-textMuted uppercase tracking-widest mb-1">Your Target</p>
                <p className="text-sm font-bold tracking-widest text-secondary">{opponentName}</p>
             </div>
             <p className="text-[10px] text-textMuted uppercase leading-relaxed">Lower difference = better score. What did they pick?</p>
             
             <div className="flex gap-4 justify-center">
                {[0, 1, 2].map(i => (
                   <div key={i} className="flex flex-col items-center bg-background border border-secondary/50 rounded-sm w-20 shadow-glow-gold">
                      <button disabled={locLocked} onClick={() => handleAdjustGuess(i, 1)} className="w-full py-4 text-secondary/70 hover:text-secondary transition active:bg-secondary/20">▲</button>
                      <div className="text-4xl font-mono text-secondary py-2 drop-shadow-glow-gold">{guess[i]}</div>
                      <button disabled={locLocked} onClick={() => handleAdjustGuess(i, -1)} className="w-full py-4 text-secondary/70 hover:text-secondary transition active:bg-secondary/20">▼</button>
                   </div>
                ))}
             </div>
             
             {!locLocked ? (
                <button 
                  onClick={() => setShowConfirm(true)}
                  className="w-full bg-secondary text-background hover:bg-white py-4 uppercase tracking-widest font-bold transition-colors shadow-glow-gold"
                >
                   LOCK IN GUESS
                </button>
             ) : (
                <div className="p-4 border border-secondary text-secondary bg-secondary/10 shadow-glow-gold uppercase tracking-widest">
                   <p className="text-xs font-bold mb-2">Guess Locked ✓</p>
                   <p className="text-[10px] opacity-70">Waiting for all players to finish guessing...</p>
                </div>
             )}
          </div>
       )}

       {/* Confirm Overlay */}
       <AnimatePresence>
          {showConfirm && (
             <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4 backdrop-blur-sm"
             >
                <div className="max-w-sm w-full bg-surface border border-border p-8 space-y-8 text-center text-white">
                   <h3 className="font-serif text-2xl uppercase tracking-widest">Confirm {isPhaseA ? 'Sequence' : 'Guess'}</h3>
                   <div className="space-y-4 text-sm text-textMuted">
                      <p>Your {isPhaseA ? 'secret sequence' : 'guess'}:</p>
                      <p className={`text-4xl font-mono ${!isPhaseA && 'text-secondary drop-shadow-glow-gold pb-4'}`}>
                         {(isPhaseA ? sequence : guess).join(' · ')}
                      </p>
                      <p className="text-primary uppercase mt-4 text-[10px] sm:text-xs">Once sealed, this cannot be changed.</p>
                   </div>
                   <div className="flex gap-4">
                      <button onClick={() => setShowConfirm(false)} className="flex-1 border border-border bg-background py-3 uppercase tracking-widest text-xs hover:bg-border transition">Change</button>
                      <button onClick={handleConfirm} className="flex-1 bg-primary text-white py-3 uppercase tracking-widest text-xs font-bold hover:bg-primary/80 transition shadow-glow-red">Confirm</button>
                   </div>
                </div>
             </motion.div>
          )}
       </AnimatePresence>

    </div>
  );
}
