import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface GameProps {
  onSubmit: (val: any) => void;
  isLocked: boolean;
  currentSubmission: any;
  results: any;
  playerId?: string;
  customOptions?: string[];
}

export default function GameA4({ onSubmit, isLocked, currentSubmission, results, playerId, customOptions }: GameProps) {
  const [ranked, setRanked] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [revealStep, setRevealStep] = useState(0);
  const options = customOptions && customOptions.length > 0 && customOptions.some(o => o.trim() !== "") 
     ? customOptions 
     : ["Option A", "Option B", "Option C", "Option D"];
  
  useEffect(() => {
    if (results && revealStep === 0) {
      setRevealStep(1); // Show totals with animation effect
      const sequence = async () => {
        await new Promise(r => setTimeout(r, 3000));
        setRevealStep(2); // Show ordered list
        await new Promise(r => setTimeout(r, 2000));
        setRevealStep(3); // Show 1st place
        await new Promise(r => setTimeout(r, 3000));
        setRevealStep(4); // Show 2nd place winner
        await new Promise(r => setTimeout(r, 2000));
        setRevealStep(5); // Show personal verdict
      };
      sequence();
    }
  }, [results, revealStep]);

  const handleSelect = (opt: string) => {
    if (isLocked || currentSubmission !== null) return;
    if (ranked.includes(opt)) {
      setRanked(ranked.filter(r => r !== opt));
    } else if (ranked.length < 4) {
      setRanked([...ranked, opt]);
    }
  };

  const isComplete = ranked.length === 4;

  const handleSubmit = () => {
    if (currentSubmission !== null || isLocked) return;
    if (confirming) {
      onSubmit(ranked);
      setConfirming(false);
    } else {
      setConfirming(true);
    }
  };

  if (results && revealStep >= 1) {
    const opts = revealStep >= 2 ? results.sortedOpts : options.map(o => ({ opt: o, pts: results.points?.[o] || 0 }));
    
    return (
      <div className="flex flex-col items-center justify-center w-full max-w-lg mx-auto space-y-4 font-mono pb-8">
        <h2 className="text-xl uppercase tracking-widest text-textMuted border-b border-border w-full text-center pb-2">
          {revealStep === 1 ? "Counting Votes..." : revealStep === 2 ? "Ranking the options..." : "Final Results"}
        </h2>
        
        <div className="w-full space-y-3 mt-4 flex flex-col">
          <AnimatePresence>
            {opts.map((item: any, idx: number) => {
              const o = item.opt || item;
              const pts = item.pts || 0;
              const pct = results.totalPlayers > 0 ? (pts / (results.totalPlayers * 3)) * 100 : 0;
              
              const isFirst = revealStep >= 3 && results.firstPlaceOption === o;
              const isSecond = revealStep >= 4 && results.secondPlaceOption === o;
              
              let bg = "bg-surface";
              let border = "border-border";
              if (isFirst) { bg = "bg-primary/20"; border = "border-primary"; }
              if (isSecond) { bg = "bg-secondary/20 shadow-glow-gold"; border = "border-secondary"; }

              return (
                <motion.div 
                  key={o}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5 }}
                  className={`relative h-10 flex items-center px-4 border ${bg} ${border}`}
                >
                  <motion.div 
                     initial={{ width: 0 }}
                     animate={{ width: `${pct}%` }}
                     transition={{ duration: 2, ease: "easeOut" }}
                     className={`absolute left-0 top-0 bottom-0 opacity-30 mix-blend-screen ${isSecond ? 'bg-secondary' : isFirst ? 'bg-primary' : 'bg-textMuted'}`}
                  />
                  <div className="relative z-10 w-full flex justify-between text-xs tracking-widest uppercase items-center">
                     <span className={isSecond ? "text-secondary font-bold" : "text-white"}>
                       {revealStep >= 2 && <span className="mr-2 text-textMuted w-4 inline-block">{idx + 1}.</span>}
                       {o}
                     </span>
                     <motion.span 
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}
                        className={isSecond ? "text-secondary font-bold" : isFirst ? "text-primary" : "text-textMuted"}
                     >
                       {pts} pts
                     </motion.span>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        <AnimatePresence>
           {revealStep >= 3 && revealStep < 4 && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-center text-primary uppercase text-xs pt-4 tracking-widest">
                 In first place: {results.firstPlaceOption}. But first place does not win.
              </motion.div>
           )}

           {revealStep >= 4 && (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="mt-8 p-6 text-center border-2 border-secondary bg-secondary/10 w-full shadow-glow-gold">
                 <p className="text-xs text-textMuted uppercase tracking-widest mb-2">The Winner Is...</p>
                 <p className="text-3xl text-secondary font-serif uppercase tracking-widest">{results.secondPlaceOption}</p>
              </motion.div>
           )}

           {revealStep >= 5 && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full text-center mt-4">
                 {currentSubmission && currentSubmission[0] === results.secondPlaceOption ? (
                    <div className="p-4 bg-secondary text-primary-900 border border-secondary shadow-glow-gold">
                       <p className="font-bold text-xl uppercase tracking-widest">YOU PREDICTED IT</p>
                       <p className="text-sm">You survive.</p>
                    </div>
                 ) : (
                    <div className="p-4 bg-primary text-white border border-primary shadow-glow-red">
                       <p className="font-bold text-xl uppercase tracking-widest">ELIMINATED</p>
                       <p className="text-sm">You ranked it {currentSubmission ? currentSubmission.indexOf(results.secondPlaceOption) + 1 : 'none'}{currentSubmission && currentSubmission.indexOf(results.secondPlaceOption) + 1 === 2 ? 'nd' : currentSubmission?.indexOf(results.secondPlaceOption) + 1 === 3 ? 'rd' : 'th'}. You must rank it 1st to survive.</p>
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
        <p className="text-[10px] text-secondary uppercase tracking-widest hidden md:block">Round 2 · Game 4</p>
        <h2 className="text-2xl uppercase tracking-widest text-textDefault drop-shadow-glow-red font-serif">The Sabotage Vote</h2>
        <p className="text-sm text-textMuted max-w-xs mx-auto">Rank the options. The option in SECOND PLACE wins. You must rank the winner as your #1 to survive.</p>
      </div>

      <div className="w-full p-4 border border-border bg-surface text-xs text-textMuted tracking-wider space-y-1 mb-2">
         <p className="text-primary font-bold">You are not voting for your favorite.</p>
         <p>You are predicting which option will come 2nd.</p>
         <p>Rank THAT option as your #1.</p>
      </div>

      <div className="w-full space-y-3">
         {options.map((opt) => {
            const rankIndex = (currentSubmission || ranked).indexOf(opt);
            const isSelected = rankIndex !== -1;
            
            return (
              <button
                key={opt}
                disabled={isLocked || currentSubmission !== null}
                onClick={() => handleSelect(opt)}
                className={`w-full flex justify-between items-center p-4 border transition-all ${
                  isSelected ? "bg-white/10 border-white text-white" : "bg-surface border-border text-textMuted"
                }`}
              >
                <span className="uppercase tracking-widest text-xs">{opt}</span>
                {isSelected && (
                  <span className="w-6 h-6 flex items-center justify-center bg-primary text-white text-xs font-bold rounded-full">
                    {rankIndex + 1}
                  </span>
                )}
              </button>
            )
         })}
      </div>

      {!isLocked && currentSubmission === null && !confirming && (
        <button
          disabled={!isComplete}
          onClick={handleSubmit}
          className="w-full mt-4 py-4 border border-primary text-primary hover:bg-primary hover:text-white uppercase tracking-widest disabled:opacity-30 disabled:border-border disabled:text-textMuted disabled:bg-transparent transition-all shadow-glow-red"
        >
          SUBMIT RANKING
        </button>
      )}

      {confirming && !isLocked && currentSubmission === null && (
         <div className="w-full p-4 border border-primary bg-primary/10 text-center space-y-4 shadow-glow-red mt-4">
            <p className="uppercase text-white text-xs tracking-widest mb-2">Your ranking:</p>
            <div className="text-xs text-textMuted text-left space-y-1 mb-4 inline-block">
               <p>1st: <span className="text-white">{ranked[0]}</span> (3 pts)</p>
               <p>2nd: <span className="text-white">{ranked[1]}</span> (2 pts)</p>
               <p>3rd: <span className="text-white">{ranked[2]}</span> (1 pt)</p>
               <p>4th: <span className="text-white">{ranked[3]}</span> (0 pts)</p>
            </div>
            <div className="flex gap-2">
               <button onClick={() => setConfirming(false)} className="flex-1 py-3 border border-border bg-background text-textMuted hover:text-textDefault text-xs tracking-widest">CHANGE</button>
               <button onClick={handleSubmit} className="flex-1 py-3 border border-primary bg-primary text-white uppercase tracking-widest text-xs">CONFIRM</button>
            </div>
         </div>
      )}

      {currentSubmission !== null && !isLocked && (
         <div className="w-full py-4 border border-secondary text-secondary bg-secondary/10 uppercase tracking-widest transition-all shadow-glow-gold text-center mt-4 text-sm">
            Ranking Locked. Waiting...
         </div>
      )}

      {isLocked && !results && (
        <div className="w-full p-6 border border-border bg-surface text-center space-y-4 mt-4">
           <p className="text-xs uppercase text-textMuted tracking-widest">Votes Locked</p>
           <p className="text-secondary uppercase text-xs animate-pulse">Calculating Borda Counts...</p>
        </div>
      )}
    </div>
  );
}
