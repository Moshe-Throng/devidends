import Link from "next/link";
import { Mail, Send, ExternalLink } from "lucide-react";
import { DevidendsLogo } from "./DevidendsLogo";

export function SiteFooter() {
  return (
    <footer className="bg-dark-900">
      {/* Transition gradient from content to footer */}
      <div className="h-[2px] bg-gradient-to-r from-cyan-500 via-teal-400 to-cyan-500" />

      <div className="max-w-7xl mx-auto px-5 sm:px-8 py-14">
        <div className="grid md:grid-cols-4 gap-10">
          {/* Brand */}
          <div className="md:col-span-1">
            <DevidendsLogo variant="light" />
            <p className="mt-4 text-sm text-dark-300 leading-relaxed">
              Empowering professionals in international development with
              intelligence, tools, and connections.
            </p>
          </div>

          {/* Platform */}
          <div>
            <h4 className="text-xs font-bold text-white/60 uppercase tracking-[0.15em] mb-4">
              Platform
            </h4>
            <div className="flex flex-col gap-2.5">
              {[
                { label: "Browse Jobs", href: "/opportunities" },
                { label: "Dev News", href: "/news" },
                { label: "CV Scorer", href: "/score" },
                { label: "CV Builder", href: "/cv-builder" },
                { label: "Subscribe", href: "/subscribe" },
              ].map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className="text-sm text-dark-300 transition-colors hover:text-cyan-400 hover:translate-x-0.5 inline-block"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Resources */}
          <div>
            <h4 className="text-xs font-bold text-white/60 uppercase tracking-[0.15em] mb-4">
              Resources
            </h4>
            <div className="flex flex-col gap-2.5">
              {[
                { label: "Expert Network", href: "/profile" },
                { label: "News & Insights", href: "/news" },
                { label: "Saved Jobs", href: "/saved" },
                { label: "My Profile", href: "/profile" },
              ].map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className="text-sm text-dark-300 transition-colors hover:text-cyan-400 hover:translate-x-0.5 inline-block"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-xs font-bold text-white/60 uppercase tracking-[0.15em] mb-4">
              Connect
            </h4>
            <div className="flex flex-col gap-2.5">
              <a
                href="https://www.devidends.net"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-dark-300 transition-colors hover:text-cyan-400"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                www.devidends.net
              </a>
              <a
                href="mailto:devidendsteam@gmail.com"
                className="inline-flex items-center gap-1.5 text-sm text-dark-300 transition-colors hover:text-cyan-400"
              >
                <Mail className="w-3.5 h-3.5" />
                devidendsteam@gmail.com
              </a>
              <a
                href="https://t.me/devidendsjobs"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-dark-300 transition-colors hover:text-cyan-400"
              >
                <Send className="w-3.5 h-3.5" />
                Telegram Channel
              </a>
            </div>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-dark-700 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-dark-400">
            &copy; {new Date().getFullYear()} Devidends &mdash; Envest
            Technologies PLC. All rights reserved.
          </p>
          <div className="flex items-center gap-1">
            <span className="text-xs text-dark-400">Built for the</span>
            <span className="text-xs font-semibold bg-gradient-to-r from-cyan-400 to-teal-400 bg-clip-text text-transparent">
              development sector
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
