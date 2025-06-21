import { useEffect, useState } from "react";
import { Code, Layout, Settings, Play } from "lucide-react";
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Editor } from "@monaco-editor/react";

const Features = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  const initialNodes: Node[] = [
    {
      id: "1",
      type: "input",
      data: { label: "Start" },
      position: { x: 50, y: 50 },
      style: {
        background: "#DFF0D8",
        border: "2px solid #4CAF50",
        color: "#2E7D32",
        fontWeight: "bold",
        padding: 10,
        borderRadius: 8,
      },
    },
    {
      id: "2",
      data: { label: "Process" },
      position: { x: 50, y: 150 },
      style: {
        background: "#FFF3CD",
        border: "2px dashed #FFB300",
        color: "#8A6D3B",
        fontWeight: "bold",
        padding: 10,
        borderRadius: 8,
      },
    },
    {
      id: "3",
      type: "output",
      data: { label: "Execute" },
      position: { x: 50, y: 250 },
      style: {
        background: "#F8D7DA",
        border: "2px solid #DC3545",
        color: "#721C24",
        fontWeight: "bold",
        padding: 10,
        borderRadius: 8,
      },
    },
  ];

  const initialEdges: Edge[] = [
    {
      id: "e1-2",
      source: "1",
      target: "2",
      style: { stroke: "#4CAF50", strokeWidth: 2 },
      animated: true,
    },
    {
      id: "e2-3",
      source: "2",
      target: "3",
      style: { stroke: "#DC3545", strokeWidth: 2 },
      animated: true,
    },
  ];

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = (params: Connection) => {
    setEdges((eds) => addEdge(params, eds));
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.1 }
    );

    const element = document.getElementById("features");
    if (element) {
      observer.observe(element);
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const features = [
    {
      id: "workflow",
      icon: Layout,
      title: "Workflow Canvas",
      description:
        "Design complex automation workflows with our intuitive drag-and-drop React Flow interface. Connect nodes, define logic, and visualize your automation process.",
      color: "from-blue-500 to-cyan-500",
      stats: "15,000+ workflows created",
      side: "left",
    },
    {
      id: "editor",
      icon: Code,
      title: "Built-in Code Editor",
      description:
        "Write, edit, and debug scripts with Monaco-based editor featuring syntax highlighting, auto-completion, and real-time error detection.",
      color: "from-purple-500 to-pink-500",
      stats: "500K+ lines of code",
      side: "right",
    },
    {
      id: "genai",
      icon: Settings,
      title: "AI-Powered Genie",
      description:
        "Let our generative AI agent create workflows and scripts for you automatically. Just describe what you want, and Genie will build it.",
      color: "from-green-500 to-teal-500",
      stats: "95% accuracy rate",
      side: "left",
    },
    {
      id: "execution",
      icon: Play,
      title: "Remote Execution",
      description:
        "Execute scripts on remote servers with secure connections and real-time monitoring. Support for multiple platforms and environments.",
      color: "from-orange-500 to-red-500",
      stats: "99.9% uptime",
      side: "right",
    },
  ];

  const codeExample = `// Sample automation script
import os
import zipfile
from datetime import datetime

def archive_txt_files(folder_path):
    now = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    zip_filename = f"backup_{now}.zip"

    with zipfile.ZipFile(zip_filename, 'w') as zipf:
        for file in os.listdir(folder_path):
            if file.endswith(".txt"):
                full_path = os.path.join(folder_path, file)
                zipf.write(full_path, arcname=file)
                print(f"Archived: {file}")

    print(f"\nBackup complete → {zip_filename}")

# Example usage
folder_to_scan = "./"  # Current directory
archive_txt_files(folder_to_scan)
`;

  return (
    <section
      id="features"
      className="py-20 bg-gray-900 relative overflow-hidden"
    >
      {/* Mouse Glow Effect */}
      <div
        className="pointer-events-none fixed inset-0 z-30 transition duration-300"
        style={{
          background: `radial-gradient(600px at ${mousePosition.x}px ${mousePosition.y}px, rgba(59, 130, 246, 0.15), transparent 80%)`,
        }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Header Section */}
        <div
          className={`text-center mb-16 transform transition-all duration-1000 ${
            isVisible ? "translate-y-0 opacity-100" : "translate-y-10 opacity-0"
          }`}
        >
          <h2 className="text-4xl md:text-6xl font-bold text-white mb-6">
            Powerful Features
          </h2>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            Everything you need to build, deploy, and manage your automation
            workflows
          </p>
        </div>

        {/* Features */}
        <div className="space-y-24">
          {features.map((feature, index) => (
            <div
              key={feature.id}
              className={`grid grid-cols-1 lg:grid-cols-2 gap-12 items-center transform transition-all duration-1000 ${
                isVisible
                  ? "translate-y-0 opacity-100"
                  : "translate-y-10 opacity-0"
              }`}
              style={{ transitionDelay: `${index * 300}ms` }}
            >
              {/* Description Side */}
              <div
                className={`${feature.side === "right" ? "lg:order-2" : ""}`}
              >
                <div
                  className={`w-16 h-16 bg-gradient-to-r ${feature.color} rounded-2xl flex items-center justify-center mb-6`}
                >
                  <feature.icon className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-3xl font-bold text-white mb-4">
                  {feature.title}
                </h3>
                <p className="text-lg text-gray-400 leading-relaxed mb-6">
                  {feature.description}
                </p>
                <div className="text-lg text-blue-400 font-semibold">
                  {feature.stats}
                </div>
              </div>

              {/* Interactive Component Side */}
              <div
                className={`${feature.side === "right" ? "lg:order-1" : ""}`}
              >
                {feature.id === "workflow" && (
                  <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-gray-700 h-80">
                    <ReactFlow
                      nodes={nodes}
                      edges={edges}
                      onNodesChange={onNodesChange}
                      onEdgesChange={onEdgesChange}
                      onConnect={onConnect}
                      fitView
                      attributionPosition="bottom-left"
                      className="rounded-xl"
                    >
                      <Controls />
                      <Background />
                    </ReactFlow>
                  </div>
                )}

                {feature.id === "editor" && (
                  <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-gray-700">
                    <div className="bg-gray-900 rounded-xl overflow-hidden">
                      <div className="flex items-center space-x-2 px-4 py-3 border-b border-gray-700">
                        <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                        <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                        <span className="text-gray-400 text-sm ml-4">
                          automation.js
                        </span>
                      </div>
                      <pre className="text-sm p-4 text-gray-300 overflow-x-auto">
                        <Editor
                          height={300}
                          language="python"
                          theme="vs-dark"
                          value={codeExample}
                          options={{
                            minimap: { enabled: true },
                            fontSize: 13,
                            lineNumbers: "on",
                            roundedSelection: false,
                            scrollBeyondLastLine: false,
                            automaticLayout: true,
                            tabSize: 2,
                            insertSpaces: true,
                            wordWrap: "on",
                            formatOnPaste: true,
                            formatOnType: true,
                            suggestOnTriggerCharacters: true,
                            acceptSuggestionOnEnter: "on",
                            tabCompletion: "on",
                            wordBasedSuggestions: "matchingDocuments",
                            parameterHints: { enabled: true },
                            autoClosingBrackets: "always",
                            autoClosingQuotes: "always",
                            autoIndent: "advanced",
                          }}
                        />
                      </pre>
                    </div>
                  </div>
                )}

                {feature.id === "genai" && (
                  <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-gray-700">
                    <div className="space-y-4">
                      <div className="bg-gray-900 rounded-xl p-4">
                        <div className="text-blue-400 text-sm mb-2">User:</div>
                        <div className="text-gray-300">
                          "Create a workflow to backup database daily at 2 AM"
                        </div>
                      </div>
                      <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-xl p-4 border border-blue-500/30">
                        <div className="text-green-400 text-sm mb-2">
                          Genie:
                        </div>
                        <div className="text-gray-300 text-sm">
                          ✨ Generated workflow with 4 nodes:
                          <br />
                          • Schedule trigger (daily 2:00 AM)
                          <br />
                          • Database connection
                          <br />
                          • Backup execution
                          <br />• Success notification
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <button className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 transition-colors">
                          Apply Workflow
                        </button>
                        <button className="bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-600 transition-colors">
                          Modify
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {feature.id === "execution" && (
                  <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-gray-700">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-white font-semibold">
                          Active Executions
                        </h4>
                        <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                      </div>

                      <div className="space-y-3">
                        <div className="bg-gray-900 rounded-lg p-3">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-gray-300 text-sm">
                              server-prod-01
                            </span>
                            <span className="bg-green-600 text-white text-xs px-2 py-1 rounded">
                              Running
                            </span>
                          </div>
                          <div className="w-full bg-gray-700 rounded-full h-2">
                            <div className="bg-green-500 h-2 rounded-full w-3/4 transition-all duration-300"></div>
                          </div>
                        </div>

                        <div className="bg-gray-900 rounded-lg p-3">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-gray-300 text-sm">
                              server-stage-02
                            </span>
                            <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded">
                              Queued
                            </span>
                          </div>
                          <div className="w-full bg-gray-700 rounded-full h-2">
                            <div className="bg-blue-500 h-2 rounded-full w-1/4 transition-all duration-300"></div>
                          </div>
                        </div>

                        <div className="bg-gray-900 rounded-lg p-3">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-gray-300 text-sm">
                              server-dev-03
                            </span>
                            <span className="bg-green-600 text-white text-xs px-2 py-1 rounded">
                              Success
                            </span>
                          </div>
                          <div className="w-full bg-gray-700 rounded-full h-2">
                            <div className="bg-green-500 h-2 rounded-full w-full transition-all duration-300"></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;
