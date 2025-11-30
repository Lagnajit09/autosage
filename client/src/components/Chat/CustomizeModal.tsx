import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface CustomizeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CustomizeModal: React.FC<CustomizeModalProps> = ({
  open,
  onOpenChange,
}) => {
  const [tone, setTone] = useState("Professional");
  const [detailLevel, setDetailLevel] = useState("Default");
  const [expertise, setExpertise] = useState("Intermediate");
  const [language, setLanguage] = useState("English");
  const [aboutYou, setAboutYou] = useState("");
  const [systemInstruction, setSystemInstruction] = useState("");

  const handleSave = () => {
    // TODO: Save preferences to backend/context
    console.log({
      tone,
      detailLevel,
      expertise,
      language,
      aboutYou,
      systemInstruction,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] bg-gray-50 dark:bg-[#171717] dark:border-gray-800 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="dark:text-gray-200">
            Customize Response
          </DialogTitle>
          <DialogDescription className="dark:text-gray-400">
            Adjust how the agent responds to your queries.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="tone" className="text-right dark:text-gray-300">
              Tone
            </Label>
            <div className="col-span-3">
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger className="w-full dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200">
                  <SelectValue placeholder="Select tone" />
                </SelectTrigger>
                <SelectContent className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200">
                  <SelectItem value="Professional">Professional</SelectItem>
                  <SelectItem value="Casual">Casual</SelectItem>
                  <SelectItem value="Friendly">Friendly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label
              htmlFor="detailLevel"
              className="text-right dark:text-gray-300"
            >
              Length
            </Label>
            <div className="col-span-3">
              <Select value={detailLevel} onValueChange={setDetailLevel}>
                <SelectTrigger className="w-full dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200">
                  <SelectValue placeholder="Select detail level" />
                </SelectTrigger>
                <SelectContent className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200">
                  <SelectItem value="Default">Default</SelectItem>
                  <SelectItem value="Concise">Concise</SelectItem>
                  <SelectItem value="Detailed Explanation">
                    Detailed Explanation
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label
              htmlFor="expertise"
              className="text-right dark:text-gray-300"
            >
              Expertise
            </Label>
            <div className="col-span-3">
              <Select value={expertise} onValueChange={setExpertise}>
                <SelectTrigger className="w-full dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200">
                  <SelectValue placeholder="Select expertise" />
                </SelectTrigger>
                <SelectContent className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200">
                  <SelectItem value="Beginner">Beginner</SelectItem>
                  <SelectItem value="Intermediate">Intermediate</SelectItem>
                  <SelectItem value="Advanced">Advanced</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="language" className="text-right dark:text-gray-300">
              Language
            </Label>
            <div className="col-span-3">
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className="w-full dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200">
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200">
                  <SelectItem value="English">English</SelectItem>
                  <SelectItem value="Spanish">Spanish</SelectItem>
                  <SelectItem value="French">French</SelectItem>
                  <SelectItem value="German">German</SelectItem>
                  <SelectItem value="Hindi">Hindi</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-4 items-start gap-4">
            <Label
              htmlFor="aboutYou"
              className="text-right pt-2 dark:text-gray-300"
            >
              About You
            </Label>
            <div className="col-span-3">
              <Textarea
                id="aboutYou"
                value={aboutYou}
                onChange={(e) => setAboutYou(e.target.value)}
                placeholder="Tell us about your role, tech stack, or preferences..."
                className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200 min-h-[80px]"
              />
            </div>
          </div>

          <div className="grid grid-cols-4 items-start gap-4">
            <Label
              htmlFor="instruction"
              className="text-right pt-2 dark:text-gray-300"
            >
              System Instruction
            </Label>
            <div className="col-span-3">
              <Textarea
                id="instruction"
                value={systemInstruction}
                onChange={(e) => setSystemInstruction(e.target.value)}
                placeholder="e.g., Always explain code step-by-step..."
                className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200 min-h-[100px]"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="dark:bg-transparent dark:text-gray-300 dark:hover:bg-gray-800 dark:border-gray-700"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            className="bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200"
          >
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CustomizeModal;
