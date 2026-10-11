import { Link, Route, Router, Switch, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { Moon, Sun } from "lucide-react";
import { Logo } from "./components/ui";
import { useBookmarks, useTheme } from "./lib/storage";
import Today from "./pages/Today";
import History from "./pages/History";
import Saved from "./pages/Saved";
import About from "./pages/About";

const NAV = [
  { href: "/", label: "Today" },
  { href: "/history", label: "History" },
  { href: "/saved", label: "Saved" },
  { href: "/about", label: "About" },
];

function Shell({ children }: { children: React.ReactNode }) {
  const [loc] = useLocation();
  const { dark, toggle } = useTheme();
  const { items } = useBookmarks();
  const savedCount = Object.keys(items).length;
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-page items-center gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5" data-testid="link-home">
            <Logo className="h-7 w-7 text-ink" />
            <span className="hidden font-display text-[19px] font-extrabold tracking-tight min-[480px]:inline">RepoRadar</span>
          </Link>
          <nav className="ml-auto flex items-center gap-0.5 sm:ml-8 sm:mr-auto" aria-label="Main">
            {NAV.map((n) => {
              const active = n.href === "/" ? loc === "/" : loc.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  data-testid={`link-nav-${n.label.toLowerCase()}`}
                  aria-current={active ? "page" : undefined}
                  className={`relative rounded-lg px-2 py-1.5 text-[13.5px] font-medium transition-colors sm:px-3 ${active ? "text-ink" : "text-muted hover:text-ink"}`}
                >
                  {n.label}
                  {n.label === "Saved" && savedCount > 0 && <span className="ml-1 font-mono text-[11px] text-accent tabular">{savedCount}</span>}
                  {active && <span className="absolute inset-x-2.5 -bottom-[13px] h-[2px] rounded-full bg-accent sm:inset-x-3 max-sm:inset-x-2" />}
                </Link>
              );
            })}
          </nav>
          <button onClick={toggle} className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-ink" aria-label={dark ? "Switch to light theme" : "Switch to dark theme"} data-testid="button-theme">
            {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-page px-4 pb-20 pt-8 sm:px-6">{children}</main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-page flex-wrap items-center gap-x-4 gap-y-1 px-4 py-6 text-[12.5px] text-faint sm:px-6">
          <span>RepoRadar · a personal project</span>
          <span>Data from <a className="underline hover:text-ink" href="https://github.com/trending" target="_blank" rel="noopener noreferrer">GitHub Trending</a> and the GitHub API</span>
          <span className="sm:ml-auto">Not affiliated with GitHub</span>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <Router hook={useHashLocation}>
      <Shell>
        <Switch>
          <Route path="/" component={Today} />
          <Route path="/history" component={History} />
          <Route path="/saved" component={Saved} />
          <Route path="/about" component={About} />
          <Route>
            <div className="py-20 text-center">
              <p className="font-display text-lg font-bold">Page not found</p>
              <Link href="/" className="mt-3 inline-block text-accent underline">Back to Today</Link>
            </div>
          </Route>
        </Switch>
      </Shell>
    </Router>
  );
}
