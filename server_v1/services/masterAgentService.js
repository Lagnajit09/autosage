const workflowService = require("./workflowService");

class MasterAgentService {
  /**
   * Generates a workflow and scripts for each script node.
   * @param {string} prompt - The user prompt describing the workflow.
   * @param {string} [scriptLanguage] - Optional preferred script language (python, powershell, shell, javascript).
   * @returns {Promise<object>} The workflow with scripts attached to script nodes.
   */
  async generateWorkflowWithScripts(prompt, scriptLanguage = "python") {
    // Step 1: Generate the workflow structure with scripts
    const workflowResult = await workflowService.generateWorkflow(
      prompt,
      "complete"
    );
    let workflow = workflowResult.workflow;

    if (!workflow || !workflow.nodes) {
      return {
        success: false,
        message: "Failed to generate workflow structure.",
        workflow: null,
      };
    }

    // Step 2: Process script nodes and create script files
    const scriptNodeTypes = ["action"];
    for (const node of workflow.nodes) {
      if (
        scriptNodeTypes.includes(node.type) &&
        node.data &&
        node.data.type === "script" &&
        node.data.script
      ) {
        // Generate unique script id
        const scriptId = `${Date.now()}-${Math.random()}`;

        // Create script file object from the node's script data
        const scriptFile = {
          id: scriptId,
          name: node.data.scriptName || `script_${scriptId}`,
          language: node.data.scriptLanguage || scriptLanguage,
          lastModified: new Date().toISOString(),
          source: "Written in Editor",
          codeLink: `http://localhost:8080/raw/${scriptId}`,
        };

        // Attach script file details to node
        node.data.selectedScript = scriptId;
        node.data.scriptFile = { ...scriptFile };

        // Remove the raw script data from the node
        delete node.data.script;
        delete node.data.scriptLanguage;
        delete node.data.scriptName;
      }
    }

    return {
      success: true,
      workflow,
      message: "Workflow and scripts generated successfully.",
    };
  }
}

module.exports = new MasterAgentService();
