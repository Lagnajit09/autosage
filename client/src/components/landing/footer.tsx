import { Facebook, Github, Instagram, Linkedin, Twitter } from "lucide-react";
import React from "react";

const Footer = () => {
  return (
    <div className="flex items-center justify-between w-[90%] mx-auto pt-20 pb-10">
      <div className="flex flex-col">
        <div className="flex items-end gap-2">
          <img
            src="/logo.png"
            alt="AutoSage Logo"
            className="h-10 w-auto object-contain mb-4"
          />
          <p className="text-gray-950 dark:text-gray-100 font-semibold text-xl tracking-tight leading-tight mb-4">
            AUTOSAGE
          </p>
        </div>
        <span className="text-xs text-gray-600 dark:text-gray-500">
          Copyright © 2025 Autosage. All rights reserved.
          <br />
          123.moharana@gmail.com
        </span>
      </div>
      <div className="flex gap-4 items-center text-gray-700 dark:text-gray-300">
        <Instagram className="w-4 h-4" />
        <Facebook className="w-4 h-4" />
        <Twitter className="w-4 h-4" />
        <Linkedin className="w-4 h-4" />
        <Github className="w-4 h-4" />
      </div>
    </div>
  );
};

export default Footer;
