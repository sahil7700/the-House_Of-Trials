"use client";

import { useState } from "react";
import { motion } from "framer-motion";

interface GameProps {
  onSubmit: (val: any) => void;
  isLocked: boolean;
  currentSubmission: any;
  results: any;
}

const RANGES = [
  "1-10", "11-20", "21-30", "31-40", "41-50",
  "51-60", "61-70", "71-80", "81-90", "91-100"
];

export default function GameA2({ onSubmit, isLocked, currentSubmission, results }: GameProps) {
  return (
    <div className="flex flex-col items-center justify-center w-full max-w-sm mx-auto space-y-6 font-mono">
      <div className="text-center space-y-2 mb-4">
        <h2 className="text-2xl uppercase tracking-widest text-primary drop-shadow-glow-red">Range Hunter</h2>
        <p className="text-sm text-textMuted max-w-xs mx-auto">Select a range. Ensure you exist in the minority to survive.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 w-full">
        {RANGES.map((r) => {
           let isSelected = currentSubmission === r;
           let isMajority = results?.majorityRange === r;
           let isMinority = results?.minorityRange === r;
           
           let btnClass = "border border-border p-4 text-center transition-colors relative overflow-hidden ";
           
           if (!isLocked && currentSubmission === null) {
              btnClass += "hover:bg-primary/20 hover:border-primary hover:text-primary cursor-pointer ";
           } else if (isSelected) {
              btnClass += "bg-white/10 text-white font-bold border-white/50 ";
           } else {
              btnClass += "opacity-40 grayscale ";
           }
           
           if (results) {
             if (isMajority) btnClass = "bg-primary/50 border-primary text-white font-bold shadow-glow-red animate-pulse ";
             if (isMinority) btnClass = "bg-secondary/40 border-secondary text-white font-bold shadow-glow-gold ";
           }

           return (
             <button 
               key={r}
               disabled={isLocked || currentSubmission !== null}
               onClick={() => onSubmit(r)}
               className={btnClass}
             >
                {r}
                {results && results.counts?.[r] !== undefined && (
                   <span className="block text-[10px] mt-1 opacity-70">
                     Pop: {results.counts[r]}
                   </span>
                )}
             </button>
           );
        })}
      </div>
    </div>
  );
}
