"use client";

import { useState } from "react";

interface GameProps {
  onSubmit: (val: any) => void;
  isLocked: boolean;
  currentSubmission: any;
  results: any;
}

export default function GameC10({ onSubmit, isLocked, currentSubmission, results }: GameProps) {
  // Let's assume the current visible number is pushed via gameState.displayMessage or standard
  // To keep it simple, the player just claims whatever the current state is, or we pass a hardcoded 
  // value from the admin screen. Since this is purely client side, they just click "Claim!"
  
  return (
    <div className="flex flex-col items-center justify-center w-full max-w-sm mx-auto space-y-8 font-mono">
      <div className="text-center space-y-2 mb-8">
        <h2 className="text-2xl uppercase tracking-widest text-primary drop-shadow-glow-red">Peak Finder</h2>
        <p className="text-sm text-textMuted max-w-xs mx-auto">Claim the number on the Big Screen before time runs out. You only get one try.</p>
      </div>

      <button
         onClick={() => onSubmit("CLAIMED")}
         disabled={isLocked || currentSubmission !== null}
         className="w-48 h-48 rounded-full border-4 border-primary bg-primary/20 text-primary font-bold text-2xl uppercase tracking-widest shadow-glow-red hover:bg-primary hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:grayscale"
      >
        {currentSubmission !== null ? "LOCKED IN" : "CLAIM"}
      </button>

      {results && (
        <div className="p-4 border border-border bg-surface text-center w-full mt-8">
           <span className="text-xs uppercase text-textMuted tracking-widest block mb-2">Highest Value Mapped</span>
           <span className="text-xl text-secondary font-bold">{results.topClaim ?? "N/A"}</span>
        </div>
      )}
    </div>
  );
}
