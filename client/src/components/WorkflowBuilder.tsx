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
import { CircleUserRound, FileInput, Key } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CredentialVault } from "./CredentialVault";

const nodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  decision: DecisionNode,
};

const WorkflowBuilderContent = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);
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

  const handleCloseRightSidebar = () => {
    setSelectedNode(null);
    setSelectedEdge(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-workflow-void via-workflow-midnight to-workflow-deep overflow-hidden">
      <div className="w-full h-screen bg-bg-card backdrop-blur-xl border border-borders-primary/20 shadow-2xl overflow-hidden">
        {/* Enhanced Header */}
        <div className="h-14 bg-gradient-to-r from-workflow-void/80 via-workflow-deep/50 to-workflow-void/80 backdrop-blur-lg border-b border-borders-primary/30 flex items-center justify-between px-6 shadow-lg">
          <div className="flex items-center space-x-4">
            <div className="w-8 h-8 bg-gradient-to-br from-workflow-royal via-workflow-nebula to-workflow-royal rounded-xl flex items-center justify-center shadow-lg shadow-workflow-royal/30">
              <svg
                className="w-5 h-5 text-workflow-whisper"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold bg-gradient-to-r from-text-primary via-workflow-aurora to-text-secondary bg-clip-text text-transparent">
                Workflow Studio
              </h1>
              <p className="text-sm text-text-tertiary">
                Design and automate your intelligent workflows
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-3">
              <div className="px-3 py-1.5 bg-gradient-to-r from-workflow-royal/20 to-workflow-nebula/20 backdrop-blur-sm rounded-lg border border-borders-secondary/40">
                <div className="text-sm text-text-secondary">
                  {nodes.length} nodes • {edges.length} connections
                </div>
              </div>
              {/* <div className="flex items-center space-x-2 px-3 py-1.5 bg-gradient-to-r from-status-online/20 to-status-online/10 backdrop-blur-sm rounded-lg border border-status-online/30">
                <div className="w-2 h-2 bg-status-online rounded-full animate-pulse-glow"></div>
                <span className="text-sm text-status-online font-medium">
                  Live
                </span>
              </div> */}
            </div>
            {/* <button
              onClick={() => setShowImportDialog(true)}
              className="px-4 py-2 text-sm bg-gradient-to-r from-ai-primary/20 via-ai-secondary/20 to-ai-accent/20 
                       hover:from-ai-primary/30 hover:via-ai-secondary/30 hover:to-ai-accent/30 
                       border border-ai-primary/40 hover:border-ai-secondary/60
                       text-text-secondary hover:text-text-primary 
                       rounded-lg transition-all duration-300 ease-out backdrop-blur-sm
                       hover:shadow-lg hover:shadow-ai-primary/20
                       transform hover:scale-[1.02] hover:-translate-y-0.5"
            >
              Import JSON
            </button> */}
            <div className="flex gap-4 py-2 px-4 border-2 border-borders-active/50 rounded-full">
              <Tooltip>
                <TooltipTrigger onClick={() => setShowImportDialog(true)}>
                  <FileInput className="text-text-primary w-4 h-4 transition-transform duration-200 ease-in-out hover:scale-125" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Import Workflow</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger
                  onClick={() => setShowCredentialVault(!showCredentialVault)}
                >
                  <Key className="text-text-primary w-4 h-4 transition-transform duration-200 ease-in-out hover:scale-125" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Credentials</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger>
                  <CircleUserRound className="text-text-primary w-4 h-4 transition-transform duration-200 ease-in-out hover:scale-125" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Profile</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
        {/* Enhanced Main Content */}
        <div className="h-[calc(100%-3.5rem)] flex">
          <LeftSidebar onSaveWorkflow={saveWorkflow} />

          <div
            className="flex-1 bg-gradient-to-br from-workflow-void/50 via-workflow-midnight/30 to-workflow-deep/40"
            ref={reactFlowWrapper}
          >
            {/* Canvas background effects */}
            <div className="absolute inset-0 bg-gradient-to-tr from-workflow-royal/5 via-transparent to-workflow-nebula/3 pointer-events-none" />
            <div
              className="absolute top-1/4 right-1/3 w-64 h-64 bg-workflow-aurora/5 rounded-full blur-3xl animate-pulse-glow"
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
              <Controls className="bg-gradient-to-br from-workflow-deep/90 via-workflow-royal/80 to-workflow-nebula/70 backdrop-blur-xl border border-borders-primary/30 rounded-2xl shadow-2xl shadow-workflow-royal/20" />
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
                  <div className="absolute inset-0 bg-gradient-to-r from-workflow-royal/20 via-workflow-nebula/20 to-workflow-aurora/20 rounded-full blur-2xl scale-150"></div>

                  <div
                    className="w-16 h-16 bg-gradient-to-br from-workflow-royal/40 via-workflow-nebula/30 to-workflow-aurora/20 
                                rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-sm 
                                border border-borders-primary/30 shadow-2xl shadow-workflow-royal/20 relative z-10"
                  >
                    <svg
                      className="w-8 h-8 text-workflow-aurora"
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

                  <h3 className="text-lg font-semibold bg-gradient-to-r from-text-primary via-workflow-aurora to-text-secondary bg-clip-text text-transparent mb-3">
                    Start Building Your Workflow
                  </h3>
                  <p className="text-sm text-text-tertiary max-w-md">
                    Drag components from the sidebar to create intelligent
                    automation workflows
                  </p>

                  {/* Animated hint */}
                  <div className="mt-6 flex items-center justify-center space-x-2 text-workflow-nebula/60">
                    <div className="w-1 h-1 bg-workflow-nebula rounded-full animate-pulse"></div>
                    <span className="text-xs font-medium">
                      Try the AI Generator for quick start
                    </span>
                    <div
                      className="w-1 h-1 bg-workflow-nebula rounded-full animate-pulse"
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
            onClose={handleCloseRightSidebar}
            onSaveWorkflow={saveWorkflow}
            onCreateEdge={handleCreateEdge}
            nodes={nodes}
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
