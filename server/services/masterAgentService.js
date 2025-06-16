const workflowService = require("./workflowService");
const scriptService = require("./scriptService");

class MasterAgentService {
  /**
   * Generates a workflow and scripts for each script node.
   * @param {string} prompt - The user prompt describing the workflow.
   * @param {string} [scriptLanguage] - Optional preferred script language (python, powershell, shell, javascript).
   * @returns {Promise<object>} The workflow with scripts attached to script nodes.
   */
  async generateWorkflowWithScripts(prompt, scriptLanguage = "python") {
    // Step 1: Generate the workflow structure
    const workflowResult = await workflowService.generateWorkflow(prompt);
    let workflow = workflowResult.workflow;

    if (!workflow || !workflow.nodes) {
      return {
        success: false,
        message: "Failed to generate workflow structure.",
        workflow: null,
      };
    }

    // Step 2: For each script node, generate a script and attach it
    const scriptNodeTypes = ["action"];
    const scriptTypeMap = {
      "Python Script": "python",
      "Powershell Script": "powershell",
      "Shell Script": "shell",
      "JavaScript Script": "javascript",
    };

    for (const node of workflow.nodes) {
      if (
        scriptNodeTypes.includes(node.type) &&
        node.data &&
        node.data.type === "script"
      ) {
        // Determine language
        let language = scriptTypeMap[node.data.scriptType] || scriptLanguage;
        // Compose script prompt
        const scriptPrompt = node.data.description || prompt;
        // Generate script
        const scriptResult = await scriptService.generateScript(
          scriptPrompt,
          node.data.scriptType || "automation",
          language
        );
        // Generate unique script id
        const scriptId = `${Date.now()}-${Math.random()}`;
        // Compose script file object
        const scriptFile = {
          id: scriptId,
          name: scriptResult.filename,
          content: scriptResult.script,
          language: language,
          lastModified: new Date().toISOString(),
          source: "Written in Editor",
          codeLink: `http://localhost:8080/raw/${scriptId}`,
        };
        // Attach script file details to node
        node.data.selectedScript = scriptId;
        node.data.scriptFile = { ...scriptFile };
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
