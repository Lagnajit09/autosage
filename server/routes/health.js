const express = require("express");
const router = express.Router();

// Health check endpoint
router.get("/", (req, res) => {
  res.json({
    status: "OK",
    message: "Server is running",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Detailed health check with service status
router.get("/detailed", async (req, res) => {
  const healthStatus = {
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      openai: "unknown",
      database: "not_implemented",
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        unit: "MB",
      },
    },
  };

  // Test OpenAI service availability
  try {
    const openaiService = require("../services/openaiService");
    const testResult = await openaiService.testConnection();
    healthStatus.services.openai = testResult ? "healthy" : "unhealthy";
  } catch (error) {
    healthStatus.services.openai = "error";
  }

  // Set overall status based on critical services
  if (
    healthStatus.services.openai === "error" ||
    healthStatus.services.openai === "unhealthy"
  ) {
    healthStatus.status = "DEGRADED";
  }

  res.json(healthStatus);
});

module.exports = router;
