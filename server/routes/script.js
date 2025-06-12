const express = require("express");
const router = express.Router();
const scriptService = require("../services/scriptService");

// AI Script Generator endpoint
router.post("/generate-script", async (req, res) => {
  try {
    const { prompt, scriptType, language } = req.body;

    // Validate input
    const validationError = scriptService.validateScriptRequest(
      prompt,
      scriptType,
      language
    );
    if (validationError) {
      return res.status(400).json({
        error: "Invalid request",
        message: validationError,
      });
    }

    // Generate script using AI
    const result = await scriptService.generateScript(
      prompt,
      scriptType,
      language
    );

    if (result.success) {
      res.json({
        success: true,
        script: result.script,
        filename: result.filename,
        language: result.language,
        message: "Script generated successfully",
      });
    } else {
      // Return fallback script if AI generation fails
      res.status(200).json({
        success: true,
        script: result.script,
        filename: result.filename,
        language: result.language,
        message: "Generated fallback script due to AI service unavailability",
        fallback: true,
      });
    }
  } catch (error) {
    console.error("Error in script generation endpoint:", error);

    // Generate fallback script
    const fallbackResult = scriptService.generateFallbackScript(
      req.body.prompt || "automation script",
      req.body.scriptType || "python",
      req.body.language || "python"
    );

    res.status(200).json({
      success: true,
      script: fallbackResult.script,
      filename: fallbackResult.filename,
      language: fallbackResult.language,
      message: "Generated fallback script due to server error",
      fallback: true,
    });
  }
});

// Script validation endpoint
router.post("/validate-script", (req, res) => {
  try {
    const { script, language } = req.body;

    if (!script || typeof script !== "string") {
      return res.status(400).json({
        valid: false,
        errors: ["Script content is required"],
      });
    }

    const validationResult = scriptService.validateScript(script, language);

    res.json({
      valid: validationResult.valid,
      errors: validationResult.errors,
      warnings: validationResult.warnings,
    });
  } catch (error) {
    console.error("Error validating script:", error);
    res.status(500).json({
      valid: false,
      errors: ["Internal validation error"],
    });
  }
});

// Get script templates endpoint
router.get("/script-templates/:language", (req, res) => {
  try {
    const { language } = req.params;
    const templates = scriptService.getScriptTemplates(language);

    res.json({
      success: true,
      templates,
      language,
    });
  } catch (error) {
    console.error("Error fetching script templates:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching script templates",
    });
  }
});

module.exports = router;
