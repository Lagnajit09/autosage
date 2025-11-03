import React, { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import ChatInput from "./ChatInput";
import { CodeBlock } from "./CodeBlock";

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

const messages = [
  {
    id: "msg-001",
    role: "user",
    timestamp: "2025-11-01T09:15:12Z",
    contentType: "text/plain",
    content:
      "Hey, I want to automate my daily server health checks using Python. Can you help me with that?",
    status: "read",
    metadata: { intent: "automation_request" },
  },
  {
    id: "msg-002",
    role: "assistant",
    timestamp: "2025-11-01T09:15:18Z",
    contentType: "text/markdown",
    status: "delivered",
    content: `Sure! Let's start with a simple Python script that checks CPU, memory, and disk usage using the \`psutil\` library.

Here's a basic version:

\`\`\`python
import psutil
import json

stats = {
    'cpu_percent': psutil.cpu_percent(interval=1),
    'memory': psutil.virtual_memory().percent,
    'disk': psutil.disk_usage('/').percent
}

print(json.dumps(stats, indent=4))
\`\`\`

Would you like me to add email or Slack alerts when any of these metrics exceed a threshold?`,
    metadata: { code_languages: ["python", "json"], task: "system_monitoring" },
  },
  {
    id: "msg-003",
    role: "user",
    timestamp: "2025-11-01T09:15:45Z",
    contentType: "text/plain",
    status: "read",
    content: "Yes, send me a Slack alert if CPU or memory goes beyond 80%.",
    metadata: { preference: "Slack alert" },
  },
  {
    id: "msg-004",
    role: "assistant",
    timestamp: "2025-11-01T09:15:52Z",
    contentType: "text/markdown",
    status: "delivered",
    content: `Got it. Here's the updated script with Slack alert integration using a webhook URL:

\`\`\`python
import psutil
import json
import requests

SLACK_WEBHOOK = 'https://hooks.slack.com/services/xxxx/yyyy/zzzz'

stats = {
    'cpu_percent': psutil.cpu_percent(interval=1),
    'memory': psutil.virtual_memory().percent,
    'disk': psutil.disk_usage('/').percent
}

message = f"⚙️ Server Health Check:\\nCPU: {stats['cpu_percent']}%\\nMemory: {stats['memory']}%\\nDisk: {stats['disk']}%"

if stats['cpu_percent'] > 80 or stats['memory'] > 80:
    payload = { 'text': f":warning: *High Resource Usage!*\\n{message}" }
    requests.post(SLACK_WEBHOOK, json=payload)

print(json.dumps(stats, indent=4))
\`\`\`

You can schedule this script using a simple cron job like this:

\`\`\`bash
0 * * * * /usr/bin/python3 /home/ubuntu/server_health_check.py >> /var/log/health.log 2>&1
\`\`\`

That will run it every hour. Do you want me to include a configuration file to store thresholds and webhook URLs?`,
    metadata: { code_languages: ["python", "bash"], feature: "alerting" },
  },
  {
    id: "msg-005",
    role: "user",
    timestamp: "2025-11-01T09:16:10Z",
    contentType: "text/plain",
    status: "read",
    content: "Yes, that'd be great. Let's make it configurable.",
    metadata: { action: "request_configurable" },
  },
  {
    id: "msg-006",
    role: "assistant",
    timestamp: "2025-11-01T09:16:20Z",
    contentType: "text/markdown",
    status: "delivered",
    content: `Perfect. Here's how you can make it configurable using a JSON config file:

📁 **config.json**
\`\`\`json
{
  "thresholds": {
    "cpu": 80,
    "memory": 80,
    "disk": 90
  },
  "slack_webhook": "https://hooks.slack.com/services/xxxx/yyyy/zzzz"
}
\`\`\`

📄 **main.py**
\`\`\`python
import psutil, json, requests

with open('config.json') as f:
    config = json.load(f)

thresholds = config['thresholds']
SLACK_WEBHOOK = config['slack_webhook']

stats = {
    'cpu_percent': psutil.cpu_percent(interval=1),
    'memory': psutil.virtual_memory().percent,
    'disk': psutil.disk_usage('/').percent
}

alerts = [key for key, value in stats.items() if value > thresholds.get(key.split('_')[0], 100)]

if alerts:
    message = "\\n".join([f"{k}: {v}%" for k, v in stats.items()])
    payload = { 'text': f":warning: *High Resource Usage!*\\n{message}" }
    requests.post(SLACK_WEBHOOK, json=payload)

print(json.dumps(stats, indent=4))
\`\`\`

Now, you can tweak the thresholds or change the webhook without modifying the code. 🚀`,
    metadata: {
      files: ["config.json", "main.py"],
      code_languages: ["json", "python"],
    },
  },
  {
    id: "msg-007",
    role: "user",
    timestamp: "2025-11-01T09:16:55Z",
    contentType: "text/plain",
    status: "read",
    content:
      "That's awesome! Can you also generate a summary report in HTML format?",
    metadata: { request_type: "report_generation" },
  },
  {
    id: "msg-008",
    role: "assistant",
    timestamp: "2025-11-01T09:17:05Z",
    contentType: "text/markdown",
    status: "delivered",
    content: `Of course! Here's how to extend the script to generate an HTML summary:

\`\`\`python
from datetime import datetime

html = f'''
<html>
<head><title>Server Health Report</title></head>
<body>
  <h2>Server Health Summary - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</h2>
  <table border="1" cellspacing="0" cellpadding="5">
    <tr><th>Metric</th><th>Usage (%)</th></tr>
    <tr><td>CPU</td><td>{stats['cpu_percent']}</td></tr>
    <tr><td>Memory</td><td>{stats['memory']}</td></tr>
    <tr><td>Disk</td><td>{stats['disk']}</td></tr>
  </table>
</body>
</html>
'''

with open('report.html', 'w') as f:
    f.write(html)

print("✅ HTML report generated as report.html")
\`\`\`

You could even have the bot email this report automatically every morning. Want me to include that next?`,
    metadata: {
      feature: "report_generation",
      code_languages: ["python", "html"],
    },
  },
];

const Interface = () => {
  const randomMessage =
    welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)];
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on mount and when messages change
  useEffect(() => {
    const scrollToBottom = () => {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTo({
          top: messagesContainerRef.current.scrollHeight,
          behavior: "smooth",
        });
      }
    };

    // Use setTimeout to ensure DOM has updated
    const timeoutId = setTimeout(scrollToBottom, 0);
    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]); // Will trigger when messages array changes (when messages become stateful)

  return (
    <div className="w-full flex flex-col items-center justify-center">
      {messages.length === 0 ? (
        <>
          <div className="text-center mb-8">
            <p className="text-2xl text-gray-600 dark:text-gray-400">
              {randomMessage}
            </p>
          </div>
          <ChatInput handleSubmit={() => {}} />
        </>
      ) : (
        <>
          <div
            ref={messagesContainerRef}
            className="h-full w-full flex flex-col items-start my-6 overflow-y-scroll"
          >
            <div className="w-[68%] mx-auto flex flex-col justify-start items-start px-2 pt-10">
              {messages.map((message) => (
                <>
                  {message.role === "user" && (
                    <div className="w-full flex items-start gap-2 rounded-xl mb-0">
                      <div className="p-2 w-10 h-10 bg-purple-300/50 dark:bg-purple-500/30 text-gray-950 dark:text-gray-50 rounded-full flex items-center justify-center font-semibold ">
                        L
                      </div>
                      <p className="w-fit bg-gray-300 dark:bg-gray-950/50 text-gray-900 dark:text-gray-200 font-medium py-4 px-4 rounded-xl">
                        {message.content}
                      </p>
                    </div>
                  )}
                  {message.role === "assistant" && (
                    <div className="w-full text-gray-900 dark:text-gray-200 rounded-lg p-2 mb-10 prose prose-invert prose-pre:bg-gray-300 dark:prose-pre:bg-gray-900 prose-pre:border prose-pre:border-gray-700 max-w-none prose-p:my-0 prose-p:leading-relaxed">
                      <ReactMarkdown
                        components={{
                          code(props: React.ComponentPropsWithoutRef<"code">) {
                            const { children, className, ...rest } = props;
                            const match = /language-(\w+)/.exec(
                              className || ""
                            );
                            const language = match ? match[1] : "";
                            const isInline = !match;

                            return isInline ? (
                              <code
                                className="px-1.5 py-0.5 text-purple-700 dark:text-purple-300/80 bg-gray-300/50 dark:bg-gray-500/30 rounded text-sm font-mono border border-gray-400/50 dark:border-gray-500/40"
                                {...rest}
                              >
                                {children}
                              </code>
                            ) : (
                              <CodeBlock
                                code={String(children).replace(/\n$/, "")}
                                language={language}
                              />
                            );
                          },
                          strong(
                            props: React.ComponentPropsWithoutRef<"strong">
                          ) {
                            return (
                              <strong
                                className="font-bold text-gray-900 dark:text-gray-100"
                                {...props}
                              >
                                {props.children}
                              </strong>
                            );
                          },
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  )}
                </>
              ))}
            </div>
            <div className="sticky bottom-0 w-full z-20">
              <ChatInput handleSubmit={() => {}} />
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Interface;
