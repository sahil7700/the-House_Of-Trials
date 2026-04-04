"use client";

import { useState } from "react";
import { motion } from "framer-motion";

interface GameProps {
  onSubmit: (val: any) => void;
  isLocked: boolean;
  currentSubmission: any;
  results: any;
}

export default function GameA1({ onSubmit, isLocked, currentSubmission, results }: GameProps) {
  const [val, setVal] = useState<string>("");

  const handleSubmit = () => {
    const num = Number(val);
    if (!isNaN(num) && num >= 0 && num <= 100) {
      onSubmit(num);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-md mx-auto space-y-8 font-mono">
      <div className="text-center space-y-2 mb-8">
        <h2 className="text-2xl uppercase tracking-widest text-primary drop-shadow-glow-red">Majority Trap</h2>
        <p className="text-sm text-textMuted max-w-xs mx-auto">Guess the number closest to exactly 2/3 of the group's average guess.</p>
      </div>

      {!isLocked ? (
        <>
          <input
            type="number"
            min="0"
            max="100"
            disabled={currentSubmission !== null}
            value={currentSubmission !== null ? currentSubmission : val}
            onChange={(e) => setVal(e.target.value)}
            className="w-full text-center text-6xl py-8 bg-transparent border-b-2 border-border focus:border-primary focus:outline-none transition-colors text-textDefault placeholder:text-textMuted/20"
            placeholder="0"
          />
          {currentSubmission === null ? (
            <button
              onClick={handleSubmit}
              disabled={val === ""}
              className="mt-8 px-12 py-4 bg-primary/10 border border-primary text-primary hover:bg-primary hover:text-white uppercase tracking-widest transition-all w-full shadow-glow-red disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Submit
            </button>
          ) : (
             <div className="text-success uppercase tracking-widest mt-8 animate-pulse text-sm">
               Submission Locked
             </div>
          )}
        </>
      ) : (
        <div className="space-y-6 w-full mt-8 border border-border bg-surface p-6">
          <p className="text-textMuted text-xs uppercase tracking-widest text-center border-b border-border pb-4">
            Game Protocol Locked
          </p>
          
          <div className="flex justify-between items-center px-4">
            <span className="text-xs uppercase text-textMuted">Your Input</span>
            <span className="text-xl">{currentSubmission ?? "None"}</span>
          </div>

          {results?.average !== undefined && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 pt-4 border-t border-border">
              <div className="flex justify-between items-center px-4">
                <span className="text-xs uppercase text-textMuted">Group Average</span>
                <span className="text-xl">{results.average.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center px-4 bg-secondary/10 p-2 border border-secondary">
                <span className="text-xs uppercase text-secondary font-bold">Target (2/3)</span>
                <span className="text-xl text-secondary font-bold">{results.target.toFixed(2)}</span>
              </div>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}
