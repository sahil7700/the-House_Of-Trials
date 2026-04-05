import { useState, useEffect } from "react";
import { GameState } from "@/lib/services/game-service";
import { doc, updateDoc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  gameState: GameState;
  playerId: string;
}

export default function GameC9({ gameState, playerId }: Props) {
  const gsc = (gameState as any).gameSpecificConfig || {};
  const isLobby = gameState.phase === "lobby";
  const isPhaseA = gameState.phase === "active_a" || gameState.phase === "active";
  const isPhaseA_Locked = gameState.phase === "locked_a" || gameState.phase === "locked";
  const isPhaseB = gameState.phase === "active_b";
  const isPhaseB_Locked = gameState.phase === "locked_b";
  const isReveal = gameState.phase === "reveal";
  const isCalculating = gameState.phase === "calculating";

  const [mySequence, setMySequence] = useState<number[]>([0, 0, 0]);
  const [myGuess, setMyGuess] = useState<number[]>([0, 0, 0]);
  const [activeSlot, setActiveSlot] = useState(0);
  const [hasSubmittedA, setHasSubmittedA] = useState(false);
  const [hasSubmittedB, setHasSubmittedB] = useState(false);
  const [opponentName, setOpponentName] = useState<string>("Unknown Opponent");
  const [myResultPair, setMyResultPair] = useState<any>(null);

  // Live listen to pair documents to get opponent's name correctly
  useEffect(() => {
     if (isLobby) return;
     const unsub = onSnapshot(doc(db, "pairs", String(gameState.currentSlot)), async (snap) => {
        if (!snap.exists()) return;
        const pairs = snap.data().pairs || [];
        const myPair = pairs.find((p: any) => p.playerAId === playerId || p.playerBId === playerId);
        if (myPair) {
           setMyResultPair(myPair);
           // Find opponent ID
           const oppId = myPair.playerAId === playerId ? myPair.playerBId : myPair.playerAId;
           // If opponent is myself (dummy pair), handle gracefully
           if (oppId === playerId) {
              setOpponentName("Yourself (Dummy Match)");
              return;
           }
           // We might not have the player list locally in Game UI easily. We ideally want the admin to have it. 
           // But since we don't have user profiles embedded in `pairs`, we will fall back to showing Opponent ID.
           setOpponentName(`Opponent #${oppId.substring(0, 4)}`);
        }
     });
     return () => unsub();
  }, [gameState.currentSlot, playerId, isLobby]);

  const submitSequence = async () => {
     if (hasSubmittedA) return;
     try {
       await updateDoc(doc(db, "players", playerId), {
         currentSubmission: { type: "sequence", value: mySequence }
       });
       setHasSubmittedA(true);
     } catch (e) { console.error(e); }
  };

  const submitGuess = async () => {
     if (hasSubmittedB) return;
     try {
       await updateDoc(doc(db, "players", playerId), {
         currentSubmission: { type: "guess", value: myGuess }
       });
       setHasSubmittedB(true);
     } catch (e) { console.error(e); }
  };

  const handleNumpad = (num: number) => {
     if (isPhaseA && !hasSubmittedA) {
        const next = [...mySequence];
        next[activeSlot] = num;
        setMySequence(next);
        setActiveSlot((activeSlot + 1) % 3);
     }
     if (isPhaseB && !hasSubmittedB) {
        const next = [...myGuess];
        next[activeSlot] = num;
        setMyGuess(next);
        setActiveSlot((activeSlot + 1) % 3);
     }
  };

  const increment = (idx: number) => {
     if (isPhaseA && !hasSubmittedA) {
        const next = [...mySequence];
        next[idx] = next[idx] === 9 ? 0 : next[idx] + 1;
        setMySequence(next);
        setActiveSlot(idx);
     }
     if (isPhaseB && !hasSubmittedB) {
        const next = [...myGuess];
        next[idx] = next[idx] === 9 ? 0 : next[idx] + 1;
        setMyGuess(next);
        setActiveSlot(idx);
     }
  };

  const decrement = (idx: number) => {
     if (isPhaseA && !hasSubmittedA) {
        const next = [...mySequence];
        next[idx] = next[idx] === 0 ? 9 : next[idx] - 1;
        setMySequence(next);
        setActiveSlot(idx);
     }
     if (isPhaseB && !hasSubmittedB) {
        const next = [...myGuess];
        next[idx] = next[idx] === 0 ? 9 : next[idx] - 1;
        setMyGuess(next);
        setActiveSlot(idx);
     }
  };

  if (isLobby) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center animate-fade-in min-h-[50vh]">
        <div className="w-16 h-16 border-t-2 border-r-2 border-secondary rounded-full animate-spin mb-8"></div>
        <h2 className="text-xl uppercase tracking-widest text-secondary font-bold mb-4">Sequence Match</h2>
        <p className="text-textMuted uppercase tracking-widest text-sm animate-pulse mb-2">You will be paired with an opponent.</p>
        <p className="text-textMuted text-xs">Wait for the host to assign pairs.</p>
      </div>
    );
  }

  const renderInputBox = (val: number, idx: number, isAmber: boolean) => {
     const isActive = activeSlot === idx;
     return (
        <div className="flex flex-col items-center space-y-2" key={idx}>
           <button onClick={() => increment(idx)} className={`w-full p-2 bg-surface hover:bg-surface border border-border text-textMuted ${isAmber ? 'hover:text-amber-500 hover:border-amber-500' : 'hover:text-primary hover:border-primary'} transition-colors`}>▲</button>
           <div 
             onClick={() => setActiveSlot(idx)}
             className={`w-16 h-20 sm:w-20 sm:h-24 flex items-center justify-center border-2 cursor-pointer transition-all ${isActive ? (isAmber ? 'border-amber-500 shadow-glow-gold scale-105 my-2' : 'border-primary shadow-glow-red scale-105 my-2') : 'border-border bg-surface text-textDefault'}`}
           >
              <span className={`font-mono text-4xl sm:text-5xl ${isActive ? (isAmber ? 'text-amber-500' : 'text-white') : 'text-textDefault'}`}>{val}</span>
           </div>
           <button onClick={() => decrement(idx)} className={`w-full p-2 bg-surface hover:bg-surface border border-border text-textMuted ${isAmber ? 'hover:text-amber-500 hover:border-amber-500' : 'hover:text-primary hover:border-primary'} transition-colors`}>▼</button>
        </div>
     );
  };

  const renderNumpad = () => (
     <div className="grid grid-cols-3 gap-2 w-full max-w-[250px] mx-auto mt-8">
        {[1,2,3,4,5,6,7,8,9].map(n => (
           <button key={n} onClick={() => handleNumpad(n)} className="bg-surface border border-border aspect-square flex items-center justify-center text-xl font-mono hover:bg-border transition-colors active:scale-95">{n}</button>
        ))}
        <button onClick={() => setActiveSlot(Math.max(0, activeSlot - 1))} className="bg-surface/50 border border-border/50 aspect-square flex items-center justify-center text-xl hover:bg-border transition-colors active:scale-95">◄</button>
        <button onClick={() => handleNumpad(0)} className="bg-surface border border-border aspect-square flex items-center justify-center text-xl font-mono hover:bg-border transition-colors active:scale-95">0</button>
        <button onClick={() => setActiveSlot(Math.min(2, activeSlot + 1))} className="bg-surface/50 border border-border/50 aspect-square flex items-center justify-center text-xl hover:bg-border transition-colors active:scale-95">►</button>
     </div>
  );

  const RevealLogic = () => {
     if (!myResultPair) return <div className="text-center animate-pulse pt-12">Fetching results...</div>;
     
     const step = gsc.revealStep || 0;
     const isA = myResultPair.playerAId === playerId;
     const myActualSeq = isA ? myResultPair.playerA_sequence : myResultPair.playerB_sequence;
     const oppActualSeq = isA ? myResultPair.playerB_sequence : myResultPair.playerA_sequence;
     const myGuessOfOpp = isA ? myResultPair.playerA_guess : myResultPair.playerB_guess;
     const oppGuessOfMe = isA ? myResultPair.playerB_guess : myResultPair.playerA_guess;
     const myScore = isA ? myResultPair.playerA_score : myResultPair.playerB_score;
     const oppScore = isA ? myResultPair.playerB_score : myResultPair.playerA_score;

     // step 1: Opponent's guess of you
     if (step === 1) {
        return (
           <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} className="p-4 space-y-8 text-center">
              <h2 className="text-sm tracking-widest text-textMuted uppercase mb-8">Opponent's guess of your sequence</h2>
              <div className="flex justify-center space-x-6 text-2xl font-mono">
                 <div className="flex flex-col space-y-4">
                    <span className="text-xs text-textMuted">You</span>
                    {myActualSeq?.map((x:any,i:any)=><span key={i} className="text-white bg-surface border p-4 shadow-glow-red">{x}</span>)}
                 </div>
                 <div className="flex flex-col space-y-4 pt-8">
                    <span className="text-xs border-b border-border mb-2"/>
                    <span>−</span>
                    <span>−</span>
                    <span>−</span>
                 </div>
                 <div className="flex flex-col space-y-4">
                    <span className="text-xs text-amber-500">Them</span>
                    {oppGuessOfMe?.map((x:any,i:any)=><span key={i} className="text-amber-500 bg-surface border p-4 shadow-glow-gold">{x}</span>)}
                 </div>
                 <div className="flex flex-col space-y-4 pt-8">
                    <span className="text-xs border-b border-border mb-2"/>
                    <span>=</span>
                    <span>=</span>
                    <span>=</span>
                 </div>
                 <div className="flex flex-col space-y-4">
                    <span className="text-xs text-green-500">Diff</span>
                    {myActualSeq?.map((x:any,i:any)=><span key={i} className="text-green-500 border-l border-border pl-4 py-4">{Math.abs(x - (oppGuessOfMe?.[i]||0))}</span>)}
                 </div>
              </div>
              <p className="pt-8 text-xl border-t border-border mt-8">Their total score (guessing you): <span className="font-bold text-amber-500">{oppScore}</span></p>
           </motion.div>
        );
     }

     // step 2: Your guess of opponent
     if (step === 2) {
        return (
           <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} className="p-4 space-y-8 text-center">
              <h2 className="text-sm tracking-widest text-textMuted uppercase mb-8">Your guess of their sequence</h2>
              <div className="flex justify-center space-x-6 text-2xl font-mono">
                 <div className="flex flex-col space-y-4">
                    <span className="text-xs text-amber-500">Them</span>
                    {oppActualSeq?.map((x:any,i:any)=><span key={i} className="text-amber-500 bg-surface border p-4 shadow-glow-gold">{x}</span>)}
                 </div>
                 <div className="flex flex-col space-y-4 pt-8">
                    <span className="text-xs border-b border-border mb-2"/>
                    <span>−</span>
                    <span>−</span>
                    <span>−</span>
                 </div>
                 <div className="flex flex-col space-y-4">
                    <span className="text-xs text-primary">You</span>
                    {myGuessOfOpp?.map((x:any,i:any)=><span key={i} className="text-primary bg-surface border p-4 shadow-glow-red">{x}</span>)}
                 </div>
                 <div className="flex flex-col space-y-4 pt-8">
                    <span className="text-xs border-b border-border mb-2"/>
                    <span>=</span>
                    <span>=</span>
                    <span>=</span>
                 </div>
                 <div className="flex flex-col space-y-4">
                    <span className="text-xs text-green-500">Diff</span>
                    {oppActualSeq?.map((x:any,i:any)=><span key={i} className="text-green-500 border-l border-border pl-4 py-4">{Math.abs(x - (myGuessOfOpp?.[i]||0))}</span>)}
                 </div>
              </div>
              <p className="pt-8 text-xl border-t border-border mt-8">Your total score (guessing them): <span className="font-bold text-primary">{myScore}</span></p>
           </motion.div>
        );
     }

     if (step === 3) {
        const iWin = myScore < oppScore;
        const tie = myScore === oppScore;
        return (
           <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className={`p-8 border-4 ${iWin ? 'border-primary bg-primary/10 shadow-glow-red' : tie ? 'border-amber-500 bg-amber-500/10 shadow-glow-gold' : 'border-border bg-surface grayscale'}`}>
              <h2 className="text-3xl font-serif uppercase tracking-widest text-center mb-8">{iWin ? "You Guessed Better" : tie ? "Tied Score" : "They Guessed Better"}</h2>
              <div className="flex justify-between items-center text-center max-w-sm mx-auto font-mono text-2xl">
                 <div className={`${iWin ? 'text-primary' : 'text-textMuted'}`}>
                    <p className="text-[10px] mb-2 uppercase">Your Score</p>
                    {myScore}
                 </div>
                 <div className="text-textMuted/50 text-xl">VS</div>
                 <div className={`${!iWin && !tie ? 'text-amber-500' : 'text-textMuted'}`}>
                    <p className="text-[10px] mb-2 uppercase">Their Score</p>
                    {oppScore}
                 </div>
              </div>
           </motion.div>
        );
     }

     if (step >= 4) {
        const iAmEliminated = gameState.results?.eliminatedPlayerIds?.includes(playerId);
        return (
           <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`h-[50vh] flex flex-col justify-center items-center text-center ${iAmEliminated ? 'text-textMuted grayscale' : 'text-secondary shadow-glow-gold'}`}>
              <h1 className="text-5xl sm:text-6xl font-serif tracking-widest uppercase leading-tight mb-4">{iAmEliminated ? "Eliminated" : "You Survive"}</h1>
              <p className="font-mono text-xl">{iAmEliminated ? "They read you better." : `You read them better. Points awarded.`}</p>
           </motion.div>
        );
     }

     return <div className="text-center uppercase text-textMuted tracking-widest animate-pulse pt-12">Reviewing pairs...</div>;
  };

  return (
    <div className="w-full flex-1 flex flex-col items-center">
       {/* Top Header Phase */}
       {((isPhaseA || isPhaseA_Locked) && !isPhaseB && !isPhaseB_Locked && !isReveal && !isCalculating) && (
          <div className="w-full text-center space-y-4 border-b border-border pb-6 mb-8 mt-4 uppercase tracking-widest">
             <div className="flex justify-center space-x-2 text-primary"><span>●</span><span className="opacity-20">●</span></div>
             <p className="text-[10px] text-textMuted">Step 1 of 2</p>
             <h2 className="text-xl sm:text-2xl font-serif text-white">Create your secret sequence</h2>
             <p className="text-xs text-textMuted max-w-xs mx-auto normal-case">Your opponent will try to guess it. Make it hard.</p>
          </div>
       )}

       {((isPhaseB || isPhaseB_Locked) && !isReveal && !isCalculating) && (
          <div className="w-full text-center space-y-4 border-b border-border pb-6 mb-8 mt-4 uppercase tracking-widest">
             <div className="flex justify-center space-x-2 text-amber-500"><span className="opacity-20">●</span><span>●</span></div>
             <p className="text-[10px] text-textMuted">Step 2 of 2</p>
             <h2 className="text-xl sm:text-2xl font-serif text-amber-500 drop-shadow-glow-gold">Guess Opponent Sequence</h2>
             <p className="text-xs text-textMuted normal-case">Lower difference = better.</p>
             <div className="bg-surface border border-border p-3 max-w-sm mx-auto">
                <p className="text-[10px] text-textMuted mb-1">Your opponent</p>
                <p className="text-primary font-bold tracking-widest">{gsc.showOpponentName !== false ? opponentName : `Opponent Hidden`}</p>
             </div>
          </div>
       )}

       {/* Phase A Input */}
       {(isPhaseA || isPhaseA_Locked) && !isPhaseB && !isPhaseB_Locked && !isReveal && !isCalculating && (
          <div className="w-full flex flex-col items-center">
             <div className="flex justify-center space-x-4 sm:space-x-8">
                {mySequence.map((val, i) => renderInputBox(val, i, false))}
             </div>
             
             {!hasSubmittedA ? (
                <>
                   {renderNumpad()}
                   <button onClick={submitSequence} className="w-full max-w-sm mt-12 bg-primary text-background text-lg font-bold uppercase tracking-widest py-4 shadow-glow-red hover:bg-primary/80 transition-colors">
                      SEAL SEQUENCE
                   </button>
                </>
             ) : (
                <div className="mt-12 p-8 border border-border bg-surface text-center w-full max-w-sm">
                   <p className="text-xs uppercase tracking-widest text-textMuted mb-4">Your sealed sequence</p>
                   <p className="text-4xl font-mono text-white tracking-[0.5em]">{mySequence.join('')} ✓</p>
                   {isPhaseA_Locked ? (
                      <p className="text-[10px] text-primary mt-6 tracking-widest uppercase animate-pulse">Phase B opening...</p>
                   ) : (
                      <p className="text-[10px] text-textMuted mt-6 tracking-widest uppercase">Waiting for all players to seal...</p>
                   )}
                </div>
             )}
          </div>
       )}

       {/* Phase B Input */}
       {(isPhaseB || isPhaseB_Locked) && !isReveal && !isCalculating && (
          <div className="w-full flex flex-col items-center">
             <div className="flex justify-center space-x-4 sm:space-x-8">
                {myGuess.map((val, i) => renderInputBox(val, i, true))}
             </div>
             
             {!hasSubmittedB ? (
                <>
                   {renderNumpad()}
                   <button onClick={submitGuess} className="w-full max-w-sm mt-12 bg-amber-500 text-black text-lg font-bold uppercase tracking-widest py-4 shadow-glow-gold hover:bg-amber-600 transition-colors">
                      LOCK IN GUESS
                   </button>
                </>
             ) : (
                <div className="mt-12 p-8 border border-border bg-surface text-center w-full max-w-sm">
                   <p className="text-xs uppercase tracking-widest text-textMuted mb-4">Your locked guess</p>
                   <p className="text-4xl font-mono text-amber-500 tracking-[0.5em]">{myGuess.join('')} ✓</p>
                   <p className="text-[10px] text-textMuted mt-6 tracking-widest uppercase">Waiting for calculations...</p>
                </div>
             )}
          </div>
       )}

       {isCalculating && (
          <div className="text-center animate-pulse pt-12 text-primary font-mono tracking-widest uppercase">
             Calculating Absolute Differences...
          </div>
       )}

       {isReveal && (
          <div className="w-full max-w-lg mt-8">
             <RevealLogic />
          </div>
       )}
    </div>
  );
}
