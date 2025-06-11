const express = require("express");
const router = express.Router();
const workflowService = require("../services/workflowService");

// AI Workflow Generator endpoint
router.post("/generate-workflow", async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return res.status(400).json({
        error: "Invalid prompt",
        message: "Prompt is required and must be a non-empty string",
      });
    }

    const result = await workflowService.generateWorkflow(prompt);

    if (result.success) {
      res.json({
        success: true,
        workflow: result.workflow,
        message: "Workflow generated successfully",
      });
    } else {
      res.status(200).json({
        success: true,
        workflow: result.workflow,
        message: "Generated fallback workflow due to AI service unavailability",
        fallback: true,
      });
    }
  } catch (error) {
    console.error("Error generating workflow:", error);

    // Fallback response
    const fallbackWorkflow = workflowService.generateFallbackWorkflow(
      req.body.prompt || "automation workflow"
    );

    res.status(200).json({
      success: true,
      workflow: fallbackWorkflow,
      message: "Generated fallback workflow due to server error",
      fallback: true,
    });
  }
});

// Workflow validation endpoint
router.post("/validate-workflow", (req, res) => {
  try {
    const { workflow } = req.body;

    if (!workflow || typeof workflow !== "object") {
      return res.status(400).json({
        valid: false,
        errors: ["Workflow object is required"],
      });
    }

    const validationResult = workflowService.validateWorkflow(workflow);

    res.json({
      valid: validationResult.valid,
      errors: validationResult.errors,
    });
  } catch (error) {
    console.error("Error validating workflow:", error);
    res.status(500).json({
      valid: false,
      errors: ["Internal validation error"],
    });
  }
});

module.exports = router;
