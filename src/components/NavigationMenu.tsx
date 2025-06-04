import React, { useState } from "react";
import { Menu, X } from "lucide-react";
import { CredentialVault } from "./CredentialVault";
import { Button } from "@/components/ui/button";

export const NavigationMenu = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCredentialVaultOpen, setIsCredentialVaultOpen] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const openCredentialVault = () => {
    setIsCredentialVaultOpen(true);
    setIsMenuOpen(false);
  };

  const openSettings = () => {
    // TODO: Implement settings functionality
    console.log("Settings clicked");
    setIsMenuOpen(false);
  };

  return (
    <div className="relative">
      {/* Hamburger Menu Button */}
      <Button
        onClick={toggleMenu}
        variant="ghost"
        size="sm"
        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors duration-200"
      >
        {isMenuOpen ? <X size={16} /> : <Menu size={16} />}
      </Button>

      {/* Dropdown Menu */}
      {isMenuOpen && (
        <div className="absolute top-full right-0 mt-1 w-48 bg-slate-800/95 backdrop-blur-sm border border-slate-700/50 rounded-lg shadow-xl z-50">
          <div className="py-1">
            <button
              onClick={openCredentialVault}
              className="w-full px-3 py-2 text-left text-xs text-slate-300 hover:bg-slate-700/50 hover:text-white transition-colors duration-200 flex items-center space-x-2"
            >
              <svg
                className="w-3 h-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
              <span>Credential Vault</span>
            </button>
            <button
              onClick={openSettings}
              className="w-full px-3 py-2 text-left text-xs text-slate-300 hover:bg-slate-700/50 hover:text-white transition-colors duration-200 flex items-center space-x-2"
            >
              <svg
                className="w-3 h-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              <span>Settings</span>
            </button>
          </div>
        </div>
      )}

      {/* Credential Vault Popup */}
      {isCredentialVaultOpen && (
        <CredentialVault onClose={() => setIsCredentialVaultOpen(false)} />
      )}
    </div>
  );
};
