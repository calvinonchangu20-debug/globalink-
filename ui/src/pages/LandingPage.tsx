import { useState, useEffect, useRef } from "react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/AuthContext"
import { useTheme } from "@/components/theme-provider"
import {
  Sparkles,
  ArrowRight,
  Zap,
  Smartphone,
  ChevronDown,
  Sun,
  Moon,
  Activity,
  BarChart3,
  CheckCircle2,
  RefreshCw,
  Menu,
  X
} from "lucide-react"

type ScannerCategory = "even_odd" | "match_differ" | "over_under"

interface ScanResultItem {
  market: string
  edgeScore: string
  prediction: string
  condition: string
  description: string
  statA: string
  statB: string
}

// Static market ticker items
const TICKER_ITEMS = [
  { symbol: "1HZ100V", name: "Vol 100 (1s)", price: "1,429.35", change: "+2.4%" },
  { symbol: "1HZ10V", name: "Vol 10 (1s)", price: "3,892.10", change: "+0.8%" },
  { symbol: "1HZ25V", name: "Vol 25 (1s)", price: "2,104.75", change: "-0.5%" },
  { symbol: "1HZ50V", name: "Vol 50 (1s)", price: "748.20", change: "+1.9%" },
  { symbol: "1HZ75V", name: "Vol 75 (1s)", price: "984.60", change: "+3.1%" },
  { symbol: "1HZ150V", name: "Vol 150 (1s)", price: "4,612.80", change: "-1.2%" },
  { symbol: "1HZ250V", name: "Vol 250 (1s)", price: "1,209.45", change: "+4.2%" },
  { symbol: "R_100", name: "Vol 100", price: "2,840.15", change: "+1.5%" },
]

// Scanner simulation data
const SCAN_DATA: Record<ScannerCategory, ScanResultItem> = {
  even_odd: {
    market: "Volatility 100 (1s)",
    edgeScore: "94.8%",
    prediction: "Even",
    condition: "Mean-Reversion Signal",
    description: "5 consecutive Odds detected. High mean-reversion edge on 1-tick expiry.",
    statA: "Even Ratio: 51%",
    statB: "Odd Streak: 5 Ticks",
  },
  match_differ: {
    market: "Volatility 75 (1s)",
    edgeScore: "96.4%",
    prediction: "Differ 4",
    condition: "Cold Digit Distribution",
    description: "Digit '4' cold at 1.0% (expected 10%). 96.4% statistical Differ edge.",
    statA: "Cold Digit: 4 (1%)",
    statB: "Differ Edge: 90%+",
  },
  over_under: {
    market: "Volatility 250 (1s)",
    edgeScore: "93.6%",
    prediction: "Under 7",
    condition: "Low-Digit Cluster Density",
    description: "Heavy low-digit skew: 74% of ticks ≤ 4. High-probability setup on Under 7.",
    statA: "Under 7 Freq: 82%",
    statB: "Density: 0.74",
  },
}

// 10-digit distribution sample
const DIGIT_FREQUENCIES = [
  { digit: 0, pct: 10 },
  { digit: 1, pct: 14 },
  { digit: 2, pct: 11 },
  { digit: 3, pct: 9 },
  { digit: 4, pct: 2, cold: true },
  { digit: 5, pct: 12 },
  { digit: 6, pct: 11 },
  { digit: 7, pct: 16, hot: true },
  { digit: 8, pct: 8 },
  { digit: 9, pct: 7 },
]

const SCANNER_TABS: { id: ScannerCategory; label: string; short: string }[] = [
  { id: "even_odd", label: "Even / Odd", short: "Even/Odd" },
  { id: "match_differ", label: "Matches / Differs", short: "Differs" },
  { id: "over_under", label: "Over / Under", short: "Over/Under" },
]

const FAQ_ITEMS = [
  {
    q: "What are synthetic indices?",
    a: "Simulated financial markets that mimic real volatility 24/7/365 with cryptographically audited randomness and zero weekend closures.",
  },
  {
    q: "How does the AI Scanner work?",
    a: "It continuously analyzes rolling 100-tick windows across volatility indices to pinpoint streaks, digit frequency imbalances, and high-probability entry edges.",
  },
  {
    q: "How fast are M-Pesa deposits and withdrawals?",
    a: "STK Push deposits take under 10 seconds. Automated B2C disbursements transfer directly to your phone instantly.",
  },
  {
    q: "Can I practice with a demo account first?",
    a: "Yes. Every account includes a rechargeable $10,000 USD virtual balance to practice strategies risk-free.",
  },
]

export default function LandingPage() {
  const { user } = useAuth()
  const { theme, setTheme } = useTheme()

  const [selectedTab, setSelectedTab] = useState<ScannerCategory>("even_odd")
  const [isScanning, setIsScanning] = useState(false)
  const [activeFaq, setActiveFaq] = useState<number | null>(null)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handleTabChange = (tab: ScannerCategory) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setIsScanning(true)
    setSelectedTab(tab)
    timerRef.current = setTimeout(() => {
      setIsScanning(false)
    }, 400)
  }

  const currentResult = SCAN_DATA[selectedTab]

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-primary/20 selection:text-primary overflow-x-hidden">
      {/* ─── Top Navigation Bar ────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Logo & Brand */}
          <Link to="/" className="flex items-center gap-2.5 group shrink-0">
            <img 
              src="/branding/logo-mark.svg" 
              alt="GlobalLink Logo" 
              className="h-8 w-8 rounded-lg shadow-sm object-contain shrink-0 transition-transform group-hover:scale-105" 
            />
            <div className="flex flex-col leading-none">
              <div className="flex items-center gap-1.5">
                <span className="font-black text-base sm:text-lg tracking-tight bg-gradient-to-r from-foreground via-foreground to-primary bg-clip-text text-transparent">
                  GLOBAL<span className="text-primary">LINK</span>
                </span>
              </div>
              <span className="text-[9px] uppercase font-bold tracking-widest text-muted-foreground mt-0.5">Trading</span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <a href="#scanner" className="hover:text-foreground transition-colors">
              AI Scanner
            </a>
            <a href="#features" className="hover:text-foreground transition-colors">
              Features
            </a>
            <a href="#mpesa" className="hover:text-foreground transition-colors">
              M-Pesa
            </a>
            <a href="#faq" className="hover:text-foreground transition-colors">
              FAQ
            </a>
          </nav>

          {/* Action CTAs */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 sm:h-9 sm:w-9 text-muted-foreground hover:text-foreground"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>

            {user ? (
              <Link to="/trade">
                <Button size="sm" className="h-8 sm:h-9 px-3 text-xs sm:text-sm bg-primary hover:bg-primary/90 text-primary-foreground font-semibold gap-1.5 shadow-sm">
                  <span>Terminal</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            ) : (
              <>
                <Link to="/login" className="hidden sm:inline-flex">
                  <Button variant="ghost" size="sm" className="h-9 text-xs sm:text-sm font-semibold">
                    Sign In
                  </Button>
                </Link>
                <Link to="/register" className="hidden sm:inline-flex">
                  <Button size="sm" className="h-9 bg-primary hover:bg-primary/90 text-primary-foreground text-xs sm:text-sm font-semibold shadow-sm">
                    Open Account
                  </Button>
                </Link>
                <Link to="/register" className="sm:hidden inline-flex">
                  <Button size="sm" className="h-8 px-2.5 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-sm">
                    Start Free
                  </Button>
                </Link>
              </>
            )}

            {/* Mobile Hamburger Toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Toggle menu"
              aria-expanded={isMobileMenuOpen}
            >
              {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile Dropdown Drawer */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-b border-border bg-background/95 backdrop-blur-lg px-4 py-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
            <nav className="flex flex-col space-y-1 text-sm font-medium">
              <a
                href="#scanner"
                onClick={() => setIsMobileMenuOpen(false)}
                className="px-3 py-2 rounded-lg hover:bg-muted transition-colors flex items-center justify-between"
              >
                <span>AI Market Scanner</span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              </a>
              <a
                href="#features"
                onClick={() => setIsMobileMenuOpen(false)}
                className="px-3 py-2 rounded-lg hover:bg-muted transition-colors flex items-center justify-between"
              >
                <span>Features</span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              </a>
              <a
                href="#mpesa"
                onClick={() => setIsMobileMenuOpen(false)}
                className="px-3 py-2 rounded-lg hover:bg-muted transition-colors flex items-center justify-between"
              >
                <span>Instant M-Pesa</span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              </a>
              <a
                href="#faq"
                onClick={() => setIsMobileMenuOpen(false)}
                className="px-3 py-2 rounded-lg hover:bg-muted transition-colors flex items-center justify-between"
              >
                <span>FAQ</span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              </a>
            </nav>

            {!user && (
              <div className="pt-3 border-t border-border flex flex-col gap-2">
                <Link to="/register" onClick={() => setIsMobileMenuOpen(false)}>
                  <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold h-10 shadow-sm">
                    Open Free Account ($10k Demo)
                  </Button>
                </Link>
                <Link to="/login" onClick={() => setIsMobileMenuOpen(false)}>
                  <Button variant="outline" className="w-full h-10 font-semibold">
                    Sign In
                  </Button>
                </Link>
              </div>
            )}
          </div>
        )}
      </header>

      {/* ─── Hero Section ──────────────────────────────────────────────── */}
      <section className="relative pt-10 pb-14 md:pt-18 md:pb-20 overflow-hidden border-b border-border">
        {/* Subtle Ambient Glow */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[320px] bg-primary/10 blur-3xl pointer-events-none -z-10 rounded-full" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            {/* Hero Left Column */}
            <div className="lg:col-span-6 space-y-5 text-center lg:text-left">

              {/* Main Headline */}
              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[1.15] sm:leading-[1.1]">
                Trade Synthetic indices with{" "}
                <span className="text-primary">
                  Algorithmic Edge.
                </span>
              </h1>

              {/* Concise Subtitle */}
              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-xl mx-auto lg:mx-0">
                Stop guessing binary outcomes. Our deep scanner monitors tick patterns across 13+ Volatility indices to pinpoint statistical entry edges before you place a trade.
              </p>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3 pt-1">
                <Link to="/register" className="w-full sm:w-auto">
                  <Button size="lg" className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground font-bold h-11 px-6 gap-2 shadow-md shadow-primary/20">
                    <Zap className="h-4 w-4" />
                    <span>Launch Free Demo</span>
                  </Button>
                </Link>
                <a href="#scanner" className="w-full sm:w-auto">
                  <Button size="lg" variant="outline" className="w-full sm:w-auto h-11 px-5 font-semibold">
                    <span>Explore Scanner</span>
                  </Button>
                </a>
              </div>

              {/* Trust Indicators */}
              <div className="pt-4 grid grid-cols-3 gap-3 border-t border-border/60 text-center sm:text-left">
                <div>
                  <div className="font-extrabold text-lg sm:text-xl text-foreground font-mono">1-Sec</div>
                  <div className="text-[11px] sm:text-xs text-muted-foreground">Tick Speed</div>
                </div>
                <div>
                  <div className="font-extrabold text-lg sm:text-xl text-primary font-mono">Instant</div>
                  <div className="text-[11px] sm:text-xs text-muted-foreground">M-Pesa Cashouts</div>
                </div>
                <div>
                  <div className="font-extrabold text-lg sm:text-xl text-foreground font-mono">24/7/365</div>
                  <div className="text-[11px] sm:text-xs text-muted-foreground">Always Open</div>
                </div>
              </div>
            </div>

            {/* Hero Right Column (Live Scanner Preview) */}
            <div id="scanner" className="lg:col-span-6">
              <div className="bg-card text-card-foreground border border-border rounded-2xl shadow-xl p-4 sm:p-5 overflow-hidden font-sans relative">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-border pb-3 mb-3.5 gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-xs shrink-0">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-xs sm:text-sm text-foreground flex items-center gap-1.5">
                        <span className="truncate">Live Market Scanner</span>
                        <span className="inline-flex items-center gap-1 text-[9px] text-primary font-medium px-1.5 py-0.2 rounded-full bg-primary/10 border border-primary/20 shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                          LIVE
                        </span>
                      </div>
                      <div className="text-[10px] sm:text-[11px] text-muted-foreground truncate">13 Synthetic Indices Monitored</div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isScanning}
                    onClick={() => handleTabChange(selectedTab)}
                    className="h-8 px-2 sm:px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 sm:mr-1.5 ${isScanning ? "animate-spin" : ""}`} />
                    <span className="hidden sm:inline">Rescan</span>
                  </Button>
                </div>

                {/* Category Tabs */}
                <div className="grid grid-cols-3 gap-1 bg-muted p-1 rounded-xl border border-border mb-3.5" role="tablist">
                  {SCANNER_TABS.map((tab) => (
                    <button
                      key={tab.id}
                      role="tab"
                      aria-selected={selectedTab === tab.id}
                      onClick={() => handleTabChange(tab.id)}
                      className={`py-1.5 px-1 text-xs font-semibold rounded-lg transition-all text-center truncate ${
                        selectedTab === tab.id
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground hover:bg-background/60"
                      }`}
                    >
                      <span className="sm:hidden">{tab.short}</span>
                      <span className="hidden sm:inline">{tab.label}</span>
                    </button>
                  ))}
                </div>

                {/* Simulated Results */}
                {isScanning ? (
                  <div className="py-10 text-center space-y-2.5">
                    <RefreshCw className="h-7 w-7 animate-spin text-primary mx-auto" />
                    <p className="text-xs text-muted-foreground">Scanning 100-tick distributions...</p>
                  </div>
                ) : (
                  <div className="space-y-3 animate-in fade-in duration-200">
                    {/* Top Scored Banner */}
                    <div className="bg-primary/10 border border-primary/25 rounded-xl p-3 flex items-start justify-between gap-2">
                      <div className="space-y-0.5 min-w-0">
                        <span className="text-[9px] text-primary uppercase font-bold tracking-wider block">
                          Top Edge Market
                        </span>
                        <div className="font-bold text-foreground text-sm sm:text-base truncate">{currentResult.market}</div>
                        <span className="text-[11px] text-muted-foreground block">{currentResult.condition}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[9px] text-muted-foreground uppercase font-bold block">Edge Score</span>
                        <span className="font-extrabold text-base sm:text-lg text-primary font-mono">
                          {currentResult.edgeScore}
                        </span>
                      </div>
                    </div>

                    {/* Entry Details */}
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="bg-muted/40 border border-border rounded-xl p-2.5">
                        <span className="text-[9px] text-muted-foreground uppercase font-bold block">Suggested Entry</span>
                        <div className="font-extrabold text-sm text-foreground mt-0.5">{currentResult.prediction}</div>
                        <div className="text-[10px] text-primary font-medium mt-0.5">High Conviction</div>
                      </div>
                      <div className="bg-muted/40 border border-border rounded-xl p-2.5">
                        <span className="text-[9px] text-muted-foreground uppercase font-bold block">Key Metric</span>
                        <div className="font-bold text-xs text-foreground mt-0.5 truncate">{currentResult.statA}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{currentResult.statB}</div>
                      </div>
                    </div>

                    {/* Description Box */}
                    <div className="bg-muted/20 border border-border rounded-xl p-2.5 text-xs text-muted-foreground leading-relaxed">
                      {currentResult.description}
                    </div>

                    {/* Action Button */}
                    <Link to="/register">
                      <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold h-10 rounded-xl gap-1.5 shadow-sm">
                        <span>Trade This Setup on Demo ($10k)</span>
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Ticker Bar ─────────────────────────────────────────────────── */}
      <div className="border-b border-border bg-muted/40 py-2 overflow-x-auto no-scrollbar w-full select-none">
        <div className="flex items-center gap-6 px-4 text-xs font-mono w-max">
          {TICKER_ITEMS.concat(TICKER_ITEMS).map((item, idx) => (
            <div key={idx} className="flex items-center gap-2 shrink-0">
              <span className="font-bold text-foreground">{item.name}:</span>
              <span className="text-muted-foreground">{item.price}</span>
              <span className={item.change.startsWith("+") ? "text-primary font-semibold" : "text-destructive font-semibold"}>
                {item.change}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ─── 3 Feature Pillars ─────────────────────────────────────────── */}
      <section id="features" className="py-12 md:py-20 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-xl mx-auto mb-10 space-y-2">
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
              Built for Systematic Edge
            </h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Sub-second tick execution, deep probability scanning, and instant local payouts.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
            {/* Pillar 1 */}
            <div className="bg-card border border-border rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4 border border-primary/20">
                <Sparkles className="h-5 w-5" />
              </div>
              <h3 className="text-base sm:text-lg font-bold mb-1.5">Real-Time AI Scanner</h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Monitors streaks, digit frequencies, and density skews across 13+ indices to surface high-probability setups.
              </p>
            </div>

            {/* Pillar 2 */}
            <div className="bg-card border border-border rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow" id="mpesa">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4 border border-primary/20">
                <Smartphone className="h-5 w-5" />
              </div>
              <h3 className="text-base sm:text-lg font-bold mb-1.5">Instant M-Pesa Payouts</h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Seamless STK push deposits and direct automated B2C withdrawals sent directly back to your mobile wallet.
              </p>
            </div>

            {/* Pillar 3 */}
            <div className="bg-card border border-border rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4 border border-primary/20">
                <Activity className="h-5 w-5" />
              </div>
              <h3 className="text-base sm:text-lg font-bold mb-1.5">Sub-Second Execution</h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Direct WebSocket connection to Deriv liquidity feeds. 1-tick settlement duration with zero broker requotes.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Digit Distribution Showcase ───────────────────────────────── */}
      <section className="py-12 md:py-20 border-b border-border bg-muted/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left Copy */}
            <div className="lg:col-span-5 space-y-3.5 text-center lg:text-left">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold">
                <BarChart3 className="h-3.5 w-3.5" />
                <span>Digit Distribution Science</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
                Trade the Probabilities
              </h2>
              <p className="text-muted-foreground text-xs sm:text-sm leading-relaxed">
                Every digit has an expected 10% frequency. When a digit drops under 2%, Differ contracts offer statistical win rates exceeding 95%.
              </p>
              <div className="space-y-2 pt-1 text-left">
                <div className="flex items-center gap-2 text-xs sm:text-sm">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  <span>Rolling 100-tick window frequency analyzer</span>
                </div>
                <div className="flex items-center gap-2 text-xs sm:text-sm">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  <span>Automatic hot and cold digit anomaly detection</span>
                </div>
                <div className="flex items-center gap-2 text-xs sm:text-sm">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  <span>Direct one-click execution into the terminal</span>
                </div>
              </div>
            </div>

            {/* Right Card */}
            <div className="lg:col-span-7">
              <div className="bg-card border border-border rounded-2xl p-4 sm:p-5 shadow-xl space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="font-bold text-xs sm:text-sm truncate">Last 100 Ticks Frequency Analyzer</h4>
                    <span className="text-[11px] text-muted-foreground">Market: Volatility 100 (1s)</span>
                  </div>
                  <span className="text-[10px] font-mono font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded border border-primary/20 shrink-0">
                    Live Stream
                  </span>
                </div>

                {/* 10 Digit Distribution Grid */}
                <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5 select-none">
                  {DIGIT_FREQUENCIES.map((d) => (
                    <div
                      key={d.digit}
                      className={`p-2 rounded-xl border flex flex-col items-center justify-center transition-all ${
                        d.cold
                          ? "bg-primary/15 border-primary text-primary font-bold ring-2 ring-primary/20"
                          : d.hot
                          ? "bg-accent border-accent text-accent-foreground font-bold"
                          : "bg-muted/40 border-border text-foreground"
                      }`}
                    >
                      <span className="text-base font-black font-mono">{d.digit}</span>
                      <span className="text-[10px] mt-0.5 font-mono font-semibold">{d.pct}%</span>
                      {d.cold && <span className="text-[8px] uppercase font-bold text-primary mt-0.5">Cold</span>}
                      {d.hot && <span className="text-[8px] uppercase font-bold text-accent-foreground mt-0.5">Hot</span>}
                    </div>
                  ))}
                </div>

                {/* Recommendation Banner */}
                <div className="bg-primary/10 border border-primary/20 rounded-xl p-3 text-xs text-foreground flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <span className="leading-snug">
                    💡 <strong>Recommendation:</strong> Differ 4 (1% frequency offers optimal Differ win-rate).
                  </span>
                  <Link to="/register" className="shrink-0">
                    <Button size="sm" className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground text-xs h-7 px-3">
                      Trade Differ 4
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── FAQ Section ────────────────────────────────────────────────── */}
      <section id="faq" className="py-12 md:py-20 border-b border-border bg-muted/10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-8 sm:mb-10 space-y-1.5">
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight">Frequently Asked Questions</h2>
            <p className="text-xs sm:text-sm text-muted-foreground">Quick answers to common questions.</p>
          </div>

          <div className="space-y-2.5">
            {FAQ_ITEMS.map((faq, i) => {
              const isOpen = activeFaq === i
              return (
                <div
                  key={i}
                  role="button"
                  tabIndex={0}
                  aria-expanded={isOpen}
                  onClick={() => setActiveFaq(isOpen ? null : i)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      setActiveFaq(isOpen ? null : i)
                    }
                  }}
                  className="bg-card border border-border rounded-xl overflow-hidden transition-colors cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <div className="p-3.5 sm:p-4 flex items-center justify-between font-semibold text-xs sm:text-sm">
                    <span>{faq.q}</span>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </div>
                  {isOpen && (
                    <div className="px-3.5 sm:px-4 pb-3.5 sm:pb-4 text-xs sm:text-sm text-muted-foreground leading-relaxed border-t border-border pt-2.5">
                      {faq.a}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ─── Bottom Call to Action Banner ──────────────────────────────── */}
      <section className="py-14 sm:py-18 relative overflow-hidden">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center space-y-5">
          <div className="flex justify-center mb-1">
            <img 
              src="/branding/logo-mark.svg" 
              alt="GlobalLink Logo" 
              className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl shadow-lg object-contain ring-4 ring-primary/20" 
            />
          </div>

          <h2 className="text-2xl sm:text-4xl font-black tracking-tight max-w-xl mx-auto">
            Ready to Trade with Statistical Edge?
          </h2>

          <p className="text-muted-foreground text-xs sm:text-sm max-w-md mx-auto">
            Experience real-time AI entry scanning with instant M-Pesa disbursements.
          </p>

          <div className="pt-1 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to="/register" className="w-full sm:w-auto">
              <Button size="lg" className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground font-bold h-11 px-7 shadow-md shadow-primary/20 gap-2">
                <span>Create Account ($10k Demo)</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/login" className="w-full sm:w-auto">
              <Button size="lg" variant="outline" className="w-full sm:w-auto h-11 px-6 font-semibold">
                Sign In
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Footer ────────────────────────────────────────────────────── */}
      <footer className="border-t border-border py-8 bg-muted/20 text-xs text-muted-foreground">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div className="flex items-center gap-2.5">
            <img 
              src="/branding/logo-mark.svg" 
              alt="GlobalLink Logo" 
              className="w-6 h-6 rounded-md shadow-xs object-contain" 
            />
            <span className="font-bold text-foreground">GlobalLink Trading</span>
            <span>• © {new Date().getFullYear()} All rights reserved.</span>
          </div>

          <div className="flex items-center justify-center gap-6">
            <Link to="/login" className="hover:text-foreground transition-colors">
              Terminal
            </Link>
            <a href="#scanner" className="hover:text-foreground transition-colors">
              Scanner
            </a>
            <a href="#faq" className="hover:text-foreground transition-colors">
              FAQ
            </a>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 mt-5 pt-5 border-t border-border/40 text-[11px] leading-relaxed text-muted-foreground/80 text-center sm:text-left">
          <strong>Risk Warning:</strong> Trading synthetic indices carries financial risk. Past statistical probability does not guarantee future results. Trade responsibly.
        </div>
      </footer>
    </div>
  )
}
