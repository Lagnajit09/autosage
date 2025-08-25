import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  ReactFlow,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  Connection,
  Node,
  ReactFlowProvider,
  ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { RightSidebar } from "./RightSidebar";
import { TriggerNode } from "./nodes/TriggerNode";
import { ActionNode } from "./nodes/ActionNode";
import { LeftSidebar } from "./LeftSidebar";
import { Edge, NodeData, ScriptFile, WorkflowData } from "@/utils/types";
import { ImportWorkflowDialog } from "./ImportWorkflowDialog";
import { DecisionNode } from "./nodes/DecisionNode";
import { AIWorkflowGenerator } from "./AIWorkflowGenerator";
import GenieButton from "./GenieButton";
import { CredentialVault } from "./CredentialVault";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@radix-ui/react-tooltip";
import { CircleUserRound, FileInput, Key, Moon, Sun } from "lucide-react";
import { useTheme } from "@/provider/theme-provider";

const nodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  decision: DecisionNode,
};

const WorkflowBuilderContent = () => {
  const { isDark, toggleTheme } = useTheme();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showCredentialVault, setShowCredentialVault] = useState(false);
  const [showAIGenerator, setShowAIGenerator] = useState(false);
  const [reactFlowInstance, setReactFlowInstance] =
    useState<ReactFlowInstance | null>(null);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  // Load workflow from localStorage on component mount
  useEffect(() => {
    const savedWorkflow = localStorage.getItem("currentWorkflow");
    if (savedWorkflow) {
      try {
        const { nodes: savedNodes, edges: savedEdges } =
          JSON.parse(savedWorkflow);
        setNodes(savedNodes || []);
        setEdges(savedEdges || []);
      } catch (error) {
        console.error("Error loading saved workflow:", error);
      }
    }
  }, [setNodes, setEdges]);

  // Auto-save to localStorage whenever nodes or edges change
  useEffect(() => {
    const workflowData = { nodes, edges, timestamp: new Date().toISOString() };
    localStorage.setItem("currentWorkflow", JSON.stringify(workflowData));
  }, [nodes, edges]);

  useEffect(() => {
    setSidebarOpen(!!(selectedNode || selectedEdge));
  }, [selectedNode, selectedEdge]);

  const importWorkflow = (workflowData: WorkflowData) => {
    try {
      const { nodes: importedNodes, edges: importedEdges } = workflowData;

      if (importedNodes && Array.isArray(importedNodes)) {
        setNodes(importedNodes);
      }

      if (importedEdges && Array.isArray(importedEdges)) {
        setEdges(importedEdges);
      }

      setShowImportDialog(false);

      // Fit view to imported workflow
      if (reactFlowInstance) {
        setTimeout(() => {
          reactFlowInstance.fitView();
        }, 100);
      }
    } catch (error) {
      console.error("Error importing workflow:", error);
    }
  };

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      if (!reactFlowInstance || !reactFlowWrapper.current) return;

      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const type = event.dataTransfer.getData("application/reactflow");
      const nodeData = JSON.parse(
        event.dataTransfer.getData("application/nodedata")
      );

      if (!type) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });

      const newNode: Node = {
        id: `${type}-${Date.now()}`,
        type,
        position,
        data: {
          ...nodeData,
          label: nodeData.label,
          description: "",
        },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, setNodes]
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
    setSelectedEdge(null);
  }, []);

  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setSelectedEdge(edge);
    setSelectedNode(null);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setSelectedEdge(null);
  }, []);

  const updateNodeData = useCallback(
    (nodeId: string, newData: Partial<NodeData>) => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === nodeId) {
            const updatedNode = { ...node, data: { ...node.data, ...newData } };
            setSelectedNode(updatedNode);
            return updatedNode;
          }
          return node;
        })
      );
    },
    [setNodes]
  );

  const updateEdgeData = useCallback(
    (edgeId: string, updates: Partial<Edge>) => {
      setEdges((eds) =>
        eds.map((edge) => {
          if (edge.id === edgeId) {
            const updatedEdge = { ...edge, ...updates };
            setSelectedEdge(updatedEdge);
            return updatedEdge;
          }
          return edge;
        })
      );
    },
    [setEdges]
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((node) => node.id !== nodeId));
      setEdges((eds) =>
        eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId)
      );
      setSelectedNode(null);
    },
    [setNodes, setEdges]
  );

  const deleteEdge = useCallback(
    (edgeId: string) => {
      setEdges((eds) => eds.filter((edge) => edge.id !== edgeId));
      setSelectedEdge(null);
    },
    [setEdges]
  );

  const handleReactFlowInit = useCallback(
    (reactFlowInstance: ReactFlowInstance) => {
      setReactFlowInstance(reactFlowInstance);
    },
    []
  );

  // edge creation handler for decision nodes
  const handleCreateEdge = useCallback(
    (sourceId: string, targetId: string, sourceHandle?: string) => {
      const newEdge: Edge = {
        id: `${sourceId}-${targetId}-${sourceHandle || "default"}`,
        source: sourceId,
        target: targetId,
        sourceHandle,
        type: "smoothstep",
        style: {
          stroke:
            sourceHandle === "true"
              ? "#10b981"
              : sourceHandle === "false"
              ? "#ef4444"
              : "#ffffff",
          strokeWidth: 2,
        },
        label:
          sourceHandle === "true"
            ? "True"
            : sourceHandle === "false"
            ? "False"
            : undefined,
      };

      setEdges((eds) => {
        // Remove existing edge with same source and sourceHandle to avoid duplicates
        const filteredEdges = eds.filter(
          (edge) =>
            !(edge.source === sourceId && edge.sourceHandle === sourceHandle)
        );
        return [...filteredEdges, newEdge];
      });
    },
    [setEdges]
  );

  const saveWorkflow = () => {
    // Enhanced workflow logging with detailed node information
    const workflow = {
      nodes: nodes.map((node) => {
        const nodeDetails = {
          id: node.id,
          type: node.type,
          position: node.position,
          data: node.data,
        };

        // Add script file information for action nodes
        if (node.type === "action" && node.data?.selectedScript) {
          try {
            const savedFiles = localStorage.getItem("scriptFiles");
            if (savedFiles) {
              const files = JSON.parse(savedFiles);
              const selectedScript = files.find(
                (file: ScriptFile) => file.id === node.data.selectedScript
              );
              if (selectedScript) {
                // Generate blob URL for the script content

                const codeLink = `${window.location.origin}/raw/${selectedScript.id}`;

                nodeDetails.data = {
                  ...nodeDetails.data,
                  scriptFile: {
                    id: selectedScript.id,
                    name: selectedScript.name,
                    language: selectedScript.language,
                    source:
                      selectedScript.source === "upload"
                        ? "Uploaded File"
                        : "Written in Editor",
                    lastModified: selectedScript.lastModified,
                    codeLink: codeLink,
                  },
                };

                // Clean up blob URL after delay
                setTimeout(() => {
                  URL.revokeObjectURL(codeLink);
                }, 300000);
              }
            }
          } catch (error) {
            console.error("Error loading script file details:", error);
          }
        }

        return nodeDetails;
      }),
      edges: edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
        type: edge.type,
        label: edge.label,
        style: edge.style,
      })),
      timestamp: new Date().toISOString(),
      totalNodes: nodes.length,
      totalEdges: edges.length,
    };

    console.log(
      "🌊 Complete Workflow Details Saved:",
      JSON.stringify(workflow, null, 2)
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-workflow-void via-workflow-midnight to-workflow-deep dark:from-workflow-void dark:via-workflow-midnight dark:to-workflow-deep overflow-hidden">
      <div className="w-full h-screen bg-bg-card dark:bg-bg-card backdrop-blur-xl border border-borders-primary/20 dark:border-borders-primary/20 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="w-[22%] absolute right-6 top-4 z-50 shadow-lg">
          <div className="h-14 bg-bg-secondary/20 dark:bg-bg-secondary/20 backdrop-blur-lg border-2 border-borders-active/30 dark:border-borders-active/30 flex items-center justify-between px-6 shadow-lg rounded-3xl">
            <div className="w-full flex items-center justify-between space-x-6">
              <div className="flex items-center space-x-3">
                <div className="">
                  <div className="text-sm text-text-secondary dark:text-text-secondary">
                    {nodes.length} nodes
                  </div>
                  <div className="text-sm text-text-secondary dark:text-text-secondary">
                    {edges.length} connections
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Tooltip>
                  <TooltipTrigger onClick={() => setShowImportDialog(true)}>
                    <FileInput className="text-gray-900 dark:text-gray-900 bg-gray-300 dark:bg-gray-300 w-8 h-8 p-2 transition-transform duration-200 ease-in-out hover:scale-125 rounded-full" />
                  </TooltipTrigger>
                  <TooltipContent className="bg-bg-card dark:bg-bg-card text-text-primary dark:text-text-primary text-sm">
                    <p>Import Workflow</p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger
                    onClick={() => setShowCredentialVault(!showCredentialVault)}
                  >
                    <Key className="text-gray-900 dark:text-gray-900 bg-gray-300 dark:bg-gray-300 w-8 h-8 p-2 transition-transform duration-200 ease-in-out hover:scale-125 rounded-full" />
                  </TooltipTrigger>
                  <TooltipContent className="bg-bg-card dark:bg-bg-card text-text-primary dark:text-text-primary text-sm">
                    <p>Credentials</p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger>
                    <CircleUserRound className="text-gray-900 dark:text-gray-900 bg-gray-300 dark:bg-gray-300 w-8 h-8 p-2 transition-transform duration-200 ease-in-out hover:scale-125 rounded-full" />
                  </TooltipTrigger>
                  <TooltipContent className="bg-bg-card dark:bg-bg-card text-text-primary dark:text-text-primary text-sm">
                    <p>Profile</p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger onClick={() => toggleTheme()}>
                    {isDark ? (
                      <Sun className="text-gray-900 dark:text-gray-900 bg-gray-300 dark:bg-gray-300 w-8 h-8 p-2 transition-transform duration-200 ease-in-out hover:scale-125 rounded-full" />
                    ) : (
                      <Moon className="text-gray-900 dark:text-gray-900 bg-gray-300 dark:bg-gray-300 w-8 h-8 p-2 transition-transform duration-200 ease-in-out hover:scale-125 rounded-full" />
                    )}
                  </TooltipTrigger>
                  <TooltipContent className="bg-bg-card dark:bg-bg-card text-text-primary dark:text-text-primary text-sm">
                    <p>{isDark ? "Light Mode" : "Dark Mode"}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="h-[calc(100%)] flex">
          <LeftSidebar onSaveWorkflow={saveWorkflow} />

          <div
            className="flex-1 bg-gradient-to-br from-workflow-void/50 via-workflow-midnight/30 to-workflow-deep/40 dark:from-workflow-void/50 dark:via-workflow-midnight/30 dark:to-workflow-deep/40 rounded-3xl"
            ref={reactFlowWrapper}
          >
            {/* Canvas background effects */}
            <div className="absolute inset-0 bg-gradient-to-tr from-workflow-royal/5 via-transparent to-workflow-nebula/3 dark:from-workflow-royal/5 dark:via-transparent dark:to-workflow-nebula/3 pointer-events-none" />
            <div
              className="absolute top-1/4 right-1/3 w-64 h-64 bg-workflow-aurora/5 dark:bg-workflow-aurora/5 rounded-full blur-3xl animate-pulse-glow"
              style={{ animationDelay: "2s" }}
            />

            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onInit={handleReactFlowInit}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onNodeClick={onNodeClick}
              onEdgeClick={onEdgeClick}
              onPaneClick={onPaneClick}
              nodeTypes={nodeTypes}
              fitView
              className="bg-transparent"
              defaultEdgeOptions={{
                style: {
                  stroke: "#dedede",
                  strokeWidth: 2.5,
                  filter: "drop-shadow(0 0 4px rgba(179, 115, 231, 0.3))",
                },
                type: "smoothstep",
              }}
            >
              <Controls className="bg-gradient-to-br from-workflow-deep/90 via-workflow-royal/80 to-workflow-nebula/70 dark:from-workflow-deep/90 dark:via-workflow-royal/80 dark:to-workflow-nebula/70 backdrop-blur-xl border border-borders-primary/30 dark:border-borders-primary/30 rounded-2xl shadow-2xl shadow-workflow-royal/20 dark:shadow-workflow-royal/20" />
              <Background
                color="#ffffff"
                gap={20}
                size={1}
                style={{
                  backgroundColor: "#080013",
                  opacity: 0.5,
                }}
              />
            </ReactFlow>

            {/* Enhanced Canvas Overlay Info */}
            {nodes.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center relative">
                  {/* Glow effect behind the icon */}
                  <div className="absolute inset-0 bg-gradient-to-r from-workflow-royal/20 via-workflow-nebula/20 to-workflow-aurora/20 dark:from-workflow-royal/20 dark:via-workflow-nebula/20 dark:to-workflow-aurora/20 rounded-full blur-2xl scale-150"></div>

                  <div
                    className="w-16 h-16 bg-gradient-to-br from-workflow-royal/40 via-workflow-nebula/30 to-workflow-aurora/20 dark:from-workflow-royal/40 dark:via-workflow-nebula/30 dark:to-workflow-aurora/20 
                                rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-sm 
                                border border-borders-primary/30 dark:border-borders-primary/30 shadow-2xl shadow-workflow-royal/20 dark:shadow-workflow-royal/20 relative z-10"
                  >
                    <svg
                      className="w-8 h-8 text-workflow-aurora dark:text-workflow-aurora"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                      />
                    </svg>
                  </div>

                  <h3 className="text-lg font-semibold bg-gradient-to-r from-text-primary via-workflow-aurora to-text-secondary dark:from-text-primary dark:via-workflow-aurora dark:to-text-secondary bg-clip-text text-transparent dark:text-transparent mb-3">
                    Start Building Your Workflow
                  </h3>
                  <p className="text-sm text-text-tertiary dark:text-text-tertiary max-w-md">
                    Drag components from the sidebar to create intelligent
                    automation workflows
                  </p>

                  {/* Animated hint */}
                  <div className="mt-6 flex items-center justify-center space-x-2 text-workflow-nebula/60 dark:text-workflow-nebula/60">
                    <div className="w-1 h-1 bg-workflow-nebula dark:bg-workflow-nebula rounded-full animate-pulse"></div>
                    <span className="text-xs font-medium">
                      Try the AI Generator for quick start
                    </span>
                    <div
                      className="w-1 h-1 bg-workflow-nebula dark:bg-workflow-nebula rounded-full animate-pulse"
                      style={{ animationDelay: "0.5s" }}
                    ></div>
                  </div>
                </div>
              </div>
            )}

            {/* Enhanced AI Automation Floating Button */}
            <GenieButton onClick={() => setShowAIGenerator(true)} />
          </div>

          <RightSidebar
            selectedNode={selectedNode}
            selectedEdge={selectedEdge}
            onUpdateNode={updateNodeData}
            onUpdateEdge={updateEdgeData}
            onDeleteNode={deleteNode}
            onDeleteEdge={deleteEdge}
            onSaveWorkflow={saveWorkflow}
            onCreateEdge={handleCreateEdge}
            nodes={nodes}
            open={sidebarOpen}
            onOpenChange={(open) => {
              setSidebarOpen(open);
              if (!open) {
                setSelectedNode(null);
                setSelectedEdge(null);
              }
            }}
          />
        </div>
      </div>

      {/* Import Workflow Dialog */}
      <ImportWorkflowDialog
        isOpen={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        onImport={importWorkflow}
      />

      {/* Credential Vault */}
      {showCredentialVault && (
        <CredentialVault onClose={() => setShowCredentialVault(false)} />
      )}

      {/* AI Workflow Generator */}
      <AIWorkflowGenerator
        isOpen={showAIGenerator}
        onClose={() => setShowAIGenerator(false)}
        onGenerate={importWorkflow}
      />
    </div>
  );
};

export const WorkflowBuilder = () => {
  return (
    <ReactFlowProvider>
      <WorkflowBuilderContent />
    </ReactFlowProvider>
  );
};
