import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface GameB8Props {
  onSubmit: (val: any) => void;
  isLocked: boolean; // Locked normally applies when phase is 'locked'
  currentSubmission: any;
  results: any;
  playerId: string;
  timeLeft: number | null;
  gameState: any;
}

export default function GameB8({ onSubmit, isLocked, currentSubmission, results, playerId, timeLeft, gameState }: GameB8Props) {
  const [showConfirm, setShowConfirm] = useState<"RED" | "BLUE" | null>(null);

  const gsc = gameState.gameSpecificConfig || {};
  const queue: string[] = gsc.queue || [];
  const signals: Record<string, string> = gsc.signals || {};
  const publicFeed: any[] = gsc.publicFeed || [];
  const currentTurnIndex: number = gsc.currentTurnIndex || 0;

  const mySignal = signals[playerId];
  const myQueueIndex = queue.indexOf(playerId);
  const isMyTurn = myQueueIndex === currentTurnIndex && gameState.phase === "active";
  const myTurnHasPassed = myQueueIndex !== -1 && myQueueIndex < currentTurnIndex;
  const inQueue = myQueueIndex !== -1;

  // Auto-submit when time is up AND it is my turn
  useEffect(() => {
    if (timeLeft === 0 && isMyTurn && currentSubmission === null) {
      onSubmit(mySignal || "RED"); // Default to their signal if they timeout
    }
  }, [timeLeft, isMyTurn, currentSubmission, mySignal, onSubmit]);

  if (gameState.phase === "reveal" && results) {
    const isEliminated = results.eliminatedPlayerIds?.includes(playerId);
    const trueMajority = results.trueMajority;

    return (
      <div className="w-full space-y-8 flex flex-col items-center pt-8">
        <h2 className="text-3xl font-serif text-white tracking-widest uppercase mb-6 text-center">Reveal</h2>

        <div className="w-full p-6 bg-surface border border-border text-center space-y-4 max-w-md">
           <p className="text-xs uppercase tracking-widest text-textMuted">True System Majority</p>
           <h3 className={`text-6xl font-bold tracking-widest ${trueMajority === 'RED' ? 'text-primary drop-shadow-glow-red' : 'text-blue-500 drop-shadow-glow-blue'}`}>
              {trueMajority}
           </h3>
        </div>

        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center p-6 border-2 border-border bg-surface w-full max-w-md mt-8">
           {isEliminated ? (
              <div className="text-primary space-y-2">
                 <h3 className="text-4xl font-serif uppercase tracking-widest animate-pulse">Eliminated</h3>
                 <p className="text-textDefault">You selected {currentSubmission || "Nothing"}.</p>
                 <p className="text-xs uppercase">You were misled by the cascade.</p>
              </div>
           ) : (
              <div className="text-secondary space-y-2">
                 <h3 className="text-4xl font-serif uppercase tracking-widest shadow-glow-gold">Survived</h3>
                 <p className="text-textDefault">You correctly aligned with the majority.</p>
              </div>
           )}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto space-y-6 mt-4 pb-12">
       <div className="text-center space-y-2 mb-8">
          <p className="text-secondary text-sm uppercase tracking-widest font-bold">Round {gameState.currentSlot} · Information Cascade</p>
          <p className="text-xs text-textMuted uppercase px-4 my-2 leading-relaxed">
             Trust your signal, or trust the crowd. Guess the true mathematical majority of all assigned signals.
          </p>
       </div>

       {/* Private Signal Block */}
       {mySignal && (
          <div className={`p-4 border-l-4 bg-surface text-center shadow-lg transition-colors
             ${mySignal === 'RED' ? 'border-primary shadow-primary/10' : 'border-blue-500 shadow-blue-500/10'} 
          `}>
             <p className="text-[10px] text-textMuted uppercase tracking-widest mb-1">Your Private Signal</p>
             <p className={`text-3xl font-bold tracking-widest ${mySignal === 'RED' ? 'text-primary' : 'text-blue-500'}`}>{mySignal}</p>
          </div>
       )}

       {/* Public Feed History */}
       <div className="border border-border bg-surface p-4 font-mono text-xs shadow-inner">
          <div className="flex justify-between items-center mb-2">
             <p className="uppercase tracking-widest text-textMuted">Public Decision Log</p>
          </div>
          
          {/* Live Voting Bar */}
          {publicFeed.length > 0 && (
             <div className="w-full mb-4">
                <div className="flex justify-between text-[10px] mb-1">
                   <span className="text-primary">{publicFeed.filter(f => f.choice === 'RED').length} RED</span>
                   <span className="text-blue-500">{publicFeed.filter(f => f.choice === 'BLUE').length} BLUE</span>
                </div>
                <div className="w-full h-2 bg-background flex overflow-hidden border border-border">
                   <div style={{ width: `${(publicFeed.filter(f => f.choice === 'RED').length / publicFeed.length) * 100}%` }} className="h-full bg-primary transition-all duration-500"></div>
                   <div style={{ width: `${(publicFeed.filter(f => f.choice === 'BLUE').length / publicFeed.length) * 100}%` }} className="h-full bg-blue-500 transition-all duration-500"></div>
                </div>
             </div>
          )}

          <div className="space-y-1 h-48 overflow-y-auto pr-2 custom-scrollbar border-t border-border/50 pt-2">
             {publicFeed.length === 0 && <p className="text-textMuted/50 text-center italic mt-16">No decisions made yet.</p>}
             {publicFeed.map((f, i) => (
                <motion.div 
                   initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                   key={i} className="flex justify-between items-center p-2 border border-border bg-background"
                >
                   <span className="text-textMuted">#{i+1} <span className="opacity-50 blur-[2px] hover:blur-none transition-all">{f.playerName}</span></span>
                   <span className={`font-bold ${f.choice === 'RED' ? 'text-primary drop-shadow-glow-red' : 'text-blue-500 drop-shadow-glow-blue'}`}>{f.choice}</span>
                </motion.div>
             ))}
             {gameState.phase === "active" && currentTurnIndex < queue.length && (
                <div className="flex justify-between items-center p-2 border border-secondary border-dashed bg-secondary/10 text-secondary animate-pulse mt-2">
                   <span>#{currentTurnIndex + 1} {isMyTurn ? "YOU" : "Player"}</span>
                   <span>Deciding...</span>
                </div>
             )}
          </div>
       </div>

       {/* Interaction Block */}
       <div className="pt-4 border-t border-border mt-8">
          {!inQueue ? (
             <div className="p-6 border border-border bg-background text-center flex flex-col items-center justify-center space-y-4">
                <p className="text-xs uppercase tracking-widest text-textMuted">You are not in the queue</p>
                {gameState.phase === "lobby" && <p className="text-[10px] text-primary animate-pulse">Waiting for Admin to generate the cascade...</p>}
             </div>
          ) : myTurnHasPassed ? (
             <div className="p-4 border border-border bg-background text-center">
                <p className="text-xs uppercase tracking-widest text-textMuted">Your decision is recorded.</p>
                <p className={`text-2xl font-bold mt-2 ${currentSubmission === 'RED' ? 'text-primary' : 'text-blue-500'}`}>{currentSubmission}</p>
             </div>
          ) : isMyTurn ? (
             <div className="space-y-4">
                <p className="text-center text-sm uppercase tracking-widest text-secondary font-bold shadow-glow-gold animate-pulse">It is your turn</p>
                {timeLeft !== null && (
                   <p className="text-primary text-center text-xs uppercase animate-pulse font-bold border border-primary/30 p-2 bg-primary/5">
                      {timeLeft} seconds — auto submitting signal if no choice
                   </p>
                )}
                <div className="flex gap-4">
                   <button 
                     onClick={() => setShowConfirm("RED")}
                     className="flex-1 bg-primary/20 border-2 border-primary text-primary hover:bg-primary hover:text-white py-6 text-xl tracking-widest font-bold transition-all shadow-glow-red"
                   >
                      RED
                   </button>
                   <button 
                     onClick={() => setShowConfirm("BLUE")}
                     className="flex-1 bg-blue-500/20 border-2 border-blue-500 text-blue-500 hover:bg-blue-500 hover:text-white py-6 text-xl tracking-widest font-bold transition-all shadow-glow-blue"
                   >
                      BLUE
                   </button>
                </div>
             </div>
          ) : (
             <div className="p-6 border border-border bg-background text-center flex flex-col items-center justify-center">
                <p className="text-xs uppercase tracking-widest text-textMuted">Waiting for your turn</p>
                <p className="text-sm font-bold text-white mt-2 font-mono">Position: #{myQueueIndex + 1}</p>
             </div>
          )}
       </div>

       {/* Confirm Overlay */}
       <AnimatePresence>
          {showConfirm && (
             <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4 backdrop-blur-sm"
             >
                <div className="max-w-sm w-full bg-surface border border-border p-8 space-y-8 text-center text-white">
                   <h3 className="font-serif text-3xl uppercase tracking-widest">Confirm</h3>
                   <div className="space-y-2 text-sm text-textMuted">
                      <p>You are officially predicting the majority is</p>
                      <p className={`text-5xl font-bold font-mono tracking-widest pt-2 ${showConfirm === 'RED' ? 'text-primary drop-shadow-glow-red' : 'text-blue-500 drop-shadow-glow-blue'}`}>{showConfirm}</p>
                      <p className="text-primary uppercase mt-8 text-[10px] sm:text-xs">Once placed, it is visible to everyone behind you.</p>
                   </div>
                   <div className="flex gap-4">
                      <button onClick={() => setShowConfirm(null)} className="flex-1 border border-border bg-background py-3 uppercase tracking-widest text-xs hover:bg-border transition">Change</button>
                      <button onClick={() => { onSubmit(showConfirm); setShowConfirm(null); }} className={`flex-1 text-white py-3 uppercase tracking-widest text-xs font-bold transition ${showConfirm === 'RED' ? 'bg-primary shadow-glow-red hover:bg-primary/80' : 'bg-blue-500 shadow-glow-blue hover:bg-blue-500/80'}`}>Submit</button>
                   </div>
                </div>
             </motion.div>
          )}
       </AnimatePresence>
    </div>
  );
}
