import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface GameB6Props {
  onSubmit: (val: any) => void;
  isLocked: boolean;
  currentSubmission: any;
  results: any;
  playerId: string;
  timeLeft: number | null;
  gameState: any;
}

export default function GameB6({ onSubmit, isLocked, currentSubmission, results, playerId, timeLeft, gameState }: GameB6Props) {
  const [bid, setBid] = useState(50);
  const [showConfirm, setShowConfirm] = useState(false);
  const [revealStep, setRevealStep] = useState(0);

  // Auto-submit when time is up
  useEffect(() => {
    if (timeLeft === 0 && !isLocked && currentSubmission === null) {
      onSubmit(bid);
    }
  }, [timeLeft, isLocked, currentSubmission, bid, onSubmit]);

  useEffect(() => {
    if (gameState.phase === "reveal" && results) {
      // Sequence the reveal
      setRevealStep(1); // Histogram
      const t1 = setTimeout(() => setRevealStep(2), 2000); // Elimination zone
      const t2 = setTimeout(() => setRevealStep(3), 4000); // Penalty zone
      const t3 = setTimeout(() => setRevealStep(4), 6000); // Verdict
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    }
  }, [gameState.phase, results]);

  const handleAdjust = (delta: number) => {
    setBid(prev => Math.max(1, Math.min(100, prev + delta)));
  };

  const handleConfirm = () => {
    onSubmit(bid);
    setShowConfirm(false);
  };

  if (gameState.phase === "reveal" && results) {
    const isEliminated = results.eliminatedPlayerIds?.includes(playerId);
    const myBid = currentSubmission;
    const isHighest = results.highestBidderIds?.includes(playerId);
    
    // Convert histogram to sorted bars
    const bars = Object.entries(results.histogram || {})
       .map(([val, count]) => ({ val: parseInt(val), count: count as number }))
       .filter(b => b.count > 0)
       .sort((a, b) => a.val - b.val);
    const maxCount = Math.max(...bars.map(b => b.count), 1);

    return (
      <div className="w-full space-y-8 flex flex-col items-center">
        <h2 className="text-3xl font-serif text-secondary tracking-widest uppercase">The House's Decision</h2>

        <div className="w-full bg-surface border border-border p-6 h-[300px] flex items-end gap-1 relative overflow-hidden">
          {bars.map((b, i) => {
            const isBelowCutoff = b.val <= results.cutOffBid;
            const isHighBid = b.val === results.highestBid;
            let bgColor = "bg-white/20";
            
            if (revealStep >= 2 && isBelowCutoff) bgColor = "bg-primary";
            else if (revealStep >= 3 && isHighBid) bgColor = "bg-secondary shadow-glow-gold";

            return (
              <motion.div 
                key={b.val}
                initial={{ height: 0 }}
                animate={{ height: `${(b.count / maxCount) * 100}%` }}
                transition={{ duration: 1.5, delay: i * 0.05 }}
                className={`flex-1 min-w-[4px] relative group ${bgColor}`}
              >
                <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-background border px-2 py-1 text-[10px] z-10 whitespace-nowrap">
                  Bid {b.val}: {b.count}
                </div>
              </motion.div>
            );
          })}
          
          {revealStep >= 2 && (
             <div className="absolute top-0 bottom-0 border-l-2 border-primary border-dashed z-0 opacity-50" 
                  style={{ left: `${(results.cutOffBid / 100) * 100}%` }} />
          )}
        </div>

        <div className="h-24">
          {revealStep >= 2 && revealStep < 4 && (
             <div className="text-center animate-fade-in space-y-2">
                {revealStep === 2 && <p className="text-primary text-xl font-bold uppercase tracking-widest">Bids {results.cutOffBid} and under — ELIMINATED</p>}
                {revealStep === 3 && <p className="text-secondary text-xl font-bold uppercase tracking-widest">Highest Bid ({results.highestBid}) — SURVIVED WITH PENALTY</p>}
             </div>
          )}

          {revealStep >= 4 && (
             <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center p-6 border-2 border-border bg-surface w-full max-w-md">
                {isEliminated ? (
                   <div className="text-primary space-y-2">
                      <h3 className="text-4xl font-serif uppercase tracking-widest animate-pulse">Eliminated</h3>
                      <p>Your bid: {myBid}. Cutoff was {results.cutOffBid}.</p>
                      <p className="text-xs uppercase">You showed too little commitment.</p>
                   </div>
                ) : isHighest ? (
                   <div className="text-secondary space-y-2">
                      <h3 className="text-3xl font-serif uppercase tracking-widest shadow-glow-gold">Survived — But at a cost</h3>
                      <p>Your bid of {myBid} was the highest.</p>
                      {results.penaltyApplied?.type !== "none" && (
                         <p className="text-xs uppercase">Penalty applied.</p>
                      )}
                   </div>
                ) : (
                   <div className="text-textDefault space-y-2">
                      <h3 className="text-3xl font-serif uppercase tracking-widest">You Survived</h3>
                      <p>Your bid: {myBid} coins — safely within range.</p>
                   </div>
                )}
             </motion.div>
          )}
        </div>
      </div>
    );
  }

  if (isLocked) {
    return (
      <div className="text-center space-y-6 max-w-md mx-auto p-8 border border-border bg-surface mt-12">
         <h2 className="text-2xl font-serif text-secondary tracking-[0.2em] uppercase">Bids Sealed</h2>
         <p className="text-4xl font-mono text-white">{currentSubmission}</p>
         <p className="text-sm text-textMuted uppercase tracking-widest">The house is calculating...</p>
         <div className="text-secondary text-4xl animate-pulse pt-4">♣</div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto space-y-8 mt-4">
       <div className="text-center space-y-2 mb-12">
          <p className="text-secondary text-sm uppercase tracking-widest font-bold">Round {gameState.currentSlot} · {gameState.currentRoundTitle || "Bidding Survival"}</p>
          <h1 className="text-4xl sm:text-5xl font-serif text-white tracking-widest uppercase mb-4">Bidding Survival</h1>
          <div className="bg-surface/50 border border-border p-4 text-xs text-textMuted uppercase tracking-wider leading-relaxed">
             <p>You have 100 coins. Bid to prove your commitment.</p>
             <p className="text-primary">Bid too low — you are eliminated.</p>
             <p className="text-secondary">Bid too high — you survive but carry a penalty.</p>
          </div>
       </div>

       <div className="border border-border p-8 bg-surface space-y-10 relative">
          <div className="text-center">
             <div className="w-8 h-8 rounded-full border-2 border-secondary flex items-center justify-center mx-auto mb-2 relative">
                <div className="absolute w-full h-[2px] bg-secondary rotate-45 transform scale-75" />
             </div>
             <p className="text-secondary text-2xl font-mono font-bold tracking-widest">Your coins: 100</p>
          </div>

          <div className="space-y-6">
             <div className="text-center">
                <span className="text-[80px] leading-none font-mono text-white block">{bid}</span>
                <span className="text-xs text-textMuted uppercase tracking-widest">You are bidding {bid}% of your total coins.</span>
             </div>

             <input 
                type="range" 
                min="1" 
                max="100" 
                value={bid} 
                onChange={(e) => setBid(parseInt(e.target.value))} 
                className="w-full accent-primary h-2 bg-background appearance-none"
             />

             <div className="flex justify-between gap-2">
                <button onClick={() => handleAdjust(-5)} className="flex-1 bg-background border border-border py-2 text-textMuted hover:text-white hover:border-textMuted transition">-5</button>
                <button onClick={() => handleAdjust(-1)} className="flex-1 bg-background border border-border py-2 text-textMuted hover:text-white hover:border-textMuted transition">-1</button>
                <button onClick={() => handleAdjust(1)} className="flex-1 bg-background border border-border py-2 text-textMuted hover:text-white hover:border-textMuted transition">+1</button>
                <button onClick={() => handleAdjust(5)} className="flex-1 bg-background border border-border py-2 text-textMuted hover:text-white hover:border-textMuted transition">+5</button>
             </div>
          </div>

          <button 
             onClick={() => setShowConfirm(true)}
             className="w-full bg-primary/20 hover:bg-primary text-primary hover:text-white border border-primary py-4 text-xl uppercase tracking-widest font-bold transition-colors shadow-glow-red"
          >
             PLACE BID
          </button>
       </div>

       {timeLeft !== null && timeLeft <= 30 && (
         <p className="text-primary text-center text-xs uppercase animate-pulse mt-4 font-bold border border-primary/30 p-2 bg-primary/5">
            {timeLeft} seconds — your current bid will auto-submit.
         </p>
       )}

       {/* Confirm Overlay */}
       <AnimatePresence>
          {showConfirm && (
             <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4 backdrop-blur-sm"
             >
                <div className="max-w-sm w-full bg-surface border border-border p-8 space-y-8 text-center text-white">
                   <h3 className="font-serif text-2xl uppercase tracking-widest">Confirm Bid</h3>
                   <div className="space-y-2 text-sm text-textMuted">
                      <p>You are bidding <span className="text-2xl font-mono text-secondary">{bid}</span> coins out of 100.</p>
                      <p className="text-primary uppercase mt-4 text-[10px] sm:text-xs">This cannot be changed after confirming.</p>
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
