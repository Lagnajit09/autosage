const express = require("express");
const cors = require("cors");
require("dotenv").config();

console.error("WARNING: The legacy Node.js backend (server_v1) is deprecated and disabled for security reasons.");
console.error("Please use the Django backend (server) instead.");
process.exit(1);
// Import route modules
const healthRoutes = require("./routes/health");
const workflowRoutes = require("./routes/workflow");
const scriptRoutes = require("./routes/script");
const masterAgentRoutes = require("./routes/masterAgent");

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/health", healthRoutes);
app.use("/api", workflowRoutes);
app.use("/api", scriptRoutes);
app.use("/api", masterAgentRoutes);

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
  console.log(
    `📝 AI Script Generator: http://localhost:${PORT}/api/generate-script`
  );
});

module.exports = app;
