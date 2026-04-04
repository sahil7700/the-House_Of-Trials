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
  const [selected, setSelected] = useState<number | null>(null);

  const handleSelect = (num: number) => {
    if (currentSubmission !== null || isLocked) return;
    setSelected(num);
  };

  const handleSubmit = () => {
    if (selected !== null) {
      onSubmit(selected);
    }
  };

  const displayValue = currentSubmission !== null ? currentSubmission : selected;

  return (
    <div className="flex flex-col items-center w-full max-w-lg mx-auto space-y-6 font-mono">
      <div className="text-center space-y-2">
        <h2 className="text-2xl uppercase tracking-widest text-primary drop-shadow-glow-red">Majority Trap</h2>
        <p className="text-sm text-textMuted max-w-xs mx-auto">
          Pick the number closest to exactly 2/3 of the group&apos;s average guess.
        </p>
      </div>

      {/* Selected display */}
      <div className="text-5xl font-bold tracking-widest text-textDefault min-h-[60px] flex items-center justify-center">
        {displayValue !== null ? displayValue : <span className="text-textMuted/30 text-2xl uppercase tracking-widest">Select a number</span>}
      </div>

      {!isLocked ? (
        <>
          {/* Number Grid */}
          <div className="grid grid-cols-10 gap-1 w-full">
            {Array.from({ length: 100 }, (_, i) => i + 1).map(num => {
              const isSelected = displayValue === num;
              const isDisabled = currentSubmission !== null;
              return (
                <button
                  key={num}
                  onClick={() => handleSelect(num)}
                  disabled={isDisabled}
                  className={`
                    aspect-square text-xs font-mono flex items-center justify-center border transition-all duration-100
                    ${isSelected
                      ? "bg-primary border-primary text-white shadow-glow-red font-bold"
                      : isDisabled
                        ? "bg-surface border-border text-textMuted/30 cursor-not-allowed"
                        : "bg-background border-border text-textMuted hover:border-secondary hover:text-secondary hover:bg-secondary/10 cursor-pointer"
                    }
                  `}
                >
                  {num}
                </button>
              );
            })}
          </div>

          {currentSubmission === null ? (
            <button
              onClick={handleSubmit}
              disabled={selected === null}
              className="w-full py-4 bg-primary/10 border border-primary text-primary hover:bg-primary hover:text-white uppercase tracking-widest transition-all shadow-glow-red disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Submit — {selected !== null ? selected : "?"}
            </button>
          ) : (
            <div className="text-success uppercase tracking-widest animate-pulse text-sm">
              ✓ Submission Locked — {currentSubmission}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-6 w-full border border-border bg-surface p-6">
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
