"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";

export default function HomePage() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <>
      {/* Skip link for keyboard users */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 bg-white text-black rounded px-3 py-2 z-50"
      >
        Skip to content
      </a>

      <div className="relative min-h-screen w-full overflow-hidden bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        {/* Animated background elements */}
        <div className="absolute inset-0 overflow-hidden">
          <motion.div
            className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl"
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.3, 0.5, 0.3],
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
          <motion.div
            className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-pink-500/20 rounded-full blur-3xl"
            animate={{
              scale: [1.2, 1, 1.2],
              opacity: [0.5, 0.3, 0.5],
            }}
            transition={{
              duration: 10,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
          <motion.div
            className="absolute top-1/2 left-1/2 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl"
            animate={{
              scale: [1, 1.3, 1],
              x: [-50, 50, -50],
              y: [-50, 50, -50],
            }}
            transition={{
              duration: 12,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />

          {/* Mouse-following gradient */}
          <motion.div
            className="absolute w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"
            animate={{
              x: mousePosition.x - 192,
              y: mousePosition.y - 192,
            }}
            transition={{
              type: "spring",
              damping: 30,
              stiffness: 50,
            }}
          />
        </div>

        <main id="main" className="relative z-10 px-6 md:px-10 py-10">
          {/* Top bar */}
          <motion.header
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-6xl mx-auto flex items-center justify-between"
            role="banner"
          >
            <Link href="/" className="flex items-center gap-3 group">
              <motion.div
                whileHover={{ scale: 1.1, rotate: 5 }}
                className="size-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 grid place-items-center shadow-lg shadow-purple-500/50"
                aria-hidden
              >
                <span className="text-2xl">✨</span>
              </motion.div>
              <span className="font-bold text-xl tracking-wide bg-gradient-to-r from-purple-200 to-pink-200 bg-clip-text text-transparent">
                Ellie
              </span>
            </Link>

            <nav
              aria-label="Primary"
              className="hidden md:flex items-center gap-6 text-sm"
            >
              {[
                { href: "#features", label: "Features" },
                { href: "#privacy", label: "Privacy" },
                { href: "/login?redirect=%2Fchat", label: "Chat" },
                { href: "/login?redirect=%2Fcall", label: "Call" },
              ].map((link) => (
                <motion.div key={link.href} whileHover={{ scale: 1.05 }}>
                  <Link
                    href={link.href}
                    className="text-purple-200 hover:text-white transition-colors relative group"
                  >
                    {link.label}
                    <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-purple-400 to-pink-400 group-hover:w-full transition-all duration-300" />
                  </Link>
                </motion.div>
              ))}
            </nav>
          </motion.header>

          {/* Hero */}
          <section className="max-w-6xl mx-auto mt-20 md:mt-28 grid md:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                className="inline-block mb-4 px-4 py-2 rounded-full bg-purple-500/20 border border-purple-500/30 backdrop-blur-sm"
              >
                <span className="text-sm text-purple-200">✨ Your AI Companion</span>
              </motion.div>

              <h1 className="text-5xl md:text-7xl font-bold leading-tight">
                <span className="bg-gradient-to-r from-white via-purple-200 to-pink-200 bg-clip-text text-transparent">
                  A companion
                </span>
                <br />
                <span className="text-white/70">that feels </span>
                <span className="relative inline-block">
                  <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                    real
                  </span>
                  <motion.span
                    className="absolute -bottom-2 left-0 right-0 h-1 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.8, delay: 1 }}
                  />
                </span>
              </h1>

              <p className="mt-6 text-purple-200 text-lg leading-relaxed">
                Ellie remembers what you share, adapts to your mood, and talks like a person.
                Chat by text or jump into a lifelike voice call—your choice.
              </p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="mt-8 flex flex-wrap gap-4"
              >
                <Link href="/login?redirect=%2Fchat">
                  <motion.button
                    whileHover={{
                      scale: 1.05,
                      boxShadow: "0 0 30px rgba(167, 139, 250, 0.6)",
                    }}
                    whileTap={{ scale: 0.95 }}
                    className="group relative px-8 py-4 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 font-semibold text-white shadow-xl overflow-hidden"
                  >
                    <span className="relative z-10 flex items-center gap-2">
                      💬 Open Chat
                      <motion.svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        whileHover={{ x: 5 }}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13 7l5 5m0 0l-5 5m5-5H6"
                        />
                      </motion.svg>
                    </span>
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-purple-500/20 to-pink-500/20"
                      initial={{ x: "-100%" }}
                      whileHover={{ x: "0%" }}
                      transition={{ duration: 0.3 }}
                    />
                  </motion.button>
                </Link>

                <Link href="/login?redirect=%2Fcall">
                  <motion.button
                    whileHover={{
                      scale: 1.05,
                      boxShadow: "0 0 30px rgba(236, 72, 153, 0.6)",
                    }}
                    whileTap={{ scale: 0.95 }}
                    className="px-8 py-4 rounded-2xl bg-gradient-to-r from-purple-500 to-pink-500 font-semibold text-white shadow-xl hover:from-purple-600 hover:to-pink-600 transition-all"
                    title="Works best in Chrome or Edge with a microphone"
                  >
                    <span className="flex items-center gap-2">
                      📞 Start Call
                      <motion.span
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      >
                        ✨
                      </motion.span>
                    </span>
                  </motion.button>
                </Link>
              </motion.div>

              {/* Removed: Chrome/Edge hint text below buttons */}
            </motion.div>

            {/* Right-side card */}
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="relative"
            >
              <motion.div
                whileHover={{ scale: 1.02 }}
                className="relative rounded-3xl p-8 bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl"
                role="region"
                aria-label="Ellie preview"
              >
                {/* Glow effect */}
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 blur-xl" />

                <div className="relative">
                  <div className="flex items-center gap-4">
                    <motion.div
                      animate={{
                        scale: [1, 1.05, 1],
                      }}
                      transition={{
                        duration: 3,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                      className="size-16 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 grid place-items-center text-3xl shadow-lg shadow-purple-500/50"
                      aria-hidden
                    >
                      😊
                    </motion.div>
                    <div>
                      <div className="font-bold text-xl text-white">Ellie</div>
                      <div className="text-purple-300 text-sm flex items-center gap-2">
                        <motion.span
                          animate={{ opacity: [0.5, 1, 0.5] }}
                          transition={{ duration: 2, repeat: Infinity }}
                          className="w-2 h-2 rounded-full bg-green-400"
                        />
                        Warm • Playful • Supportive
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 space-y-3">
                    {[
                      {
                        text: '"Missed you today. Tell me what you are up to?"',
                        delay: 0,
                      },
                      {
                        text: '"We should plan a cozy night soon."',
                        delay: 0.2,
                      },
                      {
                        text: '"You sounded a bit tired—want me to help you unwind?"',
                        delay: 0.4,
                      },
                    ].map((msg, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 1 + msg.delay }}
                        whileHover={{
                          x: 5,
                          backgroundColor: "rgba(255,255,255,0.1)",
                        }}
                        className="rounded-2xl bg-white/5 backdrop-blur-sm p-4 border border-white/10 transition-all cursor-pointer"
                      >
                        <div className="text-sm text-purple-100">{msg.text}</div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </motion.div>

              {/* Floating particles */}
              {Array.from({ length: 3 }).map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-2 h-2 rounded-full bg-purple-400/50"
                  style={{
                    top: `${20 + i * 30}%`,
                    right: `${-5 + i * 5}%`,
                  }}
                  animate={{
                    y: [-10, 10, -10],
                    opacity: [0.3, 0.7, 0.3],
                  }}
                  transition={{
                    duration: 3 + i,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />
              ))}
            </motion.div>
          </section>

          {/* Features */}
          <motion.section
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            id="features"
            className="max-w-6xl mx-auto mt-32"
          >
            <div className="text-center mb-12">
              <motion.h2
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-purple-200 to-pink-200 bg-clip-text text-transparent"
              >
                Why Ellie feels different
              </motion.h2>
              <motion.p
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 }}
                className="mt-4 text-purple-300"
              >
                An evolving AI connection designed to learn you deeply and feel
                more natural with every conversation.
              </motion.p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  title: "Advanced memory",
                  text: "Ellie builds a long-term picture of your stories, preferences, and boundaries, so every chat feels more personal without you repeating yourself.",
                  icon: "🧠",
                  gradient: "from-purple-500 to-blue-500",
                },
                {
                  title: "Mood-aware",
                  text: "She adapts to your tone—gentle when you&apos;re stressed, playful when you&apos;re upbeat.",
                  icon: "💞",
                  gradient: "from-pink-500 to-purple-500",
                },
                {
                  title: "Voice that feels real",
                  text: "Start a call any time for lifelike back-and-forth conversation.",
                  icon: "🎙️",
                  gradient: "from-blue-500 to-pink-500",
                },
                {
                  title: "Trained on real moments",
                  text: "Ellie is shaped by patterns from thousands of real-life style messages, so her replies feel closer to how people actually talk.",
                  icon: "💬",
                  gradient: "from-purple-500 to-pink-500",
                },
              ].map((feature, i) => (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 50 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.2 }}
                  whileHover={{ y: -10, scale: 1.02 }}
                  className="group relative rounded-3xl p-8 bg-white/5 backdrop-blur-xl border border-white/10 shadow-xl overflow-hidden"
                  role="article"
                  aria-label={feature.title}
                >
                  {/* Gradient background on hover */}
                  <motion.div
                    className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-10 transition-opacity duration-500`}
                  />

                  <div className="relative">
                    <motion.div
                      whileHover={{ scale: 1.2, rotate: 10 }}
                      className="text-5xl mb-4"
                      aria-hidden
                    >
                      {feature.icon}
                    </motion.div>
                    <h3 className="text-xl font-bold text-white mb-2">
                      {feature.title}
                    </h3>
                    <p className="text-purple-200 text-sm leading-relaxed">
                      {feature.text}
                    </p>
                  </div>

                  {/* Shine effect on hover */}
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                    initial={{ x: "-100%" }}
                    whileHover={{ x: "100%" }}
                    transition={{ duration: 0.8 }}
                  />
                </motion.div>
              ))}
            </div>
          </motion.section>

          {/* Privacy */}
          <motion.section
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            id="privacy"
            className="max-w-6xl mx-auto mt-24"
          >
            <motion.div
              whileHover={{ scale: 1.01 }}
              className="relative rounded-3xl p-8 md:p-12 bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl overflow-hidden"
            >
              {/* Background gradient */}
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-pink-500/10" />

              <div className="relative">
                <div className="flex items-center gap-3 mb-4">
                  <motion.div
                    animate={{ rotate: [0, 5, 0, -5, 0] }}
                    transition={{ duration: 5, repeat: Infinity }}
                    className="text-4xl"
                  >
                    🔒
                  </motion.div>
                  <h3 className="text-3xl font-bold text-white">
                    Privacy &amp; Safety
                  </h3>
                </div>
                <p className="text-purple-200 leading-relaxed max-w-3xl">
                  Conversations are private to you. Ellie won&apos;t answer
                  explicitly sexual requests and will steer things back to a
                  respectful tone. You can reset memory any time.
                </p>

                <div className="mt-6 flex flex-wrap gap-3">
                  {[
                    "🛡️ End-to-end encrypted",
                    "🗑️ Reset memory anytime",
                    "✨ Respectful boundaries",
                  ].map((item, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, scale: 0.8 }}
                      whileInView={{ opacity: 1, scale: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.1 }}
                      className="px-4 py-2 rounded-full bg-white/5 backdrop-blur-sm border border-white/10 text-sm text-purple-200"
                    >
                      {item}
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          </motion.section>

          {/* CTA Section */}
          <motion.section
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="max-w-4xl mx-auto mt-24 text-center"
          >
            <div className="relative rounded-3xl p-12 bg-gradient-to-br from-purple-500/20 to-pink-500/20 backdrop-blur-xl border border-white/20 shadow-2xl overflow-hidden">
              <motion.div
                className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-pink-500/10"
                animate={{
                  opacity: [0.3, 0.6, 0.3],
                }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />

              <div className="relative">
                <h2 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-white to-purple-200 bg-clip-text text-transparent mb-4">
                  Ready to meet Ellie?
                </h2>
                <p className="text-purple-200 text-lg mb-8">
                  Start chatting or have a voice conversation right now
                </p>

                <div className="flex flex-wrap gap-4 justify-center">
                  <Link href="/login?redirect=%2Fchat">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="px-8 py-4 rounded-2xl bg-white text-purple-900 font-bold shadow-xl hover:shadow-2xl transition-all"
                    >
                      Get Started Free
                    </motion.button>
                  </Link>
                </div>
              </div>
            </div>
          </motion.section>

          {/* Footer */}
          <motion.footer
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="max-w-6xl mx-auto py-12 mt-24 text-center text-sm text-purple-300 space-y-4 border-t border-white/10"
            role="contentinfo"
          >
            <div>© {new Date().getFullYear()} Ellie — Your AI Companion</div>

            <div className="flex justify-center gap-6">
              {[
                { href: "/legal/privacy", label: "Privacy Policy" },
                { href: "/legal/terms", label: "Terms of Service" },
              ].map((link) => (
                <motion.a
                  key={link.href}
                  href={link.href}
                  whileHover={{ scale: 1.05, color: "#ffffff" }}
                  className="hover:text-white transition-colors"
                >
                  {link.label}
                </motion.a>
              ))}
            </div>

            <motion.div
              className="flex items-center justify-center gap-2 text-xs text-purple-400"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              <span>Made with</span>
              <motion.span
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              >
                💜
              </motion.span>
              <span>for meaningful connections</span>
            </motion.div>
          </motion.footer>
        </main>
      </div>
    </>
  );
}
