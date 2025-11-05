import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Linkedin, X } from "lucide-react";

interface ShareModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shareUrl?: string;
}

const ShareModal: React.FC<ShareModalProps> = ({
  open,
  onOpenChange,
  shareUrl,
}) => {
  const [copied, setCopied] = useState(false);
  const linkToShare = shareUrl || window.location.href;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(linkToShare);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy link:", err);
    }
  };

  const handleLinkedInShare = () => {
    const url = encodeURIComponent(linkToShare);
    window.open(
      `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  const handleXShare = () => {
    const url = encodeURIComponent(linkToShare);
    const text = encodeURIComponent("Check this out!");
    window.open(
      `https://x.com/intent/tweet?url=${url}&text=${text}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-gray-200 dark:bg-[#171717] dark:border-gray-900">
        <DialogHeader>
          <DialogTitle className="dark:text-gray-200">Share</DialogTitle>
          <DialogDescription className="dark:text-gray-400">
            Share this conversation with others
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-10">
          <div className="flex items-center gap-2">
            <div className="flex-1 p-3 bg-gray-100 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-700 dark:text-gray-300 break-all">
                {linkToShare}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-center gap-10">
            <div className="flex flex-col items-center gap-2">
              <Button
                onClick={handleCopyLink}
                variant="outline"
                className="w-10 h-10 rounded-full flex items-center justify-center dark:bg-gray-800/60 dark:text-gray-200 dark:hover:bg-gray-800/80 border-none"
              >
                <Copy className="w-4 h-4" />
              </Button>
              <p className="text-xs text-gray-700 dark:text-gray-300">
                {copied ? "Copied!" : "Copy Link"}
              </p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Button
                onClick={handleXShare}
                variant="outline"
                className="w-10 h-10 rounded-full flex items-center justify-center dark:bg-gray-800/60 dark:text-gray-200 dark:hover:bg-gray-800/80 border-none"
              >
                <X className="w-4 h-4" />
              </Button>
              <p className="text-xs text-gray-700 dark:text-gray-300">X</p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Button
                onClick={handleLinkedInShare}
                variant="outline"
                className="w-10 h-10 rounded-full flex items-center justify-center dark:bg-gray-800/60 dark:text-gray-200 dark:hover:bg-gray-800/80 border-none"
              >
                <Linkedin className="w-4 h-4" />
              </Button>
              <p className="text-xs text-gray-700 dark:text-gray-300">
                LinkedIn
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ShareModal;
