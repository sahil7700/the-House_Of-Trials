import Link from "next/link";

export default function Home() {
  return (
    <LazyMotion features={domAnimation}>
      <main className="relative min-h-screen flex flex-col items-center justify-center p-6 overflow-hidden">
        
        {/* Suit Cluster */}
        <div className="flex gap-4 text-primary text-4xl sm:text-5xl drop-shadow-glow-red animate-hero-suits">
          <span>♠</span>
          <span className="text-textDefault opacity-50">♣</span>
          <span className="text-secondary drop-shadow-glow-gold">♦</span>
          <span>♥</span>
        </div>

        {/* Headings */}
        <div className="space-y-6">
          <h1 
            className="text-6xl sm:text-7xl md:text-8xl font-serif tracking-[0.2em] uppercase text-textDefault"
            style={{
              animation: "hero-heading 0.8s 0.3s both ease-out",
              willChange: "transform, opacity",
              textShadow: "0 0 20px rgba(232, 232, 240, 0.2)",
            }}
          >
            House of
            <br />
            <span className="text-primary tracking-[0.3em]">Trials</span>
          </h1>

          <p 
            className="text-lg sm:text-xl text-textMuted tracking-widest uppercase animate-hero-subtitle"
          >
            Only one will remain.
          </p>
        </div>

        {/* CTA */}
        <div className="animate-hero-cta">
          <Link
            href="/join"
            className="group relative inline-flex items-center justify-center px-8 py-4 bg-primary/10 border-2 border-primary text-primary font-mono tracking-widest uppercase transition-all duration-300 hover:bg-primary hover:text-white shadow-glow-red hover:shadow-[0_0_20px_rgba(192,57,43,0.6)]"
          >
            Enter the Arena <span className="ml-3 group-hover:translate-x-1 transition-transform">→</span>
          </Link>
        </div>
      </div>

      {/* Footer */}
      <div className="absolute bottom-8 text-xs text-textMuted/50 tracking-widest uppercase text-center animate-hero-footer">
        Alice in Borderland · College Tech Fest
      </div>

      </main>
    </LazyMotion>
  );
}
