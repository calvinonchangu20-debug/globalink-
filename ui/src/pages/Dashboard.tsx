import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { useTheme } from "@/components/theme-provider"
import { Chart, type ChartHandle } from "@/components/chart"
import { DigitStats } from "@/components/digit-stats"
import { VOLATILITY_SYMBOLS, DEFAULT_SYMBOL, type ChartStyle } from "@/config"
import { Sun, Moon, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, LogOut, ShieldCheck, Volume2, Bell, Grid, Target, ArrowUpDown, TrendingUp, Sparkles, Clock, User } from "lucide-react"
import { Link } from "react-router-dom"
import { useLivePrice } from "@/hooks/use-live-price"
import { useAuth } from "@/contexts/AuthContext"
import { useTrades } from "@/hooks/use-trades"
import { WalletPanel, BalanceBadge, DepositButton, WithdrawButton } from "@/components/wallet-panel"
import { TradingPanel, type ContractCategory } from "@/components/trading-panel"
import { PositionsPanel } from "@/components/positions-panel"
import { EntryScannerModal } from "@/components/entry-scanner-modal"

export default function Dashboard() {
  const { user, logout } = useAuth()
  const { openTrades, closedTrades } = useTrades()
  const { theme, setTheme } = useTheme()
  const [symbol, setSymbol] = useState(DEFAULT_SYMBOL)
  const [chartStyle, setChartStyle] = useState<ChartStyle>("area")
  const [leftTab, setLeftTab] = useState<"open" | "closed" | "transactions">("open")
  const [category, setCategory] = useState<ContractCategory>("even_odd")
  const [isScannerOpen, setIsScannerOpen] = useState(false)
  // const [showBanner, setShowBanner] = useState(true)
  const [mobileNav, setMobileNav] = useState<"trade" | "ai" | "positions">("trade")
  const chartRef = useRef<ChartHandle>(null)

  // Panel state
  const [isLeftOpen, setIsLeftOpen] = useState(false)
  const [isRightOpen, setIsRightOpen] = useState(false)

  // Auto-open panels on larger screens
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsLeftOpen(true)
        setIsRightOpen(true)
      } else {
        setIsLeftOpen(false)
        setIsRightOpen(false)
      }
    }
    handleResize() // init
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const currentSymbol = VOLATILITY_SYMBOLS.find((s) => s.symbol === symbol)
  const { price, prevPrice, percentageChange } = useLivePrice(symbol)

  // Price direction indicator
  const isUp = price !== null && prevPrice !== null && price > prevPrice
  const isDown = price !== null && prevPrice !== null && price < prevPrice
  const priceColor = isUp ? "text-emerald-600 dark:text-emerald-400" : isDown ? "text-red-600 dark:text-red-500" : "text-foreground"
  const pctColor = percentageChange !== null && percentageChange >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-500"

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-background text-foreground overflow-hidden font-sans relative">
   
      <div className="flex flex-1 min-h-0 w-full relative">
        {/* Left Sidebar Panel */}
        <aside 
          className={`absolute lg:relative z-20 h-full w-64 bg-card flex flex-col border-r shrink-0 transition-transform duration-300 ease-in-out ${isLeftOpen ? 'translate-x-0' : '-translate-x-full lg:hidden lg:w-0 lg:border-none lg:overflow-hidden'}`}
        >
          <div className="p-4 border-b flex justify-between items-center bg-card/50">
            <div className="flex items-center gap-2.5">
              <img src="/branding/logo-mark.svg" alt="Global Link" className="h-7 w-7 rounded-lg shadow-sm" />
              <div className="flex flex-col">
                <span className="font-extrabold text-sm tracking-tight leading-none bg-gradient-to-r from-foreground via-foreground to-primary bg-clip-text text-transparent">
                  GLOBAL<span className="text-emerald-500">LINK</span>
                </span>
                <span className="text-[9px] uppercase font-bold tracking-widest text-muted-foreground mt-0.5">Trading</span>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="lg:hidden h-8 w-8" onClick={() => setIsLeftOpen(false)}>
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Horizontal Tabs */}
          <div className="flex p-2 gap-1 border-b overflow-x-auto no-scrollbar">
            <button 
              onClick={() => setLeftTab("open")}
              className={`flex-1 text-center px-2 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${leftTab === "open" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            >
              Open ({openTrades.length})
            </button>
            <button 
              onClick={() => setLeftTab("closed")}
              className={`flex-1 text-center px-2 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${leftTab === "closed" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            >
              Closed ({closedTrades.length})
            </button>
            <button 
              onClick={() => setLeftTab("transactions")}
              className={`flex-1 text-center px-2 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${leftTab === "transactions" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            >
              Transactions
            </button>
          </div>

          {/* Tab Content Placeholder */}
          <div className="flex-1 overflow-y-auto p-4">
            {leftTab === "open" && <PositionsPanel type="open" />}
            {leftTab === "closed" && <PositionsPanel type="closed" />}
            {leftTab === "transactions" && (
              <WalletPanel />
            )}
          </div>

          <div className="p-4 border-t mt-auto flex flex-col gap-2">
            <Link to="/profile">
              <Button
                variant="outline"
                className="w-full justify-center gap-2 border-primary/20 text-foreground hover:bg-primary/10"
              >
                <User className="h-4 w-4 text-primary" />
                User Profile
              </Button>
            </Link>
            {user?.role === "ADMIN" && (
              <Link to="/admin">
                <Button
                  variant="outline"
                  className="w-full justify-center gap-2 border-purple-500/30 text-purple-600 dark:text-purple-400 hover:bg-purple-500/10"
                >
                  <ShieldCheck className="h-4 w-4 text-purple-500" />
                  Admin Center
                </Button>
              </Link>
            )}
            <Button
              variant="outline"
              className="w-full justify-center gap-2"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              Toggle Theme
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-center gap-2 text-red-500 hover:text-red-600 hover:bg-red-500/10"
              onClick={logout}
            >
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex flex-1 flex-col min-w-0 relative h-full overflow-hidden">
          {/* Top Header Bar */}
          <header className="py-1.5 bg-card border-b flex items-center justify-between px-2 sm:px-4 shrink-0 h-14 gap-1.5 sm:gap-3">
            <div className="flex items-center gap-1 sm:gap-2 min-w-0 flex-1 sm:flex-initial">
              <Button variant="ghost" size="icon" className="shrink-0 h-7 w-7 sm:h-8 sm:w-8" onClick={() => setIsLeftOpen(!isLeftOpen)}>
                {isLeftOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
              </Button>

              <div className="flex items-center gap-1.5 min-w-0">
                <div className="h-6 min-w-6 px-1.5 rounded-full bg-red-500 flex items-center justify-center font-bold text-white text-[10px] sm:text-[11px] shadow-sm shrink-0">
                  {symbol.startsWith('1HZ') ? symbol.replace('1HZ', '').replace('V', 's') : symbol.replace('R_', '')}
                </div>
                <div className="flex flex-col min-w-0">
                  <h1 className="text-xs sm:text-sm font-bold leading-tight truncate">
                    <span className="sm:hidden">{currentSymbol?.shortName || currentSymbol?.name || symbol}</span>
                    <span className="hidden sm:inline">{currentSymbol?.name || symbol}</span>
                  </h1>
                  <div className="flex items-baseline space-x-1">
                    <span className={`font-mono font-bold text-[10px] sm:text-[11px] ${priceColor}`}>
                      {price !== null ? price.toFixed(2) : "..."}
                    </span>
                    {percentageChange !== null && (
                      <span className={`text-[8.5px] sm:text-[9px] font-medium ${pctColor}`}>
                        {percentageChange >= 0 ? "+" : ""}{percentageChange.toFixed(2)}%
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              <BalanceBadge />
              <DepositButton />
              <WithdrawButton />

              {/* AI Scanner Button (Desktop/Tablet - Mobile uses the glowing center bottom bar button) */}
              <Button
                size="sm"
                className="hidden sm:inline-flex bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 hover:from-violet-500 hover:via-indigo-500 hover:to-purple-500 text-white font-bold gap-1.5 h-8 px-2.5 sm:px-3 text-xs shrink-0 shadow-md shadow-indigo-500/25 hover:shadow-indigo-500/40 ring-1 ring-purple-400/40 hover:scale-[1.02] active:scale-95 transition-all"
                onClick={() => setIsScannerOpen(true)}
                title="Open AI Market Scanner"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-300 fill-amber-300/30 shrink-0 animate-pulse" />
                <span className="px-1 py-0.5 rounded text-[9px] font-black bg-white/20 tracking-wider">AI</span>
                <span className="hidden md:inline">Scanner</span>
                <span className="md:hidden">Scan</span>
              </Button>

              {/* Theme Switcher (Desktop/Tablet - Mobile has theme switch in sidebar menu) */}
              <Button 
                variant="ghost" 
                size="icon" 
                className="hidden sm:inline-flex h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>

              {/* User Profile */}
              <Link to="/profile" title="User Profile">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
                >
                  <User className="h-4 w-4 text-primary" />
                </Button>
              </Link>

              <button className="p-1 text-muted-foreground hover:text-foreground rounded-md hidden md:inline-block">
                <Volume2 className="h-4 w-4" />
              </button>
              <button className="p-1 text-muted-foreground hover:text-foreground rounded-md hidden md:inline-block">
                <Bell className="h-4 w-4" />
              </button>
              <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8 lg:flex hidden" onClick={() => setIsRightOpen(!isRightOpen)}>
                {isRightOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
              </Button>
            </div>
          </header>

          <div className="flex items-center gap-1.5 px-2 py-1.5 bg-card/90 border-b overflow-x-auto no-scrollbar shrink-0">
            <button
              onClick={() => setCategory("match_differ")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap border ${
                category === "match_differ"
                  ? "bg-primary/15 border-primary text-primary shadow-xs"
                  : "bg-muted/40 border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Target className="h-3.5 w-3.5" /> Matches/Differs
            </button>
            <button
              onClick={() => setCategory("even_odd")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap border ${
                category === "even_odd"
                  ? "bg-primary/15 border-primary text-primary shadow-xs"
                  : "bg-muted/40 border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Grid className="h-3.5 w-3.5" /> Even/Odd
            </button>
            <button
              onClick={() => setCategory("over_under")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap border ${
                category === "over_under"
                  ? "bg-primary/15 border-primary text-primary shadow-xs"
                  : "bg-muted/40 border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <ArrowUpDown className="h-3.5 w-3.5" /> Over/Under
            </button>
          </div>

          {/* Main Dashboard Stream */}
          <main className="flex-1 bg-background relative flex flex-col overflow-hidden pb-14 lg:pb-0">
            {/* Chart Container (Dynamic flex fill - 0 vertical scroll on mobile!) */}
            <div className="flex-1 relative w-full shrink min-h-[140px] border-b">
              <Chart 
                ref={chartRef} 
                symbol={symbol} 
                onSymbolChange={setSymbol} 
                chartStyle={chartStyle} 
                onChartStyleChange={setChartStyle} 
              />
            </div>

            {/* Digit Stats Bar */}
            <div className="py-0.5 px-1 bg-card/80 backdrop-blur border-b shrink-0 flex items-center overflow-x-hidden">
              <DigitStats symbol={symbol} />
            </div>

            {/* Inline Trading Panel Controls for Mobile */}
            <div className="block lg:hidden shrink-0 bg-card border-t">
              <TradingPanel 
                symbol={symbol} 
                inlineMobile={true} 
                category={category} 
              />
            </div>
          </main>

          <nav className="fixed bottom-0 left-0 right-0 z-30 bg-card border-t flex items-center justify-around h-14 px-2 lg:hidden shadow-lg">
            <button 
              onClick={() => setMobileNav("trade")}
              className={`flex flex-col items-center justify-center flex-1 py-1 ${mobileNav === "trade" ? "text-primary" : "text-muted-foreground"}`}
            >
              <TrendingUp className="h-5 w-5" />
              <span className="text-[10px] font-bold mt-0.5">Trade</span>
            </button>

            {/* Distinct Glowing Center AI Action Button */}
            <button 
              onClick={() => {
                setMobileNav("ai")
                setIsScannerOpen(true)
              }}
              className="flex flex-col items-center justify-center relative -top-3 group"
              title="Open AI Market Scanner"
            >
              {/* Pulsing ambient glow halo behind */}
              <div className="absolute inset-0 -z-10 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-500 blur-md opacity-70 group-hover:opacity-100 transition-opacity animate-pulse" />

              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-violet-600 via-indigo-600 to-purple-500 p-0.5 shadow-xl shadow-indigo-500/40 ring-4 ring-card active:scale-95 transition-all">
                <div className="w-full h-full rounded-[14px] bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center text-white relative overflow-hidden">
                  {/* Subtle shine highlight */}
                  <div className="absolute inset-0 bg-gradient-to-t from-transparent via-white/10 to-white/20 pointer-events-none" />
                  <Sparkles className="h-6 w-6 text-amber-300 fill-amber-300/30 drop-shadow-[0_0_8px_rgba(252,211,77,0.6)] animate-pulse" />
                </div>
              </div>
              <span className="text-[10px] font-extrabold mt-1 tracking-tight bg-gradient-to-r from-violet-400 via-purple-300 to-indigo-300 bg-clip-text text-transparent drop-shadow-xs">
                AI Scanner
              </span>
            </button>

            <button 
              onClick={() => {
                setMobileNav("positions")
                setIsLeftOpen(true)
              }}
              className={`flex flex-col items-center justify-center flex-1 py-1 ${mobileNav === "positions" ? "text-primary" : "text-muted-foreground"}`}
            >
              <Clock className="h-5 w-5" />
              <span className="text-[10px] font-bold mt-0.5">Positions</span>
            </button>
          </nav>
        </div>

        {/* Right Desktop Trading Panel */}
        <div className="hidden lg:block h-full">
          <TradingPanel 
            symbol={symbol} 
            isRightOpen={isRightOpen} 
            setIsRightOpen={setIsRightOpen} 
            category={category} 
          />
        </div>

        {/* Mobile Overlay Backdrops */}
        {isLeftOpen && (
          <div 
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-10 lg:hidden"
            onClick={() => {
              setIsLeftOpen(false)
              if (mobileNav === "positions") setMobileNav("trade")
            }}
          />
        )}

        {/* Entry Scanner Modal */}
        <EntryScannerModal
          isOpen={isScannerOpen}
          onClose={() => {
            setIsScannerOpen(false)
            if (mobileNav === "ai") setMobileNav("trade")
          }}
          initialCategory={category}
          onApplyMarket={({ symbol: newSymbol, category: newCategory }) => {
            setSymbol(newSymbol)
            setCategory(newCategory)
          }}
        />
      </div>
    </div>
  )
}

