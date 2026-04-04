"use client";

import { motion } from "framer-motion";

interface GameProps {
  isLocked: boolean;
  gameName: string;
}

export default function OfflineGame({ isLocked, gameName }: GameProps) {
  return (
    <div className="flex flex-col items-center justify-center w-full max-w-md mx-auto space-y-8 font-mono text-center">
      <div className="text-6xl text-primary animate-pulse drop-shadow-glow-red">
        ♠
      </div>
      <div className="space-y-4">
        <h2 className="text-2xl uppercase tracking-widest text-textDefault">{gameName}</h2>
        <p className="text-sm text-textMuted max-w-sm mx-auto leading-relaxed">
          This test relies on physical interaction or external rules. 
          <br /><br />
          Please direct your attention to the Host and the Big Screen.
        </p>
      </div>
      
      {isLocked && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-8 border border-border bg-surface p-4 text-xs uppercase text-secondary tracking-widest">
           Calculating outcomes securely...
        </motion.div>
      )}
    </div>
  );
}
