import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface GameProps {
  onSubmit: (val: any) => void;
  isLocked: boolean;
  currentSubmission: any;
  results: any;
  playerId?: string;
}

const RANGES = [
  "1-10", "11-20", "21-30", "31-40", "41-50",
  "51-60", "61-70", "71-80", "81-90", "91-100"
];

export default function GameA2({ onSubmit, isLocked, currentSubmission, results, playerId }: GameProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [revealStep, setRevealStep] = useState(0);

  useEffect(() => {
    if (results && revealStep === 0) {
      setRevealStep(1); // Bars animate
      setTimeout(() => setRevealStep(2), 3000); // Winner/loser highlight
      setTimeout(() => setRevealStep(3), 5000); // Personal result
    }
  }, [results, revealStep]);

  const handleSubmit = () => {
    if (currentSubmission !== null || isLocked) return;
    if (confirming && selected) {
      onSubmit(selected);
      setConfirming(false);
    } else {
      setConfirming(true);
    }
  };

  if (results && revealStep >= 1) {
    return (
      <div className="flex flex-col items-center justify-center w-full max-w-lg mx-auto space-y-4 font-mono pb-8">
        <h2 className="text-xl uppercase tracking-widest text-textMuted border-b border-border w-full text-center pb-2">Population Data</h2>
        <div className="w-full space-y-3 mt-4">
          {RANGES.map((r, i) => {
            const count = results.counts?.[r] || 0;
            const pct = results.totalPlayers > 0 ? (count / results.totalPlayers) * 100 : 0;
            const isWinner = revealStep >= 2 && results.minorityRange === r;
            const isLoser = revealStep >= 2 && results.majorityRange === r;
            const isSelf = currentSubmission === r;
            
            return (
              <motion.div 
                key={r}
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: "100%", opacity: 1 }}
                transition={{ duration: 0.5, delay: i * 0.2 }}
                className={`relative h-8 flex items-center px-4 ${isWinner ? 'bg-secondary/20 shadow-[0_0_10px_#d4a017] border border-secondary' : isLoser ? 'bg-primary/20 shadow-[0_0_10px_#c0392b] border border-primary' : 'bg-surface border border-border'}`}
              >
                <motion.div 
                   initial={{ width: 0 }}
                   animate={{ width: `${pct}%` }}
                   transition={{ duration: 1, delay: 0.5 + (i * 0.1) }}
                   className={`absolute left-0 top-0 bottom-0 opacity-40 mix-blend-screen ${isWinner ? 'bg-secondary' : isLoser ? 'bg-primary' : 'bg-textMuted'}`}
                />
                <div className="relative z-10 w-full flex justify-between text-xs tracking-widest uppercase">
                   <span className={isSelf ? "text-white font-bold" : "text-textMuted"}>{r} {isSelf && "← YOU"}</span>
                   <span className={isWinner ? "text-secondary font-bold" : isLoser ? "text-primary font-bold" : "text-textDefault"}>{count} users</span>
                </div>
              </motion.div>
            );
          })}
        </div>

        <AnimatePresence>
          {revealStep >= 3 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full p-6 text-center mt-8 border bg-background z-20">
              {currentSubmission === results.minorityRange ? (
                <div className="text-secondary border-secondary shadow-glow-gold p-4 border bg-secondary/10">
                  <p className="text-2xl font-serif tracking-widest uppercase mb-2">YOU SURVIVED</p>
                  <p className="text-sm font-mono">You chose the least crowded range.</p>
                </div>
              ) : currentSubmission === results.majorityRange ? (
                <div className="text-primary border-primary shadow-glow-red p-4 border bg-primary/10">
                  <p className="text-2xl font-serif tracking-widest uppercase mb-2">ELIMINATED</p>
                  <p className="text-sm font-mono">You followed the crowd.</p>
                </div>
              ) : (
                <div className="text-textDefault border-border p-4 border bg-surface">
                  <p className="text-xl font-serif tracking-widest uppercase mb-2">A NARROW ESCAPE</p>
                  <p className="text-sm font-mono text-textMuted">You survived, but were not in the minority.</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-sm mx-auto space-y-6 font-mono">
      <div className="text-center space-y-2 mb-4">
        <p className="text-[10px] text-secondary uppercase tracking-widest hidden md:block">Round 1 · Game 2</p>
        <h2 className="text-2xl uppercase tracking-widest text-textDefault drop-shadow-glow-red font-serif">The Range Hunter</h2>
        <p className="text-sm text-textMuted max-w-xs mx-auto">Choose a range. The range with the fewest players wins. The majority is eliminated.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 w-full">
        {RANGES.map((r) => {
           let isSel = (currentSubmission !== null ? currentSubmission : selected) === r;
           
           let btnClass = "border p-4 text-center transition-all relative overflow-hidden text-sm tracking-widest ";
           
           if (!isLocked && currentSubmission === null) {
              btnClass += isSel ? "bg-primary border-primary text-white font-bold shadow-glow-red " : "border-border text-textMuted bg-surface hover:bg-white/5 hover:border-white/50 cursor-pointer ";
           } else if (isSel) {
              btnClass += "bg-white/10 text-white font-bold border-white/50 ";
           } else {
              btnClass += "border-border/50 text-textMuted/30 bg-surface/50 opacity-40 grayscale ";
           }

           return (
             <button 
               key={r}
               disabled={isLocked || currentSubmission !== null}
               onClick={() => setSelected(r)}
               className={btnClass}
             >
                {r}
             </button>
           );
        })}
      </div>

      {!isLocked && currentSubmission === null && !confirming && (
         <button onClick={handleSubmit} disabled={!selected} className="w-full py-4 bg-primary/10 border border-primary text-primary hover:bg-primary hover:text-white uppercase tracking-widest disabled:opacity-30 disabled:border-border disabled:text-textMuted disabled:bg-transparent transition-all mt-4">
           {selected ? `LOCK IN ${selected}` : "SELECT A RANGE"}
         </button>
      )}

      {confirming && !isLocked && currentSubmission === null && (
         <div className="w-full p-4 border border-primary bg-primary/10 text-center space-y-4 shadow-glow-red mt-4">
            <p className="uppercase text-white text-xs tracking-widest">Confirm your choice: <span className="text-primary font-bold">{selected}</span></p>
            <div className="flex gap-2">
               <button onClick={() => setConfirming(false)} className="flex-1 py-3 border border-border bg-background text-textMuted hover:text-textDefault text-xs">CANCEL</button>
               <button onClick={handleSubmit} className="flex-1 py-3 border border-primary bg-primary text-white uppercase tracking-widest text-xs">CONFIRM</button>
            </div>
         </div>
      )}

      {currentSubmission !== null && !isLocked && (
         <div className="w-full py-4 border border-secondary text-secondary bg-secondary/10 uppercase tracking-widest transition-all shadow-glow-gold text-center mt-4 text-sm">
            Waiting for players...
         </div>
      )}

      {isLocked && !results && (
        <div className="w-full p-6 border border-border bg-surface text-center space-y-4 mt-4">
           <p className="text-xs uppercase text-textMuted tracking-widest">Input is Locked</p>
           <p className="text-secondary uppercase text-xs animate-pulse">Calculating population distribution...</p>
        </div>
      )}
    </div>
  );
}
