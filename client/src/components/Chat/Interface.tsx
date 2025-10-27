import React from "react";
import ChatInput from "./ChatInput";

const welcomeMessages = [
  "Hello! How can I help you today?",
  "What would you like to work on?",
  "Ready to automate something?",
  "What's on your mind?",
  "How can I assist you today?",
  "What can I help you build?",
  "Ready to create something amazing?",
  "What's your next project?",
  "How can I make your work easier?",
  "What would you like to explore?",
];

const Interface = () => {
  const randomMessage =
    welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)];

  return (
    <div className="w-[75%] mx-auto my-auto">
      <div className="text-center mb-8">
        <p className="text-2xl text-gray-600 dark:text-gray-400">
          {randomMessage}
        </p>
      </div>
      <ChatInput handleSubmit={() => {}} />
    </div>
  );
};

export default Interface;
