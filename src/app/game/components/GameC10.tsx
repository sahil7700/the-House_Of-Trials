import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface GameProps {
  onSubmit: (val: any) => void;
  isLocked: boolean;
  currentSubmission: any; // value they claimed
  results: any;
  playerId?: string;
  gameSpecificConfig?: any;
}

export default function GameC10({ onSubmit, isLocked, currentSubmission, results, playerId, gameSpecificConfig }: GameProps) {
  const [confirming, setConfirming] = useState<number | null>(null);

  const sequence = gameSpecificConfig?.numberSequence || [];
  const currentIndex = gameSpecificConfig?.currentNumberIndex || 0;
  const currentNumber = currentIndex > 0 && currentIndex <= sequence.length ? sequence[currentIndex - 1] : null;

  // currentSubmission may be a scalar (legacy) or an object {value, claimedAtIndex}
  const claimedValue: number | null = currentSubmission === null ? null
    : typeof currentSubmission === "object" ? Number(currentSubmission.value)
    : Number(currentSubmission);

  // Auto-claim the last number if the game forces it
  // Submits with autoAssigned flag so calculator knows
  useEffect(() => {
     if (currentIndex === 20 && claimedValue === null && currentNumber !== null && !isLocked) {
        const t = setTimeout(() => {
           // re-check in case they claimed while timeout was pending
           if (claimedValue === null) {
             onSubmit({ value: currentNumber, claimedAtIndex: 19, autoAssigned: true });
           }
        }, 3000);
        return () => clearTimeout(t);
     }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, currentNumber, isLocked]);

  const handleClaim = () => {
     if (isLocked || claimedValue !== null || currentNumber === null) return;
     setConfirming(currentNumber);
  };

  const handleLockIn = () => {
     if (confirming !== null && confirming === currentNumber) {
        onSubmit({ value: confirming, claimedAtIndex: currentIndex - 1, autoAssigned: false });
        setConfirming(null);
     }
  };

  const getColorClass = (val: number) => {
     if (val <= 33) return "text-primary drop-shadow-[0_0_10px_rgba(192,57,43,0.8)]"; // Red
     if (val <= 66) return "text-textDefault"; // White
     return "text-secondary drop-shadow-[0_0_10px_rgba(212,160,23,0.8)]"; // Gold
  };

  const isReveal = results !== null;

  return (
    <div className="w-full max-w-lg mx-auto flex flex-col items-center min-h-[80vh] justify-between relative pb-16">
      
      {/* Header */}
      {!isReveal && (
         <div className="w-full text-center mt-4">
           <p className="text-[10px] text-textMuted uppercase tracking-widest font-mono">FINAL ROUND · GAME C10</p>
           <h2 className="font-serif text-3xl text-textDefault tracking-widest uppercase mt-2 shadow-glow-gold">The Peak Finder</h2>
         </div>
      )}

      {/* Main Display Area */}
      <div className="flex-1 flex flex-col items-center justify-center w-full relative">
         {!isReveal && currentIndex === 0 && (
            <div className="border border-border bg-surface p-6 text-sm text-textMuted leading-relaxed space-y-2">
               <p>&bull; 20 numbers will be revealed one at a time.</p>
               <p>&bull; You have ONE CLAIM. Use it on a number you keep.</p>
               <p>&bull; If you never claim, you receive the last number.</p>
               <p>&bull; Highest claimed numbers survive.</p>
               <p className="text-secondary">&bull; You cannot unclaim. You cannot change your mind.</p>
               
               <div className="mt-8 text-center pt-4 border-t border-border">
                  <p className="uppercase tracking-widest font-mono text-xs">Waiting for first number...</p>
               </div>
            </div>
         )}

         {!isReveal && currentIndex > 0 && (
            <div className="w-full text-center flex flex-col items-center">
               
               {/* Current Number Display */}
               <div className="relative mb-8 min-h-[160px] flex items-center justify-center">
                  <AnimatePresence mode="wait">
                     <motion.div
                       key={currentIndex}
                       initial={{ opacity: 0, scale: 0.5, filter: "blur(10px)" }}
                       animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                       exit={{ opacity: 0, scale: 1.5, filter: "blur(10px)" }}
                       transition={{ duration: 0.5 }}
                       className={`font-mono text-[120px] leading-none font-bold ${currentNumber !== null ? getColorClass(currentNumber) : ''}`}
                     >
                       {currentNumber}
                     </motion.div>
                  </AnimatePresence>
                  
                  {currentNumber !== null && (
                     <div className="absolute -bottom-6 text-[10px] text-textMuted uppercase tracking-widest">
                       Number {currentIndex} of 20
                     </div>
                  )}
               </div>

               {/* Claim Output Status */}
               {claimedValue !== null ? (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="p-4 border border-secondary bg-secondary/10 shadow-glow-gold mt-4 text-center w-full">
                     <p className="text-xs text-secondary uppercase tracking-widest font-bold">You Claimed</p>
                     <p className="text-4xl text-secondary font-mono mt-2">{claimedValue}</p>
                     <p className="text-[10px] text-textMuted mt-4 uppercase">Waiting for remaining numbers...</p>
                  </motion.div>
               ) : (
                  <div className="w-full mt-4 min-h-[120px]">
                     {confirming === currentNumber ? (
                        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="p-4 border border-primary bg-primary/10 shadow-glow-red w-full">
                           <p className="text-xs text-textDefault uppercase tracking-widest mb-4">Are you sure? You cannot change this.</p>
                           <div className="flex gap-2">
                              <button onClick={() => setConfirming(null)} className="flex-1 border border-border p-3 text-xs uppercase tracking-widest text-textMuted hover:bg-surface">Wait</button>
                              <button onClick={handleLockIn} className="flex-[2] border border-primary bg-primary text-background font-bold p-3 text-xs uppercase tracking-widest">Lock In {confirming}</button>
                           </div>
                        </motion.div>
                     ) : (
                        <button 
                           onClick={handleClaim}
                           disabled={isLocked || currentNumber === null}
                           className="w-full p-6 border border-border bg-surface hover:border-secondary hover:text-secondary uppercase tracking-[0.2em] transition-colors disabled:opacity-50"
                        >
                           <span className="block text-lg">CLAIM {currentNumber}</span>
                           <span className="block text-[10px] text-textMuted mt-2">{20 - currentIndex} numbers remaining after this</span>
                        </button>
                     )}
                  </div>
               )}
            </div>
         )}
         
         {/* Reveal Phase Results */}
         {isReveal && results && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full text-center space-y-6">
               <h3 className="font-serif text-3xl uppercase tracking-widest text-secondary shadow-glow-gold">The Sequence</h3>
               <div className="grid grid-cols-5 gap-2 font-mono text-sm max-w-sm mx-auto p-4 border border-border bg-surface">
                 {sequence.map((n: number, i: number) => {
                    const isOptimal = i >= 7 && i <= 11; // Positions 8-12
                    const isMyClaim = claimedValue === n;
                    const isPeak = n === results.peakNumber;
                    return (
                       <motion.div 
                          key={i}
                          initial={{ opacity: 0, scale: 0 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.1 }}
                          className={`
                             aspect-square flex items-center justify-center border relative
                             ${isPeak ? 'bg-secondary text-background font-bold border-secondary shadow-glow-gold' : 'border-border bg-background'}
                             ${isOptimal && !isPeak ? 'bg-secondary/10 border-secondary/50' : ''}
                             ${isMyClaim ? 'ring-2 ring-primary' : ''}
                          `}
                       >
                          {n}
                          {isMyClaim && <div className="absolute -top-2 -right-2 bg-primary text-background rounded-full w-4 h-4 text-[8px] flex items-center justify-center font-bold">✓</div>}
                       </motion.div>
                    );
                 })}
               </div>
               
               <div className="p-4 border border-border">
                  <p className="text-secondary font-mono text-2xl uppercase tracking-widest">Peak: {results.peakNumber}</p>
                  <p className="text-[10px] text-textMuted mt-2 uppercase tracking-widest">Positions 8-12 were the optimal claim window.</p>
               </div>

               {/* Personal Stats */}
               <div className="py-8 space-y-4">
                  <p className="text-sm uppercase tracking-widest">You claimed: <span className="font-bold text-xl">{claimedValue ?? "—"}</span></p>
                  <p className="text-sm uppercase tracking-widest text-textMuted">Your Rank: #{results.playerStats?.[playerId || ""]?.rank || "?"}</p>
               </div>
            </motion.div>
         )}
      </div>

      {/* Footer Timeline Map */}
      {!isReveal && currentIndex > 0 && (
         <div className="fixed bottom-0 left-0 right-0 h-16 bg-background border-t border-border flex items-center overflow-x-auto px-4 gap-2 no-scrollbar">
            {sequence.slice(0, currentIndex).map((n: number, i: number) => {
               const isMyClaim = claimedValue === n;
               const isCurrent = i === currentIndex - 1;
               return (
                  <div key={i} className={`
                    flex-shrink-0 w-10 h-10 flex flex-col items-center justify-center font-mono text-xs border relative
                    ${isMyClaim ? 'bg-secondary text-background font-bold border-secondary' : 'bg-surface border-border'}
                    ${isCurrent && !isMyClaim ? 'border-textDefault' : ''}
                  `}>
                     {n}
                     {!isMyClaim && <span className={`absolute bottom-0 w-full h-[2px] ${getColorClass(n).split(' ')[0].replace('text-', 'bg-')}`}></span>}
                  </div>
               )
            })}
            {/* Blank placeholders for unrevealed */}
            {Array.from({length: 20 - currentIndex}).map((_, i) => (
               <div key={`blank-${i}`} className="flex-shrink-0 w-10 h-10 bg-surface/30 border border-border/50 flex items-center justify-center text-[8px] text-textMuted/30 font-mono">
                  {currentIndex + i + 1}
               </div>
            ))}
         </div>
      )}

      <AnimatePresence>
         {isReveal && results && results.playerStats?.[playerId || ""] && (
            <motion.div 
               initial={{ opacity: 0, y: 50 }} 
               animate={{ opacity: 1, y: 0 }} 
               transition={{ delay: 3 }}
               className={`fixed inset-0 z-50 flex flex-col items-center justify-center p-8 text-center bg-background/95 backdrop-blur-md shadow-2xl border-y-4 ${results.playerStats[playerId || ""].eliminated ? 'border-primary' : 'border-secondary'}`}
            >
               {results.playerStats[playerId || ""].eliminated ? (
                  <>
                    <h1 className="font-serif text-5xl md:text-7xl text-primary uppercase tracking-[0.2em] shadow-glow-red drop-shadow-[0_0_15px_rgba(192,57,43,0.8)]">ELIMINATED</h1>
                    <p className="mt-8 text-xl text-textMuted uppercase tracking-widest">{results.playerStats[playerId || ""].reason || "Your claim was not high enough."}</p>
                  </>
               ) : (
                  <>
                    <h1 className="font-serif text-5xl md:text-7xl text-secondary uppercase tracking-[0.2em] shadow-glow-gold drop-shadow-[0_0_15px_rgba(212,160,23,0.8)]">SURVIVED</h1>
                    <p className="mt-8 text-xl text-textDefault uppercase tracking-widest">{results.playerStats[playerId || ""].reason || "You found a peak."}</p>
                    {results.playerStats[playerId || ""].bonus > 0 && (
                       <p className="mt-4 text-secondary font-mono">+ {results.playerStats[playerId || ""].bonus} Optimal Window Bonus</p>
                    )}
                  </>
               )}
            </motion.div>
         )}
      </AnimatePresence>
    </div>
  );
}
