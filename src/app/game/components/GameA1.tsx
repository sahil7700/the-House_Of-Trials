import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface GameProps {
  onSubmit: (val: any) => void;
  isLocked: boolean;
  currentSubmission: any;
  results: any;
  playerId?: string;
}

export default function GameA1({ onSubmit, isLocked, currentSubmission, results, playerId }: GameProps) {
  const [val, setVal] = useState<number>(50);
  const [confirming, setConfirming] = useState(false);
  const [revealStep, setRevealStep] = useState(0);

  useEffect(() => {
    if (results && revealStep === 0) {
      setRevealStep(1); // Sequence: 1=AVG, 2=TARGET, 3=RANK, 4=VERDICT
      
      const sequence = async () => {
        await new Promise(r => setTimeout(r, 2000));
        setRevealStep(2);
        await new Promise(r => setTimeout(r, 2000));
        setRevealStep(3);
        await new Promise(r => setTimeout(r, 1000));
        setRevealStep(4);
      };
      
      sequence();
    }
  }, [results, revealStep]);

  const handleDecrease = () => { if (!isLocked && currentSubmission === null && val > 0) setVal(v => v - 1); };
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

  return (
    <div className="flex flex-col items-center w-full max-w-lg mx-auto space-y-6 font-mono">
      <div className="text-center space-y-2 mb-4">
        <p className="text-[10px] text-secondary uppercase tracking-widest hidden md:block">Round 1 · Game 1</p>
        <h2 className="text-3xl uppercase tracking-widest text-textDefault drop-shadow-glow-red font-serif">The Average</h2>
        <p className="text-xs text-textMuted max-w-sm mx-auto">
          Pick a number 0–100. Target = 2/3 of everyone's average. Farthest from target is eliminated.
        </p>
      </div>

      <div className="text-6xl font-bold tracking-widest text-textDefault min-h-[80px] flex items-center justify-center font-mono">
        {displayValue}
      </div>

      {!isLocked && currentSubmission === null && !confirming && (
        <div className="w-full space-y-8">
           <input 
             type="range" min="0" max="100" 
             value={val} onChange={(e) => setVal(Number(e.target.value))}
             className="w-full accent-primary h-2 bg-surface appearance-none outline-none"
           />
           <div className="flex justify-between w-full px-4">
              <button onClick={handleDecrease} className="w-16 h-16 border border-border bg-surface text-xl hover:text-primary transition-all">-</button>
              <button onClick={handleIncrease} className="w-16 h-16 border border-border bg-surface text-xl hover:text-primary transition-all">+</button>
           </div>
           
           <button onClick={handleSubmit} className="w-full py-4 bg-primary/10 border border-primary text-primary hover:bg-primary hover:text-white uppercase tracking-widest transition-all shadow-glow-red">
             SUBMIT
           </button>
        </div>
      )}

      {confirming && currentSubmission === null && !isLocked && (
         <div className="w-full p-6 border border-primary bg-primary/10 text-center space-y-4">
            <p className="uppercase text-primary text-sm tracking-widest">You are submitting {val}. Confirm?</p>
            <div className="flex gap-4">
               <button onClick={() => setConfirming(false)} className="flex-1 py-3 border border-border bg-background text-textMuted hover:text-textDefault">CANCEL</button>
               <button onClick={handleSubmit} className="flex-1 py-3 border border-primary bg-primary text-white uppercase tracking-widest shadow-glow-red">CONFIRM</button>
            </div>
         </div>
      )}

      {currentSubmission !== null && !isLocked && (
         <div className="w-full py-4 border border-secondary text-secondary bg-secondary/10 uppercase tracking-widest transition-all shadow-glow-gold text-center">
            Submitted ✓
         </div>
      )}

      {isLocked && !results && (
        <div className="w-full p-6 border border-border bg-surface text-center space-y-4">
           <p className="text-xs uppercase text-textMuted tracking-widest">Submissions Closed</p>
           {currentSubmission === null ? (
             <p className="text-primary uppercase text-sm animate-pulse">You did not submit. Awaiting auto-penalty.</p>
           ) : (
             <p className="text-secondary uppercase text-sm animate-pulse">All submissions received. Calculating target...</p>
           )}
        </div>
      )}

      {results && playerId && (
         <div className="w-full space-y-4 font-mono text-center">
            <AnimatePresence>
               {revealStep >= 1 && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="p-4 border border-border bg-surface">
                     <p className="text-[10px] text-textMuted uppercase tracking-widest mb-1">Group Average</p>
                     <p className="text-3xl text-textDefault">{results.average.toFixed(2)}</p>
                  </motion.div>
               )}
               
               {revealStep >= 2 && (
                  <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="p-6 border border-secondary bg-secondary/10 shadow-glow-gold mt-4">
                     <p className="text-xs text-secondary uppercase tracking-widest mb-2 font-bold">TARGET (2/3 of average)</p>
                     <p className="text-5xl text-secondary font-bold">{results.target.toFixed(2)}</p>
                  </motion.div>
               )}
               
               {revealStep >= 3 && results.playerStats?.[playerId] && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-8 space-y-2">
                     <p className="text-textMuted text-sm">Your number: <span className="text-textDefault">{currentSubmission}</span></p>
                     <p className="text-textMuted text-sm">Your distance: <span className="text-textDefault">{results.playerStats[playerId].distance.toFixed(2)}</span></p>
                     <p className="text-secondary text-xs uppercase tracking-widest">Rank: #{results.playerStats[playerId].rank}</p>
                  </motion.div>
               )}
            </AnimatePresence>
         </div>
      )}
    </div>
  );
}
