import React, { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  useNodesState,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useTheme } from "@/provider/theme-provider";

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
  const { isDark } = useTheme();
  const initialNodes = useMemo(
    () => [
      // Start trigger
      {
        id: "scheduler",
        position: { x: 400, y: 50 },
        data: {
          label: "Health Check Scheduler",
          className: "bg-blue-100 border-blue-300 text-blue-800",
        },
        type: "custom",
      },

      // Resource monitoring (combined)
      {
        id: "resource-monitor",
        position: { x: 400, y: 200 },
        data: {
          label: "Monitor CPU & Memory",
          className: "bg-purple-100 border-purple-300 text-purple-800",
        },
        type: "custom",
      },

      // Combined threshold check
      {
        id: "resource-threshold",
        position: { x: 400, y: 350 },
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
        position: { x: 700, y: 350 },
        data: {
          label: "Send OK Email",
          className: "bg-yellow-100 border-yellow-300 text-yellow-800",
        },
        type: "custom",
      },

      // Alert email
      {
        id: "alert-email",
        position: { x: 400, y: 500 },
        data: {
          label: "Send Alert Email",
          className: "bg-yellow-100 border-yellow-300 text-yellow-800",
        },
        type: "custom",
      },

      // Cleanup script execution
      {
        id: "cleanup-script",
        position: { x: 380, y: 650 },
        data: {
          label: "Execute Cleanup Scripts",
          className: "bg-indigo-100 border-indigo-300 text-indigo-800",
        },
        type: "custom",
      },

      // Final status check
      {
        id: "final-check",
        position: { x: 400, y: 800 },
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
        position: { x: 700, y: 800 },
        data: {
          label: "System Healthy",
          className: "bg-green-100 border-green-300 text-green-800",
        },
        type: "custom",
      },

      // Escalation outcome
      {
        id: "escalate",
        position: { x: 100, y: 800 },
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
          fitView
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
          defaultViewport={{ x: 0, y: 0, zoom: 1.0 }}
        >
          <Controls
            className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-gray-200/50 dark:border-gray-800 rounded-lg shadow-lg"
            showInteractive={true}
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
    </div>
  );
};

export default ServerMonitoringWorkflow;
