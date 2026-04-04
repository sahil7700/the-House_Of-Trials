"use client";

import { useState } from "react";

interface GameProps {
  onSubmit: (val: any) => void;
  isLocked: boolean;
  currentSubmission: any;
  results: any;
}

export default function GameA4({ onSubmit, isLocked, currentSubmission, results }: GameProps) {
  // A simplistic ranking UI using buttons
  const [ranked, setRanked] = useState<string[]>([]);
  const options = ["Option A", "Option B", "Option C", "Option D"];
  
  const handleSelect = (opt: string) => {
    if (ranked.includes(opt)) {
      setRanked(ranked.filter(r => r !== opt));
    } else if (ranked.length < 4) {
      setRanked([...ranked, opt]);
    }
  };

  const isComplete = ranked.length === 4;

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-sm mx-auto space-y-6 font-mono">
      <div className="text-center space-y-2 mb-4">
        <h2 className="text-2xl uppercase tracking-widest text-primary drop-shadow-glow-red">Borda Sabotage</h2>
        <p className="text-sm text-textMuted max-w-xs mx-auto">Rank the options 1st to 4th. Only players who rank the 2nd place option as their 1st choice will survive.</p>
      </div>

      <div className="w-full space-y-4">
         {options.map((opt) => {
            const rankIndex = (currentSubmission || ranked).indexOf(opt);
            const isSelected = rankIndex !== -1;
            
            return (
              <button
                key={opt}
                disabled={isLocked || currentSubmission !== null}
                onClick={() => handleSelect(opt)}
                className={`w-full flex justify-between items-center p-4 border transition-all ${
                  isSelected ? "bg-white/10 border-white text-white" : "bg-surface border-border text-textMuted"
                } ${results?.secondPlaceOption === opt ? "border-secondary bg-secondary/20 shadow-glow-gold" : ""}`}
              >
                <span className="uppercase tracking-widest">{opt}</span>
                {isSelected && (
                  <span className="w-6 h-6 flex items-center justify-center bg-primary text-white text-xs font-bold rounded-full">
                    {rankIndex + 1}
                  </span>
                )}
              </button>
            )
         })}
      </div>

      {currentSubmission === null && (
        <button
          disabled={!isComplete}
          onClick={() => onSubmit(ranked)}
          className="w-full mt-4 py-4 border border-primary text-primary hover:bg-primary hover:text-white uppercase tracking-widest disabled:opacity-30 disabled:border-border disabled:text-textMuted disabled:hover:bg-transparent transition-all"
        >
          Submit Ranking
        </button>
      )}

      {results && (
        <div className="w-full border border-secondary bg-secondary/10 p-4 text-center mt-4">
          <p className="text-xs text-textMuted uppercase tracking-widest">Global 2nd Place:</p>
          <p className="text-xl text-secondary font-bold uppercase">{results.secondPlaceOption}</p>
        </div>
      )}
    </div>
  );
}
