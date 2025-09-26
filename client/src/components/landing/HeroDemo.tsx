import React, { useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  useNodesState,
  Handle,
  Position,
  ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useTheme } from "@/provider/theme-provider";
import { Editor } from "@monaco-editor/react";
import {
  Copy,
  RotateCcw,
  Save,
  FolderOpen,
  Menu,
  Code2,
  Square,
} from "lucide-react";

// Custom node component with dual handles
const CustomNode = ({ data }) => {
  return (
    <div
      className={`px-6 py-4 shadow-lg rounded-lg border-2 text-center min-w-[200px] ${data.className}`}
    >
      <Handle type="target" position={Position.Top} className="w-4 h-4" />
      <div className="text-base font-medium">{data.label}</div>
      <Handle type="source" position={Position.Bottom} className="w-4 h-4" />
      {data.showSideHandles && (
        <>
          <Handle
            id="true"
            type="source"
            position={Position.Right}
            className="w-4 h-4"
          />
          <Handle
            id="false"
            type="source"
            position={Position.Left}
            className="w-4 h-4"
          />
        </>
      )}
    </div>
  );
};

// Define node types
const nodeTypes = {
  custom: CustomNode,
};

const ServerMonitoringWorkflow = () => {
  const [reactFlowInstance, setReactFlowInstance] =
    useState<ReactFlowInstance | null>(null);
  const { isDark } = useTheme();
  const [code, setCode] = useState(
    `const workflow = {
      "nodes": [{
          "id": "trigger-001",
          "type": "trigger",
          "data": { "label": "Start" }
        },
        {
          "id": "action-001",
          "type": "action",
          "data": { "label": "Send Email" }
        }],
        "edges": [{
          "source": "trigger-001",
          "target": "action-001"
        }]
      };`
  );
  const initialNodes = useMemo(
    () => [
      // Start trigger
      {
        id: "scheduler",
        position: { x: -50, y: 50 },
        data: {
          label: "Health Check Scheduler",
          className: "bg-blue-100 border-blue-300 text-blue-800",
        },
        type: "custom",
      },

      // Resource monitoring (combined)
      {
        id: "resource-monitor",
        position: { x: 50, y: 200 },
        data: {
          label: "Monitor CPU & Memory",
          className: "bg-purple-100 border-purple-300 text-purple-800",
        },
        type: "custom",
      },

      // Combined threshold check
      {
        id: "resource-threshold",
        position: { x: 50, y: 350 },
        data: {
          label: "Usage > Threshold?",
          className: "bg-orange-100 border-orange-300 text-orange-800",
          showSideHandles: true,
        },
        type: "custom",
      },

      // OK email
      {
        id: "ok-email",
        position: { x: 350, y: 350 },
        data: {
          label: "Send OK Email",
          className: "bg-yellow-100 border-yellow-300 text-yellow-800",
        },
        type: "custom",
      },

      // Alert email
      {
        id: "alert-email",
        position: { x: 50, y: 500 },
        data: {
          label: "Send Alert Email",
          className: "bg-yellow-100 border-yellow-300 text-yellow-800",
        },
        type: "custom",
      },

      // Cleanup script execution
      {
        id: "cleanup-script",
        position: { x: 30, y: 650 },
        data: {
          label: "Execute Cleanup Scripts",
          className: "bg-indigo-100 border-indigo-300 text-indigo-800",
        },
        type: "custom",
      },

      // Final status check
      {
        id: "final-check",
        position: { x: 50, y: 800 },
        data: {
          label: "Verify Resolution",
          className: "bg-teal-100 border-teal-300 text-teal-800",
          showSideHandles: true,
        },
        type: "custom",
      },

      // Success outcome
      {
        id: "success",
        position: { x: 350, y: 800 },
        data: {
          label: "System Healthy",
          className: "bg-green-100 border-green-300 text-green-800",
        },
        type: "custom",
      },

      // Escalation outcome
      {
        id: "escalate",
        position: { x: -250, y: 800 },
        data: {
          label: "Escalate to Admin",
          className: "bg-red-100 border-red-300 text-red-800",
        },
        type: "custom",
      },
    ],
    []
  );

  const [nodes, , onNodesChange] = useNodesState(initialNodes);

  const edges = useMemo(
    () => [
      // Main flow
      {
        id: "e1",
        type: "step",
        source: "scheduler",
        target: "resource-monitor",
        animated: true,
        style: { strokeWidth: 3, stroke: "#3b82f6" },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#3b82f6" },
      },
      {
        id: "e2",
        type: "step",
        source: "resource-monitor",
        target: "resource-threshold",
        animated: true,
        style: { strokeWidth: 3, stroke: "#8b5cf6" },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#8b5cf6" },
      },

      // True path
      {
        id: "e3",
        type: "step",
        source: "resource-threshold",
        target: "alert-email",
        label: "True",
        style: { stroke: "#f97316", strokeWidth: 3 },
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed, color: "#f97316" },
      },
      {
        id: "e4",
        type: "step",
        source: "alert-email",
        target: "cleanup-script",
        animated: true,
        style: { stroke: "#6366f1", strokeWidth: 3 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#6366f1" },
      },

      // False path
      {
        id: "e5",
        type: "step",
        source: "resource-threshold",
        sourceHandle: "true",
        target: "ok-email",
        label: "False",
        style: { stroke: "#10b981", strokeWidth: 3 },
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed, color: "#10b981" },
      },
      {
        id: "e6",
        type: "step",
        source: "ok-email",
        target: "success",
        animated: true,
        style: { strokeWidth: 3, stroke: "#10b981" },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#10b981" },
      },
      {
        id: "e7",
        type: "step",
        source: "cleanup-script",
        target: "final-check",
        animated: true,
        style: { strokeWidth: 3, stroke: "#8b5cf6" },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#8b5cf6" },
      },
      // True path
      {
        id: "e8",
        type: "step",
        source: "final-check",
        sourceHandle: "true",
        target: "success",
        label: "True",
        style: { stroke: "#10b981", strokeWidth: 3 },
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed, color: "#10b981" },
      },
      // False path
      {
        id: "e9",
        type: "step",
        source: "final-check",
        sourceHandle: "false",
        target: "escalate",
        label: "False",
        style: { stroke: "#f97316", strokeWidth: 3 },
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed, color: "#f97316" },
      },
    ],
    []
  );

  return (
    <div className="w-full overflow-hidden rounded-xl border border-gray-300 dark:border-gray-700 relative">
      <div className="w-[90vw] h-[90vh] bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/40 dark:from-slate-900 dark:via-blue-900/30 dark:to-indigo-900/40">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          className="bg-transparent"
          proOptions={{ hideAttribution: true }}
          nodesDraggable={true}
          nodesConnectable={true}
          elementsSelectable={true}
          panOnDrag={true}
          zoomOnScroll={true}
          zoomOnPinch={true}
          zoomOnDoubleClick={true}
          onNodesChange={onNodesChange}
          minZoom={0.5}
          maxZoom={1.5}
          defaultViewport={{ x: 350, y: 0, zoom: 0.7 }}
          onInit={(instance) => setReactFlowInstance(instance)}
        >
          <Controls
            className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-gray-200/50 dark:border-gray-800 rounded-lg shadow-lg"
            showInteractive={true}
            onFitView={() => {
              reactFlowInstance?.setViewport({ x: 350, y: 0, zoom: 0.7 });
            }}
          />
          <Background
            color={`${isDark ? "#ffffff" : "#000000"}`}
            gap={16}
            size={1}
            className="opacity-80 dark:opacity-70"
            style={{ backgroundColor: "#transparent" }}
          />
        </ReactFlow>
      </div>

      {/* Legend */}
      <div className="absolute top-4 left-4 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm rounded-lg p-4 shadow-lg border border-gray-200/50 dark:border-gray-700/50">
        <h3 className="font-semibold text-sm mb-2 text-gray-800 dark:text-gray-200">
          Workflow Legend
        </h3>
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-100 border border-blue-300 rounded"></div>
            <span className="text-gray-700 dark:text-gray-300">
              Trigger/Scheduler
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-100 border border-green-300 rounded"></div>
            <span className="text-gray-700 dark:text-gray-300">
              Health Check
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-purple-100 border border-purple-300 rounded"></div>
            <span className="text-gray-700 dark:text-gray-300">
              Resource Monitor
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-orange-100 border border-orange-300 rounded"></div>
            <span className="text-gray-700 dark:text-gray-300">
              Decision Point
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-indigo-100 border border-indigo-300 rounded"></div>
            <span className="text-gray-700 dark:text-gray-300">
              Script Execution
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-100 border border-red-300 rounded"></div>
            <span className="text-gray-700 dark:text-gray-300">
              Alert/Escalation
            </span>
          </div>
        </div>
      </div>

      <div className="w-[30%] h-[40%] rounded-lg absolute top-4 right-4 bg-gray-100 dark:bg-black overflow-hidden border border-gray-700 shadow-md">
        {/* Top Bar */}
        <div className="flex items-center justify-between bg-gray-100 dark:bg-gray-950 px-4 py-2 border-b border-gray-700">
          <div className="flex items-center space-x-3">
            {/* Traffic Light Buttons */}
            <div className="flex space-x-2">
              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
              <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            </div>

            {/* File Name */}
            <span className="text-black dark:text-white font-medium">
              Workflow.json
            </span>
          </div>

          {/* More Options */}
          <Menu className="w-5 h-5 text-gray-900 dark:text-gray-400 cursor-pointer hover:text-black dark:hover:text-white" />
        </div>

        {/* Secondary Navigation */}
        <div className="flex items-center bg-gray-200 dark:bg-gray-900 px-4 py-2 space-x-4 border-b border-gray-700">
          <Copy className="w-4 h-4 text-gray-900 dark:text-gray-400 cursor-pointer hover:text-black dark:hover:text-white" />
          <FolderOpen className="w-4 h-4 text-gray-900 dark:text-gray-400 cursor-pointer hover:text-black dark:hover:text-white" />
          <Save className="w-4 h-4 text-gray-900 dark:text-gray-400 cursor-pointer hover:text-black dark:hover:text-white" />
          <RotateCcw className="w-4 h-4 text-gray-900 dark:text-gray-400 cursor-pointer hover:text-black dark:hover:text-white" />
          <Code2 className="w-4 h-4 text-gray-900 dark:text-gray-400 cursor-pointer hover:text-black dark:hover:text-white" />
          <Square className="w-4 h-4 text-gray-900 dark:text-gray-400 cursor-pointer hover:text-black dark:hover:text-white" />
        </div>
        <Editor
          height="100%"
          language="javascript"
          value={code}
          onChange={setCode}
          theme={`${isDark ? "hc-black" : "vs-light"}`}
        />
      </div>
    </div>
  );
};

export default ServerMonitoringWorkflow;
