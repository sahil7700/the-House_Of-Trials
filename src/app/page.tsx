"use client";

import Link from "next/link";
import { motion } from "framer-motion";

export default function Home() {
  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center p-6 overflow-hidden">
      
      {/* Background decoration */}
      <div className="absolute inset-0 z-0 bg-scanlines mix-blend-overlay opacity-30 pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-3xl pointer-events-none" />

      <div className="z-10 flex flex-col items-center justify-center max-w-3xl text-center space-y-12">
        
        {/* Suit Cluster */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="flex gap-4 text-primary text-4xl sm:text-5xl drop-shadow-glow-red"
        >
          <span>♠</span>
          <span className="text-textDefault opacity-50">♣</span>
          <span className="text-secondary drop-shadow-glow-gold">♦</span>
          <span>♥</span>
        </motion.div>

        {/* Headings */}
        <div className="space-y-6">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.8 }}
            className="text-6xl sm:text-7xl md:text-8xl font-serif tracking-[0.2em] uppercase text-textDefault"
            style={{ textShadow: "0 0 20px rgba(232, 232, 240, 0.2)" }}
          >
            House of
            <br />
            <span className="text-primary tracking-[0.3em]">Trials</span>
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2, duration: 1 }}
            className="text-lg sm:text-xl text-textMuted tracking-widest uppercase"
          >
            Only one will remain.
          </motion.p>
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.5, duration: 0.8 }}
        >
          <Link
            href="/join"
            className="group relative inline-flex items-center justify-center px-8 py-4 bg-primary/10 border-2 border-primary text-primary font-mono tracking-widest uppercase transition-all duration-300 hover:bg-primary hover:text-white shadow-glow-red hover:shadow-[0_0_20px_rgba(192,57,43,0.6)]"
          >
            Enter the Arena <span className="ml-3 group-hover:translate-x-1 transition-transform">→</span>
          </Link>
        </motion.div>
      </div>

      {/* Footer */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2, duration: 1 }}
        className="absolute bottom-8 text-xs text-textMuted/50 tracking-widest uppercase text-center"
      >
        Alice in Borderland · College Tech Fest
      </motion.div>

    </main>
  );
}
