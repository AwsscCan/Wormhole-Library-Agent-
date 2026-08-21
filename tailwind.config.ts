import type { Config } from "tailwindcss";

/**
 * 设计系统（队友01）— cinematic futuristic library
 * 背景墨蓝黑 / 象牙白文字 / 电青虫洞 / 铜金馆藏 / 少量玫红
 * 禁：大面积紫蓝渐变、玻璃拟态、廉价霓虹
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#0A0E16",
          panel: "#0E141F",
          raise: "#131A29",
          border: "#1C2740",
          edge: "#2A3A5C",
        },
        ivory: "#EDEFF4",
        steel: {
          DEFAULT: "#8B98AE",
          dim: "#5C6A82",
        },
        pulse: {
          DEFAULT: "#33D6E2",
          dim: "#17919E",
          faint: "#0E3A44",
        },
        copper: {
          DEFAULT: "#D9A050",
          dim: "#93662C",
          faint: "#3A2C14",
        },
        rosewood: {
          DEFAULT: "#E5484D",
          dim: "#8C2F33",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "Segoe UI",
          "PingFang SC",
          "Microsoft YaHei",
          "sans-serif",
        ],
        display: ["Georgia", "Constantia", "STSong", "SimSun", "serif"],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "Liberation Mono",
          "monospace",
        ],
      },
      boxShadow: {
        hair: "inset 0 0 0 1px rgba(237,239,244,0.03)",
        "glow-cyan": "0 0 16px rgba(51,214,226,0.15)",
        "glow-cyan-sm": "0 0 8px rgba(51,214,226,0.3)",
        "glow-copper": "0 0 14px rgba(217,160,80,0.14)",
      },
      keyframes: {
        "pulse-dot": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
        "scan-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "pulse-dot": "pulse-dot 2.4s ease-in-out infinite",
        "scan-in": "scan-in 0.35s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
