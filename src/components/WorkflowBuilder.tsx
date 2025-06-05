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
import { NavigationMenu } from "./NavigationMenu";
import { Edge, NodeData, ScriptFile, WorkflowData } from "@/utils/types";
import { ImportWorkflowDialog } from "./ImportWorkflowDialog";

const nodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
};

const WorkflowBuilderContent = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
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
          executionMode: type === "action" ? "local" : undefined,
          serverAddress: "",
          selectedCredential: "",
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white overflow-hidden">
      <div className="w-full h-screen bg-slate-900/50 backdrop-blur-xl border border-slate-700/50 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="h-12 bg-slate-800/80 backdrop-blur-sm border-b border-slate-700/50 flex items-center justify-between px-5 relative z-10">
          <div className="flex items-center space-x-3">
            <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <svg
                className="w-4 h-4 text-white"
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
              <h1 className="text-base font-semibold text-white">
                Workflow Studio
              </h1>
              <p className="text-xs text-slate-400">
                Design and automate your workflows
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className="text-xs text-slate-400">
                {nodes.length} nodes • {edges.length} connections
              </div>
              <div className="w-1 h-1 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-xs text-green-400">Live</span>
            </div>
            <button
              onClick={() => setShowImportDialog(true)}
              className="px-3 py-1.5 text-xs bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-400 hover:text-blue-300 rounded-md transition-all duration-200"
            >
              Import JSON
            </button>
            <NavigationMenu />
          </div>
        </div>

        {/* Main Content */}
        <div className="h-[calc(100%-3rem)] flex">
          <LeftSidebar onSaveWorkflow={saveWorkflow} />

          <div className="flex-1 relative" ref={reactFlowWrapper}>
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
              className="bg-slate-900"
              defaultEdgeOptions={{
                style: { stroke: "#64748b", strokeWidth: 2 },
                type: "smoothstep",
              }}
            >
              <Controls className="bg-slate-800/90 backdrop-blur-sm border border-slate-700/50 rounded-xl shadow-2xl" />
              <Background
                color="#334155"
                gap={16}
                size={0.8}
                style={{ backgroundColor: "#0f172a" }}
              />
            </ReactFlow>

            {/* Canvas Overlay Info */}
            {nodes.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <div className="w-12 h-12 bg-slate-700/50 rounded-full flex items-center justify-center mx-auto mb-3">
                    <svg
                      className="w-6 h-6 text-slate-400"
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
                  <h3 className="text-sm font-medium text-slate-300 mb-2">
                    Start Building Your Workflow
                  </h3>
                  <p className="text-xs text-slate-500">
                    Drag components from the sidebar to get started
                  </p>
                </div>
              </div>
            )}
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
          />
        </div>
      </div>
      {/* Import Workflow Dialog */}
      <ImportWorkflowDialog
        isOpen={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        onImport={importWorkflow}
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
