import { Lightbulb, Paperclip, Plus, Send, X, Zap } from "lucide-react";
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
// import { categories, subCategories, quickActions } from "@/utils/categories";
import { useLoading } from "@/contexts/LoadingContext";
// import SuggestedQuestions from "./SuggestedQuestions";
// import { useSuggestedQuestions } from "@/contexts/SuggestedQuestionsContext";
import { useParams } from "react-router-dom";
import InputTypeGroup from "./InputTypeGroup";

type Props = {
  handleSubmit: (e: React.FormEvent, value: string, category: string) => void;
  onSendMessage?: (message: string, category?: string) => void;
};

const ChatInput = ({ handleSubmit, onSendMessage }: Props) => {
  const { id } = useParams();
  const { isLoading } = useLoading();
  const [inputValue, setInputValue] = useState("");
  const [showAtMenu, setShowAtMenu] = useState(false);
  const [atMenuPosition, setAtMenuPosition] = useState<{
    x: number;
    y: number;
  }>({ x: 0, y: 0 });
  const [atSymbolIndex, setAtSymbolIndex] = useState<number>(-1);
  const [searchQuery, setSearchQuery] = useState("");

  const [selectedCategory, setSelectedCategory] = useState("ServiceNow");
  // const {
  //   suggestedQuestions,
  //   showSuggestedQuestions,
  //   setShowSuggestedQuestions,
  // } = useSuggestedQuestions();
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const commandInputRef = React.useRef<HTMLInputElement | null>(null);
  const maxHeightPx = 160;

  const handleAutoResize = React.useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const newHeight = Math.min(el.scrollHeight, maxHeightPx);
    el.style.height = `${newHeight}px`;
    el.style.overflowY = el.scrollHeight > maxHeightPx ? "auto" : "hidden";
  }, []);

  const getCaretCoordinates = () => {
    const el = textareaRef.current;
    if (!el) return { x: 0, y: 0 };

    const position = el.selectionStart;
    const div = document.createElement("div");
    const style = getComputedStyle(el);

    [
      "fontFamily",
      "fontSize",
      "fontWeight",
      "lineHeight",
      "letterSpacing",
      "whiteSpace",
      "wordWrap",
    ].forEach((prop) => {
      (div.style as CSSStyleDeclaration)[prop] = (style as CSSStyleDeclaration)[
        prop
      ];
    });

    div.style.position = "absolute";
    div.style.visibility = "hidden";
    div.style.width = `${el.clientWidth}px`;
    div.style.padding = style.padding;

    document.body.appendChild(div);

    const textBeforeCaret = el.value.substring(0, position);
    div.textContent = textBeforeCaret;

    const span = document.createElement("span");
    span.textContent = el.value.substring(position) || ".";
    div.appendChild(span);

    const rect = el.getBoundingClientRect();

    const formContainer = el.closest(".relative");
    const containerRect = formContainer?.getBoundingClientRect();

    const coordinates = {
      x: containerRect
        ? span.offsetLeft + (rect.left - containerRect.left) - el.scrollLeft
        : span.offsetLeft + rect.left - el.scrollLeft,
      y: containerRect
        ? span.offsetTop + (rect.top - containerRect.top) - el.scrollTop
        : span.offsetTop + rect.top - el.scrollTop,
    };

    document.body.removeChild(div);
    return coordinates;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart;

    setInputValue(value);

    if (value[cursorPos - 1] === "@") {
      const coords = getCaretCoordinates();
      setAtMenuPosition(coords);
      setAtSymbolIndex(cursorPos - 1);
      setShowAtMenu(true);
      setSearchQuery("");
      // Focus the command input after a short delay
      setTimeout(() => {
        commandInputRef.current?.focus();
      }, 50);
    } else if (showAtMenu) {
      const textAfterAt = value.substring(atSymbolIndex + 1, cursorPos);
      if (value[atSymbolIndex] !== "@" || textAfterAt.includes(" ")) {
        setShowAtMenu(false);
        setSearchQuery("");
      } else {
        // Update search query based on text after @
        setSearchQuery(textAfterAt);
      }
    }
  };

  const handleCategorySelect = (categoryName: string) => {
    if (atSymbolIndex === -1) return;

    const beforeAt = inputValue.substring(0, atSymbolIndex);
    const cursorPos = textareaRef.current?.selectionStart || atSymbolIndex + 1;
    const afterCursor = inputValue.substring(cursorPos);
    const newValue = `${beforeAt}${afterCursor}`;

    setInputValue(newValue);
    setShowAtMenu(false);
    setAtSymbolIndex(-1);
    setSelectedCategory(categoryName);
    setSearchQuery("");

    textareaRef.current?.focus();
    // Set cursor position after the category selection
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.selectionStart = beforeAt.length;
        textareaRef.current.selectionEnd = beforeAt.length;
      }
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && showAtMenu) {
      setShowAtMenu(false);
      setSearchQuery("");
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (showAtMenu) {
        setShowAtMenu(false);
        setSearchQuery("");
      } else {
        handleSubmit(e, inputValue, selectedCategory);
        setInputValue("");
      }
    }
  };

  React.useEffect(() => {
    handleAutoResize();
  }, [handleAutoResize]);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        showAtMenu &&
        textareaRef.current &&
        !textareaRef.current.contains(e.target as Node) &&
        !(e.target as Element).closest("[data-at-menu]")
      ) {
        setShowAtMenu(false);
        setSearchQuery("");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showAtMenu]);

  React.useEffect(() => {
    if (!showAtMenu) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowAtMenu(false);
        setSearchQuery("");
        // Ensure textarea regains focus and current text is selected for quick editing
        if (textareaRef.current) {
          textareaRef.current.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showAtMenu]);

  return (
    <div className={`thin-scrollbar ${id ? "w-full" : "w-[85%] mx-auto"}`}>
      {/*<div className="w-[75%] mx-auto">
        {showSuggestedQuestions && (
          <SuggestedQuestions
            onSendMessage={onSendMessage}
            suggestedQuestions={suggestedQuestions}
          />
        )}
      </div>*/}
      <div className="relative w-[75%] mx-auto">
        {/* @ Menu with Combobox */}
        {showAtMenu && (
          <div
            data-at-menu
            className="absolute z-50 w-[220px] bg-white dark:bg-slate-800 rounded-lg border border-gray-300 dark:border-slate-700 shadow-lg"
            style={{
              left: `${atMenuPosition.x}px`,
              bottom: `calc(100% - ${atMenuPosition.y}px + 10px)`,
            }}
          >
            {/* <Command className="rounded-lg border-0">
              <CommandInput
                ref={commandInputRef}
                placeholder="Search categories..."
                className="h-9"
                value={searchQuery}
                onValueChange={setSearchQuery}
              />
              <CommandList>
                <CommandEmpty>No category found.</CommandEmpty>
                <CommandGroup>
                  {categories.map((category) => {
                    const CategoryIcon = category.icon as React.ComponentType<{
                      size?: number;
                      className?: string;
                    }>;
                    return (
                      <CommandItem
                        key={category.id}
                        value={category.name}
                        onSelect={() => handleCategorySelect(category.name)}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <CategoryIcon size={16} className={category.color} />
                        <span className="text-sm font-normal">
                          {category.name}
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command> */}
          </div>
        )}

        <form
          onSubmit={(e) => handleSubmit(e, inputValue, selectedCategory)}
          className="flex px-2"
        >
          <div className="w-full flex flex-col justify-between bg-gray-100 dark:bg-gray-500/15 rounded-2xl border border-gray-300 dark:border-transparent px-2 py-2 shadow-md">
            <Textarea
              placeholder="Ask anything..."
              className="resize-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-2 py-2 bg-transparent my-auto shadow-none thin-scrollbar text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400"
              rows={2}
              ref={textareaRef}
              value={inputValue}
              onInput={handleAutoResize}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              style={{
                minHeight: "auto",
                fontSize: "16px",
                lineHeight: "1.6",
                maxHeight: maxHeightPx,
                overflowY: "hidden",
                fontFamily:
                  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
              }}
            />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <InputTypeGroup />
              </div>

              <div className="flex items-center justify-between">
                {/* {suggestedQuestions && suggestedQuestions.length > 0 && id && ( */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      className="p-2 mr-2 rounded-full bg-transparent text-black dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-slate-700"
                      onClick={() => {}}
                    >
                      <Lightbulb size={18} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Suggested Questions</p>
                  </TooltipContent>
                </Tooltip>
                {/* )} */}

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button className="p-2 mr-2 rounded-full bg-transparent text-black dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-slate-700">
                      <Paperclip size={18} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Attach File</p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={(e) =>
                        handleSubmit(e, inputValue, selectedCategory)
                      }
                      type="submit"
                      disabled={isLoading}
                      className="p-2 rounded-full bg-transparent hover:bg-blue-100 dark:hover:bg-blue-900 text-blue-500 dark:text-blue-400"
                    >
                      <Send size={18} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Send Message</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChatInput;

const QuickActionMenu = ({
  onSendMessage,
  selectedCategory,
  setSelectedCategory,
}: {
  onSendMessage?: (message: string, category?: string) => void;
  selectedCategory?: string;
  setSelectedCategory?: (category: string) => void;
}) => {
  const { isLoading } = useLoading();
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              className={`p-2 rounded-full bg-transparent text-black dark:text-white border-0 outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=open]:outline-none data-[state=open]:ring-0 shadow-md ${
                isLoading
                  ? "opacity-60 cursor-not-allowed"
                  : "hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
              disabled={isLoading}
            >
              <Plus size={18} />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <p>Quick Actions</p>
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent>
        <DropdownMenuLabel className="flex items-center gap-2">
          <Zap size={16} />
          Quick Actions
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {/* <DynamicQuickActions
          onSendMessage={onSendMessage}
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
        /> */}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
