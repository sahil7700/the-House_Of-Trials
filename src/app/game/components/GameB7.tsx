"use client";

import { useState } from "react";
import { motion } from "framer-motion";

interface GameProps {
  onSubmit: (val: any) => void;
  isLocked: boolean;
  currentSubmission: any;
  results: any;
}

export default function GameB7({ onSubmit, isLocked, currentSubmission, results }: GameProps) {
  return (
    <div className="flex flex-col items-center justify-center w-full max-w-sm mx-auto space-y-8 font-mono">
      <div className="text-center space-y-2 mb-4">
        <h2 className="text-2xl uppercase tracking-widest text-primary drop-shadow-glow-red">The Shortcut Trap</h2>
        <p className="text-sm text-textMuted max-w-xs mx-auto">Choose your path carefully. The faster route clogs if too many take it.</p>
      </div>

      <div className="flex flex-col gap-6 w-full mt-4">
        <button
           disabled={isLocked || currentSubmission !== null}
           onClick={() => onSubmit("Route 1")}
           className={`p-6 border-2 transition-all relative overflow-hidden ${
             currentSubmission === "Route 1" || results?.eliminatedRoute === "Route 2" 
               ? "bg-white/10 border-white text-white font-bold" 
               : "bg-surface border-border text-textMuted hover:border-textDefault hover:text-textDefault cursor-pointer"
           } ${results?.eliminatedRoute === "Route 1" ? "bg-primary/50 border-primary text-white" : ""}`}
        >
          <span className="text-xl tracking-widest uppercase">ROUTE 1</span>
          <span className="block text-xs mt-2 opacity-60">Fixed 25 mins</span>
          {results && <span className="block absolute bottom-2 right-2 text-[10px] text-white">Count: {results.route1Count}</span>}
        </button>

        <button
           disabled={isLocked || currentSubmission !== null}
           onClick={() => onSubmit("Route 2")}
           className={`p-6 border-2 transition-all relative overflow-hidden ${
             currentSubmission === "Route 2" || results?.eliminatedRoute === "Route 1" 
               ? "bg-white/10 border-white text-white font-bold" 
               : "bg-surface border-border text-textMuted hover:border-textDefault hover:text-textDefault cursor-pointer"
           } ${results?.eliminatedRoute === "Route 2" ? "bg-primary/50 border-primary text-white animate-pulse" : ""}`}
        >
           <span className="text-xl tracking-widest uppercase text-secondary">ROUTE 2</span>
           <span className="block text-xs mt-2 opacity-60">Shortcut (Variable)</span>
           {results && <span className="block absolute bottom-2 right-2 text-[10px] text-white">Count: {results.route2Count}</span>}
        </button>
      </div>
    </div>
  );
}
