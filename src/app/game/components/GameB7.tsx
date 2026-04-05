import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface GameProps {
  onSubmit: (val: any) => void;
  isLocked: boolean;
  currentSubmission: any;
  results: any;
  playerId?: string;
  gameSpecificConfig?: any;
}

export default function GameB7({ onSubmit, isLocked, currentSubmission, results, playerId, gameSpecificConfig }: GameProps) {
  const [selectedRoute, setSelectedRoute] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);

  const revealStep = gameSpecificConfig?.revealStep || 0;
  const threshold = gameSpecificConfig?.threshold || 0;
  const fixedRouteTime = gameSpecificConfig?.fixedRouteTime || 25;

  const handleSelect = (route: number) => {
    if (isLocked || currentSubmission !== null) return;
    setSelectedRoute(route);
    setConfirming(false);
  };

  const handleConfirm = () => {
    if (selectedRoute && currentSubmission === null && !isLocked) {
      onSubmit(selectedRoute);
    }
  };

  const myChoice = currentSubmission ?? selectedRoute;

  // Reveal Phase Mappings
  const isReveal = results !== null;
  const r1Count = results?.route1Count || 0;
  const r2Count = results?.route2Count || 0;
  const r2Slower = r2Count >= threshold;
  const eliminatedRoute = results?.eliminatedRoute || 0;
  const won = currentSubmission !== null && currentSubmission !== eliminatedRoute;

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col items-center min-h-[70vh] justify-center relative">
      {!isReveal && (
        <div className="text-center mb-8">
          <h2 className="font-serif uppercase text-4xl tracking-widest text-textDefault shadow-glow-gold">The Shortcut Trap</h2>
          <p className="text-sm text-textMuted mt-4 uppercase tracking-widest">Choose your route. The faster route survives. Slower route is eliminated.</p>
        </div>
      )}

      <div className="flex flex-col md:flex-row w-full gap-6">
        {/* ROUTE 1 */}
        <motion.div 
          onClick={() => handleSelect(1)}
          className={`flex-1 border p-6 flex flex-col justify-between transition-all cursor-pointer relative overflow-hidden h-64
            ${myChoice === 1 ? 'border-primary shadow-glow-red scale-[1.02] bg-surface' : (myChoice !== null ? 'border-border bg-background opacity-40 grayscale' : 'border-border bg-surface hover:border-textMuted')}
            ${isReveal && r2Slower ? 'border-secondary shadow-glow-gold' : ''}
          `}
        >
          <div>
            <span className="text-lg text-textMuted">♠</span>
            <h3 className="font-serif text-3xl mt-2 tracking-widest text-textDefault">ROUTE 1</h3>
            <p className="text-xs uppercase text-textMuted mt-2 tracking-widest">Fixed Path</p>
            <p className="text-sm mt-4">Always takes {fixedRouteTime} minutes.</p>
            <div className="w-full h-px bg-textMuted my-4"></div>
            <p className="text-[10px] uppercase text-textMuted text-center">Predictable. Reliable. Safe?</p>
          </div>
          
          <AnimatePresence>
            {isReveal && revealStep >= 1 && (
               <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="absolute bottom-4 right-4 bg-background border border-textMuted p-2 text-center shadow-2xl">
                 <p className="text-3xl font-mono text-textDefault">{r1Count}</p>
                 <p className="text-[10px] text-textMuted uppercase tracking-widest">Players</p>
               </motion.div>
            )}
            {isReveal && revealStep >= 3 && (
               <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className={`absolute top-4 right-4 p-2 font-bold uppercase tracking-widest text-xs border ${!r2Slower ? 'text-primary border-primary' : 'text-secondary border-secondary bg-secondary/10'}`}>
                 {!r2Slower ? "SLOWER" : "FASTER ✓"}
               </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* ROUTE 2 */}
        <motion.div 
          onClick={() => handleSelect(2)}
          className={`flex-1 border p-6 flex flex-col justify-between transition-all cursor-pointer relative overflow-hidden h-64
            ${myChoice === 2 ? 'border-primary shadow-glow-red scale-[1.02] bg-surface' : (myChoice !== null ? 'border-border bg-background opacity-40 grayscale' : 'border-border bg-surface hover:border-textMuted')}
            ${isReveal && !r2Slower ? 'border-secondary shadow-glow-gold' : ''}
          `}
        >
          <div>
            <span className="text-lg text-primary">♦</span>
            <h3 className="font-serif text-3xl mt-2 tracking-widest text-textDefault">ROUTE 2</h3>
            <p className="text-xs uppercase text-textMuted mt-2 tracking-widest">Variable Path</p>
            <p className="text-sm mt-4">Faster when empty. Slower when crowded.</p>
            <svg className="w-full h-4 my-4 stroke-textMuted fill-transparent opacity-80" viewBox="0 0 100 20" preserveAspectRatio="none"><path d="M0,10 Q25,0 50,10 T100,10" strokeWidth="2"></path></svg>
            <p className="text-[10px] uppercase text-textMuted text-center">Could be faster. Could be fatal.</p>
          </div>
          
          <AnimatePresence>
            {isReveal && revealStep >= 1 && (
               <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="absolute bottom-4 left-4 bg-background border border-textMuted p-2 text-center shadow-2xl">
                 <p className="text-3xl font-mono text-primary">{r2Count}</p>
                 <p className="text-[10px] text-textMuted uppercase tracking-widest">Players</p>
               </motion.div>
            )}
            {isReveal && revealStep >= 3 && (
               <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className={`absolute top-4 left-4 p-2 font-bold uppercase tracking-widest text-xs border ${r2Slower ? 'text-primary border-primary bg-primary/10' : 'text-secondary border-secondary'}`}>
                 {r2Slower ? `SLOWER (> ${threshold}) ⚠` : "FASTER ✓"}
               </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {!isReveal && currentSubmission === null && selectedRoute !== null && (
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={handleConfirm}
          className="mt-8 w-full border border-primary bg-primary/10 hover:bg-primary text-textDefault uppercase tracking-[0.3em] py-4 shadow-glow-red font-bold transition-all"
        >
          Confirm Route {selectedRoute}
        </motion.button>
      )}

      {currentSubmission !== null && !isReveal && (
         <div className="mt-8 text-center text-textMuted animate-pulse">
           <p className="uppercase tracking-widest text-sm">You chose Route {currentSubmission}</p>
           <p className="text-xs mt-2">{isLocked ? "Calculating route density..." : "Waiting for remaining players..."}</p>
         </div>
      )}

      <AnimatePresence>
        {isReveal && revealStep >= 1 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-8 w-full border border-border bg-surface p-4 text-center">
            <div className="flex bg-background h-4 w-full border border-border my-4 overflow-hidden relative">
               {r1Count + r2Count > 0 && (
                  <>
                     <div className="h-full bg-textMuted transition-all duration-1000" style={{width: `${(r1Count / (r1Count + r2Count)) * 100}%`}}></div>
                     <div className="h-full bg-primary transition-all duration-1000" style={{width: `${(r2Count / (r1Count + r2Count)) * 100}%`}}></div>
                  </>
               )}
            </div>
            
            <AnimatePresence>
               {revealStep >= 2 && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="pt-4 border-t border-border mt-4">
                     <p className="text-textMuted text-xs uppercase tracking-widest">Route 2 becomes slower when count is &ge; threshold</p>
                     <p className="font-mono text-3xl text-secondary mt-2">THRESHOLD = {threshold}</p>
                  </motion.div>
               )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isReveal && revealStep >= 4 && (
           <motion.div 
             initial={{ opacity: 0, scale: 0.95 }} 
             animate={{ opacity: 1, scale: 1 }} 
             className={`fixed inset-0 z-50 flex flex-col items-center justify-center p-8 text-center bg-background/95 backdrop-blur-md shadow-2xl border-y-4 ${won ? 'border-secondary' : 'border-primary'}`}
           >
              {won ? (
                 <>
                   <h1 className="font-serif text-5xl md:text-7xl text-secondary uppercase tracking-[0.2em] shadow-glow-gold drop-shadow-[0_0_15px_rgba(212,160,23,0.8)]">You took the better path</h1>
                   <p className="mt-8 text-2xl text-textDefault font-mono">Route {currentSubmission} was faster.</p>
                   {results.bonus > 0 && results.underdogRoute === currentSubmission && (
                      <p className="mt-4 text-secondary uppercase tracking-widest text-sm">+ {results.bonus} Underdog Bonus</p>
                   )}
                 </>
              ) : (
                 <>
                   <h1 className="font-serif text-5xl md:text-7xl text-primary uppercase tracking-[0.2em] shadow-glow-red drop-shadow-[0_0_15px_rgba(192,57,43,0.8)]">The Shortcut Betrayed You</h1>
                   <p className="mt-8 text-2xl text-textDefault font-mono">Route {currentSubmission} was slower.</p>
                   <p className="text-textMuted mt-4 uppercase tracking-widest text-xs">Threshold was {threshold}. Route 2 had {r2Count}.</p>
                 </>
              )}
           </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
