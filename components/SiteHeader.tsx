"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ArrowRight, Menu, X, User, LogOut, Bookmark, FileText, Settings } from "lucide-react";
import { DevidendsLogo } from "./DevidendsLogo";
import { useAuth } from "./AuthProvider";

const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "Opportunities", href: "/opportunities" },
  { label: "News", href: "/news" },
  { label: "Build CV", href: "/cv-builder" },
  { label: "Score CV", href: "/score" },
];

export function SiteHeader({ activeHref }: { activeHref?: string }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { user, loading, signOut } = useAuth();
  const menuRef = useRef<HTMLDivElement>(null);

  // Close user menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-dark-50">
      {/* Top gradient accent line */}
      <div className="h-[2px] bg-gradient-to-r from-cyan-500 via-teal-400 to-cyan-500" />

      <nav className="max-w-7xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex-shrink-0">
          <DevidendsLogo />
        </Link>

        {/* Desktop nav */}
        <div className="hidden lg:flex items-center gap-1">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className={`relative px-3.5 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeHref === link.href
                  ? "text-cyan-600"
                  : "text-dark-500 hover:text-dark-900 hover:bg-dark-50"
              }`}
            >
              {link.label}
              {activeHref === link.href && (
                <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-gradient-to-r from-cyan-500 to-teal-400" />
              )}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {/* Auth section */}
          {!loading && (
            <>
              {user ? (
                <div className="relative" ref={menuRef}>
                  <button
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-teal-500 flex items-center justify-center text-white text-sm font-bold shadow-sm hover:shadow-md hover:shadow-cyan-500/20 transition-all"
                  >
                    {user.email?.charAt(0).toUpperCase() || "U"}
                  </button>

                  {userMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl border border-dark-100 shadow-xl shadow-dark-900/10 py-2 animate-fadeInUp z-50">
                      <div className="px-4 py-2 border-b border-dark-50">
                        <p className="text-xs text-dark-400 truncate">
                          {user.email}
                        </p>
                      </div>
                      <Link
                        href="/profile"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-dark-600 hover:bg-dark-50 transition-colors"
                      >
                        <User className="w-4 h-4" />
                        My Profile
                      </Link>
                      <Link
                        href="/saved"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-dark-600 hover:bg-dark-50 transition-colors"
                      >
                        <Bookmark className="w-4 h-4" />
                        Saved Opportunities
                      </Link>
                      <Link
                        href="/cv-builder"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-dark-600 hover:bg-dark-50 transition-colors"
                      >
                        <FileText className="w-4 h-4" />
                        My CVs
                      </Link>
                      <Link
                        href="/settings"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-dark-600 hover:bg-dark-50 transition-colors"
                      >
                        <Settings className="w-4 h-4" />
                        Settings
                      </Link>
                      <div className="border-t border-dark-50 my-1" />
                      <button
                        onClick={() => {
                          signOut();
                          setUserMenuOpen(false);
                        }}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-dark-600 hover:bg-dark-50 transition-colors w-full text-left"
                      >
                        <LogOut className="w-4 h-4" />
                        Sign Out
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <Link
                  href="/login"
                  className="hidden sm:inline-flex items-center gap-1.5 text-sm font-semibold text-dark-500 hover:text-dark-900 transition-colors px-3 py-2"
                >
                  <User className="w-4 h-4" />
                  Sign In
                </Link>
              )}
            </>
          )}

          <Link
            href="/subscribe"
            className="hidden sm:inline-flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-teal-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all duration-200 hover:from-cyan-600 hover:to-teal-600 hover:shadow-lg hover:shadow-cyan-500/20"
          >
            Subscribe
            <ArrowRight className="w-4 h-4" />
          </Link>

          {/* Mobile toggle */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="lg:hidden p-2 text-dark-500 hover:text-dark-900"
            aria-label="Toggle menu"
          >
            {mobileOpen ? (
              <X className="w-5 h-5" />
            ) : (
              <Menu className="w-5 h-5" />
            )}
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="lg:hidden border-t border-dark-50 bg-white px-5 py-4 space-y-1 animate-fadeInUp">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className={`block px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                activeHref === link.href
                  ? "text-cyan-600 bg-cyan-50 border-l-2 border-cyan-500"
                  : "text-dark-500 hover:text-dark-900 hover:bg-dark-50"
              }`}
            >
              {link.label}
            </Link>
          ))}

          {user && (
            <>
              <Link
                href="/profile"
                onClick={() => setMobileOpen(false)}
                className="block px-4 py-2.5 text-sm font-medium rounded-lg text-dark-500 hover:text-dark-900 hover:bg-dark-50"
              >
                My Profile
              </Link>
              <Link
                href="/saved"
                onClick={() => setMobileOpen(false)}
                className="block px-4 py-2.5 text-sm font-medium rounded-lg text-dark-500 hover:text-dark-900 hover:bg-dark-50"
              >
                Saved Opportunities
              </Link>
              <Link
                href="/cv-builder"
                onClick={() => setMobileOpen(false)}
                className="block px-4 py-2.5 text-sm font-medium rounded-lg text-dark-500 hover:text-dark-900 hover:bg-dark-50"
              >
                My CVs
              </Link>
              <Link
                href="/settings"
                onClick={() => setMobileOpen(false)}
                className="block px-4 py-2.5 text-sm font-medium rounded-lg text-dark-500 hover:text-dark-900 hover:bg-dark-50"
              >
                Settings
              </Link>
              <button
                onClick={() => {
                  signOut();
                  setMobileOpen(false);
                }}
                className="block w-full text-left px-4 py-2.5 text-sm font-medium rounded-lg text-dark-500 hover:text-dark-900 hover:bg-dark-50"
              >
                Sign Out
              </button>
            </>
          )}

          {!user && (
            <Link
              href="/login"
              onClick={() => setMobileOpen(false)}
              className="block px-4 py-2.5 text-sm font-medium rounded-lg text-dark-500 hover:text-dark-900 hover:bg-dark-50"
            >
              Sign In
            </Link>
          )}

          <Link
            href="/subscribe"
            onClick={() => setMobileOpen(false)}
            className="block mt-3 text-center bg-gradient-to-r from-cyan-500 to-teal-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl"
          >
            Subscribe
          </Link>
        </div>
      )}
    </header>
  );
}
