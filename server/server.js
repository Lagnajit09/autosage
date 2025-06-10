const express = require("express");
const cors = require("cors");
const { OpenAI } = require("openai");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Azure OpenAI client
const openai = new OpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  baseURL: `${process.env.ENDPOINT_URL}openai/deployments/${process.env.DEPLOYMENT_NAME}`,
  defaultQuery: { "api-version": "2024-02-15-preview" },
  defaultHeaders: {
    "api-key": process.env.AZURE_OPENAI_API_KEY,
  },
});

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "OK", message: "Server is running" });
});

// AI Workflow Generator endpoint
app.post("/api/generate-workflow", async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return res.status(400).json({
        error: "Invalid prompt",
        message: "Prompt is required and must be a non-empty string",
      });
    }

    // System prompt to guide the AI in generating workflows
    const systemPrompt = `You are an expert workflow automation designer. Generate a complete workflow JSON object based on the user's description. 

The workflow should follow this structure:
- nodes: Array of workflow nodes (trigger, action, decision)
- edges: Array of connections between nodes

Node types:
1. trigger: Starting point with manual type
2. action: Can be script (Python/Powershell/Shell) or email
3. decision: Conditional branching with true/false paths

Each node should have:
- id: unique identifier (use timestamp-based IDs with a prefix "trigger-", "action-", "decision-")
- type: node type
- position: {x, y} coordinates for canvas placement
- data: node configuration including label, description, parameters, etc.

For script actions, include:
- scriptType: "Python Script" | "Powershell Script" | "Shell Script"
- executionMode: "local" | "remote"
- serverAddress: for remote execution
- selectedCredential: credential object if needed
- parameters: array of input parameters (id, name, type (string, number, boolean), description)

For decision nodes, include:
- condition: the condition to evaluate
- trueLabel: array of node IDs for true path
- falseLabel: array of node IDs for false path

For edges, include:
- id: unique identifier (use timestamp-based IDs with a prefix "edge-")
- source: source node ID
- target: target node ID
- type: edge type (smoothstep)
- style: { stroke: "#64748b", strokeWidth: 2 }

Generate realistic server addresses (like 192.168.1.x or 10.0.0.x), parameter names, and conditions based on the prompt.

Return ONLY a valid JSON object with nodes and edges arrays. Do not include any explanation or markdown formatting.`;

    const completion = await openai.chat.completions.create({
      model: process.env.DEPLOYMENT_NAME,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: `Generate a workflow for: ${prompt}`,
        },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    const aiResponse = completion.choices[0].message.content;

    // Parse the AI response as JSON
    let workflowData;
    try {
      workflowData = JSON.parse(aiResponse);
    } catch (parseError) {
      console.error("Failed to parse AI response as JSON:", parseError);
      console.error("AI Response:", aiResponse);

      // Fallback: Generate a basic workflow
      workflowData = generateFallbackWorkflow(prompt);
    }

    // Validate the generated workflow structure
    if (
      !workflowData.nodes ||
      !Array.isArray(workflowData.nodes) ||
      !workflowData.edges ||
      !Array.isArray(workflowData.edges)
    ) {
      console.error("Invalid workflow structure from AI");
      workflowData = generateFallbackWorkflow(prompt);
    }

    // Add timestamp
    workflowData.timestamp = new Date().toISOString();

    res.json({
      success: true,
      workflow: workflowData,
      message: "Workflow generated successfully",
    });
  } catch (error) {
    console.error("Error generating workflow:", error);

    // Check if it's an OpenAI API error
    if (error.code === "insufficient_quota") {
      return res.status(429).json({
        error: "API quota exceeded",
        message:
          "Azure OpenAI API quota has been exceeded. Please check your subscription.",
      });
    }

    if (error.code === "invalid_api_key") {
      return res.status(401).json({
        error: "Invalid API key",
        message: "Azure OpenAI API key is invalid or expired.",
      });
    }

    // Fallback response
    const fallbackWorkflow = generateFallbackWorkflow(
      req.body.prompt || "automation workflow"
    );

    res.status(200).json({
      success: true,
      workflow: fallbackWorkflow,
      message: "Generated fallback workflow due to AI service unavailability",
      fallback: true,
    });
  }
});

// Generate a fallback workflow when AI fails
function generateFallbackWorkflow(prompt) {
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

// Workflow validation endpoint (optional)
app.post("/api/validate-workflow", (req, res) => {
  try {
    const { workflow } = req.body;

    if (!workflow || typeof workflow !== "object") {
      return res.status(400).json({
        valid: false,
        errors: ["Workflow object is required"],
      });
    }

    const errors = [];

    // Validate nodes
    if (!workflow.nodes || !Array.isArray(workflow.nodes)) {
      errors.push("Nodes array is required");
    } else {
      workflow.nodes.forEach((node, index) => {
        if (!node.id) errors.push(`Node ${index}: ID is required`);
        if (!node.type) errors.push(`Node ${index}: Type is required`);
        if (!node.position) errors.push(`Node ${index}: Position is required`);
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
      });
    }

    res.json({
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Error validating workflow:", error);
    res.status(500).json({
      valid: false,
      errors: ["Internal validation error"],
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("Unhandled error:", error);
  res.status(500).json({
    error: "Internal server error",
    message: "An unexpected error occurred",
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    error: "Not found",
    message: "The requested endpoint does not exist",
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
  console.log(
    `🤖 AI Workflow Generator: http://localhost:${PORT}/api/generate-workflow`
  );
});

module.exports = app;
