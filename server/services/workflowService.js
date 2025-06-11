const openaiService = require("./openaiService");

class WorkflowService {
  async generateWorkflow(prompt) {
    try {
      const result = await openaiService.generateWorkflow(prompt);

      if (result.success) {
        // Parse the AI response as JSON
        let workflowData;
        try {
          workflowData = JSON.parse(result.content);
        } catch (parseError) {
          console.error("Failed to parse AI response as JSON:", parseError);
          console.error("AI Response:", result.content);
          return this.generateFallbackWorkflowResult(prompt);
        }

        // Validate the generated workflow structure
        if (!this.isValidWorkflowStructure(workflowData)) {
          console.error("Invalid workflow structure from AI");
          return this.generateFallbackWorkflowResult(prompt);
        }

        // Add timestamp
        workflowData.timestamp = new Date().toISOString();

        return {
          success: true,
          workflow: workflowData,
        };
      }
    } catch (error) {
      console.error("Error generating workflow with AI:", error);

      // Check for specific OpenAI errors
      if (error.message === "API quota exceeded") {
        throw new Error(
          "Azure OpenAI API quota has been exceeded. Please check your subscription."
        );
      }

      if (error.message === "Invalid API key") {
        throw new Error("Azure OpenAI API key is invalid or expired.");
      }
    }

    // Return fallback workflow
    return this.generateFallbackWorkflowResult(prompt);
  }

  generateFallbackWorkflowResult(prompt) {
    return {
      success: false,
      workflow: this.generateFallbackWorkflow(prompt),
    };
  }

  generateFallbackWorkflow(prompt) {
    const timestamp = Date.now();

    return {
      nodes: [
        {
          id: `trigger-${timestamp}`,
          type: "trigger",
          position: { x: 100, y: 100 },
          data: {
            label: "Start",
            description: "Workflow trigger",
            type: "manual",
            parameters: [],
          },
          measured: { width: 160, height: 79 },
          selected: false,
          dragging: false,
        },
        {
          id: `action-${timestamp + 1}`,
          type: "action",
          position: { x: 350, y: 100 },
          data: {
            label: "Process Task",
            description: `Action based on: ${prompt}`,
            type: "script",
            scriptType: "Python Script",
            executionMode: "local",
            parameters: [
              {
                id: `param-${timestamp}`,
                name: "input_data",
                type: "string",
                description: "Input data for processing",
              },
            ],
          },
          measured: { width: 160, height: 79 },
          selected: false,
          dragging: false,
        },
        {
          id: `action-${timestamp + 2}`,
          type: "action",
          position: { x: 600, y: 100 },
          data: {
            label: "Send Notification",
            type: "email",
            description: "Send completion notification",
            executionMode: "local",
            serverAddress: "",
            selectedCredential: "",
          },
          measured: { width: 160, height: 79 },
          selected: false,
          dragging: false,
        },
      ],
      edges: [
        {
          id: `edge-${timestamp}`,
          source: `trigger-${timestamp}`,
          target: `action-${timestamp + 1}`,
          type: "smoothstep",
          style: { stroke: "#64748b", strokeWidth: 2 },
        },
        {
          id: `edge-${timestamp + 1}`,
          source: `action-${timestamp + 1}`,
          target: `action-${timestamp + 2}`,
          type: "smoothstep",
          style: { stroke: "#64748b", strokeWidth: 2 },
        },
      ],
      timestamp: new Date().toISOString(),
    };
  }

  validateWorkflow(workflow) {
    const errors = [];

    // Validate nodes
    if (!workflow.nodes || !Array.isArray(workflow.nodes)) {
      errors.push("Nodes array is required");
    } else {
      workflow.nodes.forEach((node, index) => {
        if (!node.id) errors.push(`Node ${index}: ID is required`);
        if (!node.type) errors.push(`Node ${index}: Type is required`);
        if (!node.position) errors.push(`Node ${index}: Position is required`);

        // Validate node data based on type
        if (node.type === "action" && node.data) {
          if (node.data.type === "script" && !node.data.scriptType) {
            errors.push(
              `Node ${index}: Script type is required for script actions`
            );
          }
        }

        if (node.type === "decision" && node.data) {
          if (!node.data.condition) {
            errors.push(
              `Node ${index}: Condition is required for decision nodes`
            );
          }
        }
      });
    }

    // Validate edges
    if (!workflow.edges || !Array.isArray(workflow.edges)) {
      errors.push("Edges array is required");
    } else {
      workflow.edges.forEach((edge, index) => {
        if (!edge.id) errors.push(`Edge ${index}: ID is required`);
        if (!edge.source) errors.push(`Edge ${index}: Source is required`);
        if (!edge.target) errors.push(`Edge ${index}: Target is required`);

        // Validate that source and target nodes exist
        if (workflow.nodes) {
          const sourceExists = workflow.nodes.some(
            (node) => node.id === edge.source
          );
          const targetExists = workflow.nodes.some(
            (node) => node.id === edge.target
          );

          if (!sourceExists) {
            errors.push(
              `Edge ${index}: Source node '${edge.source}' does not exist`
            );
          }
          if (!targetExists) {
            errors.push(
              `Edge ${index}: Target node '${edge.target}' does not exist`
            );
          }
        }
      });
    }

    // Validate workflow connectivity
    if (workflow.nodes && workflow.nodes.length > 0) {
      const hasStartNode = workflow.nodes.some(
        (node) => node.type === "trigger"
      );
      if (!hasStartNode) {
        errors.push("Workflow must have at least one trigger node");
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  isValidWorkflowStructure(workflowData) {
    return (
      workflowData &&
      workflowData.nodes &&
      Array.isArray(workflowData.nodes) &&
      workflowData.edges &&
      Array.isArray(workflowData.edges)
    );
  }

  // Additional utility methods for workflow management
  getWorkflowStatistics(workflow) {
    if (!this.isValidWorkflowStructure(workflow)) {
      return null;
    }

    const nodeTypes = {};
    workflow.nodes.forEach((node) => {
      nodeTypes[node.type] = (nodeTypes[node.type] || 0) + 1;
    });

    return {
      totalNodes: workflow.nodes.length,
      totalEdges: workflow.edges.length,
      nodeTypes: nodeTypes,
      hasDecisionNodes: workflow.nodes.some((node) => node.type === "decision"),
      complexity: this.calculateComplexity(workflow),
    };
  }

  calculateComplexity(workflow) {
    // Simple complexity calculation based on nodes and decision points
    const baseComplexity = workflow.nodes.length;
    const decisionNodes = workflow.nodes.filter(
      (node) => node.type === "decision"
    ).length;
    const parallelPaths = this.countParallelPaths(workflow);

    return baseComplexity + decisionNodes * 2 + parallelPaths;
  }

  countParallelPaths(workflow) {
    // Count nodes with multiple outgoing edges (indicating parallel execution)
    const outgoingCounts = {};

    workflow.edges.forEach((edge) => {
      outgoingCounts[edge.source] = (outgoingCounts[edge.source] || 0) + 1;
    });

    return Object.values(outgoingCounts).filter((count) => count > 1).length;
  }
}

module.exports = new WorkflowService();
