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

import { RightSidebar } from "./RightSidebar/RightSidebar";
import { TriggerNode } from "../nodes/TriggerNode";
import { ActionNode } from "../nodes/ActionNode";
import { LeftSidebar } from "./LeftSidebar";
import { Edge, NodeData, ScriptFile, WorkflowData } from "@/utils/types";
import { ImportWorkflowDialog } from "./ImportWorkflowDialog";
import { DecisionNode } from "../nodes/DecisionNode";
import { AIWorkflowGenerator } from "./AIWorkflowGenerator";
import GenieButton from "../GenieButton";
import { Vault } from "../vault/Vault";
import { useTheme } from "@/provider/theme-provider";
import Header from "./Header";
import { toast } from "@/hooks/use-toast";
import { createWorkflow, updateWorkflow } from "@/lib/actions/workflow";
import { useAuth } from "@clerk/clerk-react";

const nodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  decision: DecisionNode,
};

import { MobileRestrictedMessage } from "./MobileRestrictedMessage";
import { useIsMobile } from "@/hooks/use-mobile";

const WorkflowBuilderContent = ({
  initialData = null,
  workflowId = null,
}: {
  initialData: WorkflowData | null;
  workflowId?: string | null;
}) => {
  const { isDark } = useTheme();
  const { getToken, isSignedIn } = useAuth();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [workflowName, setWorkflowName] = useState("");
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showVault, setShowVault] = useState(false);
  const [showAIGenerator, setShowAIGenerator] = useState(false);
  const [reactFlowInstance, setReactFlowInstance] =
    useState<ReactFlowInstance | null>(null);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  // Load workflow from localStorage on component mount
  useEffect(() => {
    let dataToLoad = null;
    if (initialData) {
      dataToLoad = initialData;
    } else {
      const savedWorkflow = localStorage.getItem("currentWorkflow");
      if (savedWorkflow) {
        try {
          dataToLoad = JSON.parse(savedWorkflow);
        } catch (error) {
          console.error("Error loading saved workflow:", error);
        }
      }
    }

    if (dataToLoad) {
      const {
        nodes: savedNodes = [],
        edges: savedEdges = [],
        name = "",
      } = dataToLoad;

      setNodes(savedNodes);
      setEdges(savedEdges);
      setWorkflowName(name);
    }
  }, [initialData, setNodes, setEdges, setWorkflowName]);

  // Auto-save to localStorage whenever nodes or edges change
  useEffect(() => {
    const workflowData = {
      name: workflowName,
      nodes,
      edges,
      timestamp: new Date().toISOString(),
    };
    localStorage.setItem("currentWorkflow", JSON.stringify(workflowData));
  }, [nodes, edges, workflowName]);

  useEffect(() => {
    setSidebarOpen(!!(selectedNode || selectedEdge));
  }, [selectedNode, selectedEdge]);

  const importWorkflow = (workflowData: WorkflowData) => {
    try {
      const { name, nodes: importedNodes, edges: importedEdges } = workflowData;

      if (importedNodes && Array.isArray(importedNodes)) {
        if (importedNodes && Array.isArray(importedNodes)) {
          setNodes(importedNodes);
        }
      }

      if (importedEdges && Array.isArray(importedEdges)) {
        setEdges(importedEdges);
      }

      setWorkflowName(name || "");

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
    [setEdges],
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
        event.dataTransfer.getData("application/nodedata"),
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
    [reactFlowInstance, setNodes],
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
        }),
      );
    },
    [setNodes],
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
        }),
      );
    },
    [setEdges],
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((node) => node.id !== nodeId));
      setEdges((eds) =>
        eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
      );
      setSelectedNode(null);
    },
    [setNodes, setEdges],
  );

  const deleteEdge = useCallback(
    (edgeId: string) => {
      setEdges((eds) => eds.filter((edge) => edge.id !== edgeId));
      setSelectedEdge(null);
    },
    [setEdges],
  );

  const handleReactFlowInit = useCallback(
    (reactFlowInstance: ReactFlowInstance) => {
      setReactFlowInstance(reactFlowInstance);
    },
    [],
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
            !(edge.source === sourceId && edge.sourceHandle === sourceHandle),
        );
        return [...filteredEdges, newEdge];
      });
    },
    [setEdges],
  );

  const saveWorkflow = async () => {
    if (!workflowName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a workflow name.",
        variant: "destructive",
      });
      return;
    }

    const workflow = {
      name: workflowName,
      nodes: nodes.map((node) => {
        const nodeDetails = {
          id: node.id,
          type: node.type,
          position: node.position,
          data: { ...node.data },
        };

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
    };

    try {
      if (!isSignedIn) {
        toast({
          title: "Error",
          description: "Authentication required. Please sign in.",
          variant: "destructive",
        });
        return;
      }
      const clerkToken = await getToken();
      let response: any;
      if (workflowId) {
        // Update existing workflow
        response = await updateWorkflow(workflowId, workflow, clerkToken);
        toast({
          title: "Workflow Updated",
          description: "Your workflow has been updated successfully.",
        });
      } else {
        // Create new workflow
        response = await createWorkflow(workflow, clerkToken);
        toast({
          title: "Workflow Created",
          description: "Your workflow has been created successfully.",
        });
        // If we get a workflow ID back, we could update the URL or store it
        if (response?.data?.id) {
          // Optionally update the browser URL to reflect the new workflow ID
          window.history.replaceState(
            null,
            "",
            `/workflow/${response.data.id}`,
          );
        }
      }

      // Also save to localStorage for backup
      const workflowWithMetadata = {
        ...workflow,
        timestamp: new Date().toISOString(),
        totalNodes: nodes.length,
        totalEdges: edges.length,
        id: response?.data?.id || workflowId,
      };
      localStorage.setItem(
        "currentWorkflow",
        JSON.stringify(workflowWithMetadata),
      );

      console.log(
        "🌊 Complete Workflow Details Saved:",
        JSON.stringify(workflowWithMetadata, null, 2),
      );
    } catch (error) {
      console.error("Failed to save workflow:", error);
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to save workflow. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-workflow-void overflow-hidden">
      <div className="w-full h-screen bg-transparent">
        {/* Header */}
        <Header
          nodes={nodes.length}
          edges={edges.length}
          setShowVault={setShowVault}
          showVault={showVault}
          setShowImportDialog={setShowImportDialog}
        />

        {/* Main Content */}
        <div className="w-full h-[calc(100%)] flex">
          <LeftSidebar
            onSaveWorkflow={saveWorkflow}
            workflowName={workflowName}
            setWorkflowName={setWorkflowName}
          />

          <div
            className="flex-1 h-[calc(100%-1rem)] bg-gray-100 dark:bg-gray-900/30 rounded-3xl relative overflow-hidden ml-4 my-2"
            ref={reactFlowWrapper}
          >
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
              defaultEdgeOptions={{
                style: {
                  stroke: isDark ? "#4B5563" : "#9CA3AF",
                  strokeWidth: 2,
                },
                type: "smoothstep",
              }}
            >
              <Controls className="border border-gray-200 dark:border-gray-800 rounded-lg shadow-sm [&>button]:bg-gray-200 dark:[&>button]:bg-gray-800 [&>button]:text-gray-900 dark:[&>button]:text-gray-100" />
              <Background
                color={isDark ? "#363636" : "#b3b3b3"}
                gap={30}
                size={2}
                className=""
              />
            </ReactFlow>

            {/* Enhanced Canvas Overlay Info */}
            {nodes.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center relative">
                  <div className="w-16 h-16 bg-white dark:bg-gray-800 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-gray-200 dark:border-gray-700 shadow-sm relative z-10">
                    <svg
                      className="w-8 h-8 text-purple-600 dark:text-purple-400"
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

                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
                    Start Building Your Workflow
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md">
                    Drag components from the sidebar to create intelligent
                    automation workflows
                  </p>
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
            edges={edges}
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
      <Vault isOpen={showVault} setIsOpen={setShowVault} />

      {/* AI Workflow Generator */}
      <AIWorkflowGenerator
        isOpen={showAIGenerator}
        onClose={() => setShowAIGenerator(false)}
        onGenerate={importWorkflow}
      />
    </div>
  );
};

export const WorkflowBuilder = ({
  initialData,
  workflowId = null,
}: {
  initialData: WorkflowData | null;
  workflowId?: string | null;
}) => {
  const isMobile = useIsMobile();

  if (isMobile) {
    return <MobileRestrictedMessage />;
  }

  return (
    <ReactFlowProvider>
      <WorkflowBuilderContent
        initialData={initialData}
        workflowId={workflowId}
      />
    </ReactFlowProvider>
  );
};
