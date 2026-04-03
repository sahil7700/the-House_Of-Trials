"use client";

import { motion } from "framer-motion";

export default function WinnerPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#0a0a0f] text-textDefault relative overflow-hidden">
      
      <div className="absolute inset-0 bg-secondary/10 pointer-events-none mix-blend-overlay" />
      <div className="absolute inset-0 bg-scanlines pointer-events-none opacity-50" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.5 }}
        className="z-10 text-center space-y-8 max-w-md w-full"
      >
        <div className="text-6xl text-secondary drop-shadow-glow-gold animate-pulse">♠</div>
        
        <h1 className="text-5xl sm:text-6xl font-serif tracking-widest text-secondary drop-shadow-glow-gold uppercase mt-4 mb-2">
          Citizen
        </h1>
        
        <p className="font-mono text-textMuted tracking-wider uppercase text-sm">
          You have survived the House of Trials.
        </p>

      </motion.div>
    </main>
  );
}
