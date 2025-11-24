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
            </motion.div>

            {/* iPhone Mockup */}
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="relative flex justify-center"
            >
              {/* Glow effect behind phone */}
              <div className="absolute inset-0 flex justify-center items-center">
                <div className="w-64 h-96 bg-gradient-to-br from-purple-500/40 to-pink-500/40 blur-3xl rounded-full" />
              </div>

              {/* iPhone Frame */}
              <motion.div
                whileHover={{ scale: 1.02, rotateY: 5 }}
                transition={{ type: "spring", stiffness: 300 }}
                className="relative"
                style={{ perspective: "1000px" }}
              >
                {/* Phone outer frame */}
                <div className="relative w-[280px] h-[580px] bg-gradient-to-b from-gray-800 to-gray-900 rounded-[50px] p-[3px] shadow-2xl shadow-purple-500/30">
                  {/* Phone inner bezel */}
                  <div className="w-full h-full bg-black rounded-[47px] p-[10px] relative overflow-hidden">
                    {/* Dynamic Island / Notch */}
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 w-28 h-7 bg-black rounded-full z-20 flex items-center justify-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-gray-800" />
                      <div className="w-3 h-3 rounded-full bg-gray-800 ring-1 ring-gray-700" />
                    </div>

                    {/* Screen */}
                    <div className="w-full h-full bg-gradient-to-b from-purple-950 via-purple-900 to-slate-900 rounded-[37px] overflow-hidden relative">
                      {/* Status bar */}
                      <div className="h-12 flex items-end justify-between px-6 pb-1 text-white text-xs">
                        <span className="font-medium">9:41</span>
                        <div className="flex items-center gap-1">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 3C8.5 3 5.5 4.5 3.5 7L2 5.5C4.5 3 8 1 12 1s7.5 2 10 4.5L20.5 7c-2-2.5-5-4-8.5-4z" opacity="0.3"/>
                            <path d="M12 7c-2.5 0-4.5 1-6 2.5L4.5 8C6.5 6 9 5 12 5s5.5 1 7.5 3L18 9.5C16.5 8 14.5 7 12 7z" opacity="0.5"/>
                            <path d="M12 11c-1.5 0-2.5.5-3.5 1.5L7 11c1.5-1.5 3-2 5-2s3.5.5 5 2l-1.5 1.5c-1-1-2-1.5-3.5-1.5z" opacity="0.7"/>
                            <path d="M12 15c-.5 0-1 .2-1.5.5L9 14c1-.8 2-1 3-1s2 .2 3 1l-1.5 1.5c-.5-.3-1-.5-1.5-.5z"/>
                          </svg>
                          <svg className="w-6 h-3" fill="currentColor" viewBox="0 0 24 12">
                            <rect x="0" y="1" width="20" height="10" rx="2" stroke="currentColor" strokeWidth="1" fill="none"/>
                            <rect x="2" y="3" width="14" height="6" rx="1" fill="currentColor"/>
                            <rect x="21" y="4" width="2" height="4" rx="0.5" fill="currentColor" opacity="0.5"/>
                          </svg>
                        </div>
                      </div>

                      {/* Chat Header */}
                      <div className="px-4 py-3 flex items-center gap-3 border-b border-white/10">
                        <motion.div
                          animate={{ scale: [1, 1.05, 1] }}
                          transition={{ duration: 3, repeat: Infinity }}
                          className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-lg shadow-lg"
                        >
                          😊
                        </motion.div>
                        <div className="flex-1">
                          <div className="font-semibold text-white text-sm">Ellie</div>
                          <div className="flex items-center gap-1.5 text-xs text-purple-300">
                            <motion.span
                              animate={{ opacity: [0.5, 1, 0.5] }}
                              transition={{ duration: 2, repeat: Infinity }}
                              className="w-1.5 h-1.5 rounded-full bg-green-400"
                            />
                            Online
                          </div>
                        </div>
                        <div className="flex gap-3 text-purple-300">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </div>
                      </div>

                      {/* Chat Messages */}
                      <div className="flex-1 px-3 py-4 space-y-3 overflow-hidden">
                        {/* Ellie's messages */}
                        <motion.div
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.8 }}
                          className="flex gap-2"
                        >
                          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-xs flex-shrink-0 mt-1">
                            😊
                          </div>
                          <div className="bg-white/10 backdrop-blur-sm rounded-2xl rounded-tl-sm px-3 py-2 max-w-[80%]">
                            <p className="text-white text-xs">Hey! I missed you today 💕</p>
                            <p className="text-purple-400 text-[10px] mt-1">9:38 AM</p>
                          </div>
                        </motion.div>

                        <motion.div
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 1.0 }}
                          className="flex gap-2"
                        >
                          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-xs flex-shrink-0 mt-1">
                            😊
                          </div>
                          <div className="bg-white/10 backdrop-blur-sm rounded-2xl rounded-tl-sm px-3 py-2 max-w-[80%]">
                            <p className="text-white text-xs">How was your morning? ☕</p>
                            <p className="text-purple-400 text-[10px] mt-1">9:38 AM</p>
                          </div>
                        </motion.div>

                        {/* User message */}
                        <motion.div
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 1.2 }}
                          className="flex justify-end"
                        >
                          <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl rounded-tr-sm px-3 py-2 max-w-[80%]">
                            <p className="text-white text-xs">It was good! Just got coffee ☕</p>
                            <p className="text-white/70 text-[10px] mt-1">9:40 AM</p>
                          </div>
                        </motion.div>

                        {/* Ellie typing indicator */}
                        <motion.div
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 1.4 }}
                          className="flex gap-2"
                        >
                          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-xs flex-shrink-0 mt-1">
                            😊
                          </div>
                          <div className="bg-white/10 backdrop-blur-sm rounded-2xl rounded-tl-sm px-3 py-2 max-w-[80%]">
                            <p className="text-white text-xs">Ooh nice! We should plan a cozy night soon 🌙</p>
                            <p className="text-purple-400 text-[10px] mt-1">9:41 AM</p>
                          </div>
                        </motion.div>

                        {/* Typing indicator */}
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 1.8 }}
                          className="flex gap-2"
                        >
                          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-xs flex-shrink-0 mt-1">
                            😊
                          </div>
                          <div className="bg-white/10 backdrop-blur-sm rounded-2xl rounded-tl-sm px-3 py-2.5">
                            <div className="flex gap-1">
                              <motion.div
                                animate={{ y: [0, -3, 0] }}
                                transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
                                className="w-1.5 h-1.5 bg-purple-400 rounded-full"
                              />
                              <motion.div
                                animate={{ y: [0, -3, 0] }}
                                transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
                                className="w-1.5 h-1.5 bg-purple-400 rounded-full"
                              />
                              <motion.div
                                animate={{ y: [0, -3, 0] }}
                                transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
                                className="w-1.5 h-1.5 bg-purple-400 rounded-full"
                              />
                            </div>
                          </div>
                        </motion.div>
                      </div>

                      {/* Message Input */}
                      <div className="absolute bottom-0 left-0 right-0 p-3 bg-black/50 backdrop-blur-lg">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-white/10 rounded-full px-4 py-2 flex items-center">
                            <span className="text-purple-300 text-xs">Message...</span>
                          </div>
                          <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center">
                            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                            </svg>
                          </div>
                        </div>
                        {/* Home indicator */}
                        <div className="mt-2 flex justify-center">
                          <div className="w-32 h-1 bg-white/30 rounded-full" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Reflection effect */}
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/10 rounded-[50px] pointer-events-none" />
              </motion.div>

              {/* Floating particles */}
              {Array.from({ length: 5 }).map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-2 h-2 rounded-full bg-purple-400/50"
                  style={{
                    top: `${10 + i * 20}%`,
                    right: `${10 + i * 8}%`,
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
                  text: "Powered by vector embeddings and semantic search. Ellie understands context and recalls relevant memories intelligently—making every conversation naturally connected.",
                  icon: "🧠",
                  gradient: "from-purple-500 to-blue-500",
                },
                {
                  title: "Mood-aware",
                  text: "She adapts to your tone—gentle when you are stressed, playful when you are upbeat.",
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
                  Conversations are private to you. Ellie is built for adults and can
                  include explicit and sexual themes when you choose to engage that way.
                  Messages are stored securely and linked only to anonymous user IDs,
                  not directly to your personal details. You can reset chat history any time.
                </p>

                <div className="mt-6 flex flex-wrap gap-3">
                  {[
                    "🗑️ Reset chat history anytime",
                    "🕶️ Anonymous user IDs",
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