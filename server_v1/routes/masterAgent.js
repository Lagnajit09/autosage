const express = require("express");
const router = express.Router();
const masterAgentService = require("../services/masterAgentService");

// Master Agent: Generate workflow and scripts
router.post("/generate-workflow-with-scripts", async (req, res) => {
  try {
    const { prompt, scriptLanguage } = req.body;

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return res.status(400).json({
        error: "Invalid prompt",
        message: "Prompt is required and must be a non-empty string",
      });
    }

    const result = await masterAgentService.generateWorkflowWithScripts(
      prompt,
      scriptLanguage
    );

    if (result.success) {
      res.json({
        success: true,
        workflow: result.workflow,
        message: result.message,
      });
    } else {
      res.status(200).json({
        success: false,
        workflow: result.workflow,
        message: result.message,
      });
    }
  } catch (error) {
    console.error("Error in master agent endpoint:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error in master agent.",
    });
  }
});

module.exports = router;
