"use client";

import { useState } from "react";

interface GameProps {
  onSubmit: (val: any) => void;
  isLocked: boolean;
  currentSubmission: any;
  results: any;
}

export default function GameA3({ onSubmit, isLocked, currentSubmission, results }: GameProps) {
  const [val, setVal] = useState<number>(50);

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-sm mx-auto space-y-8 font-mono">
      <div className="text-center space-y-2 mb-8">
        <h2 className="text-2xl uppercase tracking-widest text-primary drop-shadow-glow-red">Traveler's Dilemma</h2>
        <p className="text-sm text-textMuted max-w-xs mx-auto">Bid between 2 and 100. Lower bids win the bonus if they don't match.</p>
      </div>

      <div className="w-full space-y-8">
        <div className="text-center">
           <span className="text-6xl text-textDefault focus:outline-none">{currentSubmission !== null ? currentSubmission : val}</span>
        </div>
        
        <input 
           type="range" 
           min="2" max="100" 
           value={currentSubmission !== null ? currentSubmission : val}
           onChange={(e) => setVal(Number(e.target.value))}
           disabled={isLocked || currentSubmission !== null}
           className="w-full accent-primary h-2 bg-surface appearance-none rounded-none outline-none"
        />

        {currentSubmission === null ? (
           <button
             onClick={() => onSubmit(val)}
             className="w-full py-4 border-2 border-primary text-primary hover:bg-primary hover:text-white uppercase tracking-widest transition-all shadow-glow-red"
           >
             Lock Bid
           </button>
        ) : (
           <div className="text-success uppercase tracking-widest text-center mt-8 text-sm">
             Bid Locked In
           </div>
        )}
      </div>
      
      {results && (
         <div className="w-full mt-8 p-4 border border-border bg-surface text-center">
            <p className="text-xs text-textMuted uppercase tracking-widest">Resolution Active</p>
         </div>
      )}
    </div>
  );
}
