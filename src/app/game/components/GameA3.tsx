import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface GameProps {
  onSubmit: (val: any) => void;
  isLocked: boolean;
  currentSubmission: any;
  results: any;
  playerId?: string;
}

export default function GameA3({ onSubmit, isLocked, currentSubmission, results, playerId }: GameProps) {
  const [val, setVal] = useState<number>(50);
  const [confirming, setConfirming] = useState(false);
  const [revealStep, setRevealStep] = useState(0);

  useEffect(() => {
    if (results && revealStep === 0) {
      setRevealStep(1); // Show bids
      const sequence = async () => {
        await new Promise(r => setTimeout(r, 2000));
        setRevealStep(2); // Show math
        await new Promise(r => setTimeout(r, 3000));
        setRevealStep(3); // Result / Score
        await new Promise(r => setTimeout(r, 2000));
        setRevealStep(4); // Rank
      };
      sequence();
    }
  }, [results, revealStep]);

  const handleDecrease = () => { if (!isLocked && currentSubmission === null && val > 2) setVal(v => v - 1); };
  const handleIncrease = () => { if (!isLocked && currentSubmission === null && val < 100) setVal(v => v + 1); };

  const handleSubmit = () => {
    if (currentSubmission !== null || isLocked) return;
    if (confirming) {
      onSubmit(val);
      setConfirming(false);
    } else {
      setConfirming(true);
    }
  };

  const displayValue = currentSubmission !== null ? currentSubmission : val;
  const stat = results?.playerStats?.[playerId || ""];
  const penalty = results?.penalty || 5;
  const bonus = results?.bonus || 5;

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-lg mx-auto space-y-6 font-mono pb-12">
      <div className="text-center space-y-2 mb-4">
        <p className="text-[10px] text-secondary uppercase tracking-widest hidden md:block">Round 2 · Game 3</p>
        <h2 className="text-3xl uppercase tracking-widest text-textDefault drop-shadow-glow-red font-serif">The Dilemma</h2>
      </div>

      <div className="w-full p-4 border border-border bg-surface text-xs text-textMuted tracking-wider mb-4 leading-relaxed">
         Same number → both score that number<br/>
         Different → both get the lower number<br/>
         Lower bidder gets +{bonus} · Higher gets -{penalty}
      </div>

      {!results && (
        <div className="w-full text-center mb-4">
           <p className="text-sm text-primary uppercase">You are matched with an anonymous opponent.</p>
           <p className="text-xs text-textMuted mt-1">Their number is hidden until time is up.</p>
        </div>
      )}

      <div className="text-6xl font-bold tracking-widest text-textDefault min-h-[80px] flex items-center justify-center font-mono">
        {displayValue}
      </div>

      {!isLocked && currentSubmission === null && !confirming && (
        <div className="w-full space-y-8">
           <input 
             type="range" min="2" max="100" 
             value={val} onChange={(e) => setVal(Number(e.target.value))}
             className="w-full accent-primary h-2 bg-surface appearance-none outline-none"
           />
           <div className="flex justify-between w-full px-4">
              <button onClick={handleDecrease} className="w-16 h-16 border border-border bg-surface text-xl hover:text-primary transition-all">-</button>
              <button onClick={handleIncrease} className="w-16 h-16 border border-border bg-surface text-xl hover:text-primary transition-all">+</button>
           </div>
           
           <button onClick={handleSubmit} className="w-full py-4 bg-primary/10 border border-primary text-primary hover:bg-primary hover:text-white uppercase tracking-widest transition-all shadow-glow-red">
             SUBMIT BID
           </button>
        </div>
      )}

      {confirming && currentSubmission === null && !isLocked && (
         <div className="w-full p-6 border border-primary bg-primary/10 text-center space-y-4">
            <p className="uppercase text-primary text-sm tracking-widest">You are bidding {val}. Confirm?</p>
            <div className="flex gap-4">
               <button onClick={() => setConfirming(false)} className="flex-1 py-3 border border-border bg-background text-textMuted hover:text-textDefault">CANCEL</button>
               <button onClick={handleSubmit} className="flex-1 py-3 border border-primary bg-primary text-white uppercase tracking-widest shadow-glow-red">CONFIRM</button>
            </div>
         </div>
      )}

      {currentSubmission !== null && !isLocked && (
         <div className="w-full py-4 border border-secondary text-secondary bg-secondary/10 uppercase tracking-widest transition-all shadow-glow-gold text-center">
            Waiting for opponent...
         </div>
      )}

      {isLocked && !results && (
        <div className="w-full p-6 border border-border bg-surface text-center space-y-4">
           <p className="text-xs uppercase text-textMuted tracking-widest">Submissions Locked</p>
           <p className="text-secondary uppercase text-sm animate-pulse">Computing pairings...</p>
        </div>
      )}

      {results && stat && (
         <div className="w-full space-y-4 font-mono">
            <AnimatePresence>
               {revealStep >= 1 && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-2 gap-4 text-center">
                     <div className="p-4 border border-border bg-surface">
                        <p className="text-[10px] text-textMuted uppercase tracking-widest mb-1">Your Bid</p>
                        <p className="text-3xl text-textDefault">{currentSubmission}</p>
                     </div>
                     <div className="p-4 border border-border bg-surface">
                        <p className="text-[10px] text-textMuted uppercase tracking-widest mb-1">Opponent Bid</p>
                        <p className="text-3xl text-primary">{stat.opponentVal === null ? "—" : stat.opponentVal}</p>
                     </div>
                  </motion.div>
               )}
               
               {revealStep >= 2 && stat.opponentVal !== null && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 border border-border bg-background text-center text-sm space-y-2 mt-4 text-textMuted">
                     {currentSubmission === stat.opponentVal ? (
                        <>
                           <p>Bids match: {currentSubmission}</p>
                           <p className="text-textDefault">Both players receive {currentSubmission}</p>
                        </>
                     ) : currentSubmission < stat.opponentVal ? (
                        <>
                           <p>Lower bid: {currentSubmission}</p>
                           <p>Both receive {currentSubmission}</p>
                           <p className="text-secondary">You bid lower → Bonus +{bonus}</p>
                        </>
                     ) : (
                        <>
                           <p>Lower bid: {stat.opponentVal}</p>
                           <p>Both receive {stat.opponentVal}</p>
                           <p className="text-primary">You bid higher → Penalty -{penalty}</p>
                        </>
                     )}
                  </motion.div>
               )}

               {revealStep >= 2 && stat.opponentVal === null && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 border border-border bg-background text-center text-sm mt-4 text-textMuted">
                     <p>Unmatched player. Safe score: {currentSubmission}</p>
                  </motion.div>
               )}
               
               {revealStep >= 3 && (
                  <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="p-6 border border-secondary bg-secondary/10 shadow-glow-gold mt-4 text-center">
                     <p className="text-xs text-secondary uppercase tracking-widest mb-2 font-bold">Your Score</p>
                     <p className="text-5xl text-secondary font-bold">{stat.myScore}</p>
                  </motion.div>
               )}
               
               {revealStep >= 4 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-8 text-center">
                     <p className="text-textDefault text-sm uppercase tracking-widest border border-border inline-block px-4 py-2 bg-surface">Rank: #{stat.rank}</p>
                  </motion.div>
               )}
            </AnimatePresence>
         </div>
      )}
    </div>
  );
}
