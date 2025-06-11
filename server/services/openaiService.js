const { OpenAI } = require("openai");

class OpenAIService {
  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      baseURL: `${process.env.ENDPOINT_URL}openai/deployments/${process.env.DEPLOYMENT_NAME}`,
      defaultQuery: { "api-version": "2024-02-15-preview" },
      defaultHeaders: {
        "api-key": process.env.AZURE_OPENAI_API_KEY,
      },
    });
  }

  async generateScript(prompt, scriptType, language) {
    const systemPrompt = this.getScriptSystemPrompt(scriptType, language);

    try {
      const completion = await this.client.chat.completions.create({
        model: process.env.DEPLOYMENT_NAME,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 1500,
      });

      return {
        success: true,
        content: completion.choices[0].message.content,
      };
    } catch (error) {
      console.error("OpenAI API Error:", error);

      if (error.code === "insufficient_quota") {
        throw new Error("API quota exceeded");
      }

      if (error.code === "invalid_api_key") {
        throw new Error("Invalid API key");
      }

      throw error;
    }
  }

  async generateWorkflow(prompt) {
    const systemPrompt = this.getWorkflowSystemPrompt();

    try {
      const completion = await this.client.chat.completions.create({
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

      return {
        success: true,
        content: completion.choices[0].message.content,
      };
    } catch (error) {
      console.error("OpenAI API Error:", error);
      throw error;
    }
  }

  async testConnection() {
    try {
      const completion = await this.client.chat.completions.create({
        model: process.env.DEPLOYMENT_NAME,
        messages: [
          {
            role: "user",
            content: "Hello, this is a connection test.",
          },
        ],
        max_tokens: 10,
      });

      return completion.choices && completion.choices.length > 0;
    } catch (error) {
      console.error("OpenAI connection test failed:", error);
      return false;
    }
  }

  getScriptSystemPrompt(scriptType, language) {
    const languageSpecifics = {
      python: {
        extension: "py",
        shebang: "#!/usr/bin/env python3",
        comment: "#",
        bestPractices:
          "Follow PEP 8 style guidelines, use meaningful variable names, include docstrings for functions, handle exceptions properly, and use type hints where appropriate.",
      },
      powershell: {
        extension: "ps1",
        shebang: "",
        comment: "#",
        bestPractices:
          "Use approved verbs, follow PowerShell naming conventions, include comment-based help, handle errors with try-catch blocks, and use parameter validation.",
      },
      shell: {
        extension: "sh",
        shebang: "#!/bin/bash",
        comment: "#",
        bestPractices:
          "Use set -e for error handling, quote variables properly, use meaningful function names, include usage information, and follow POSIX standards where possible.",
      },
      javascript: {
        extension: "js",
        shebang: "#!/usr/bin/env node",
        comment: "//",
        bestPractices:
          "Use const/let instead of var, follow camelCase naming, include JSDoc comments, handle promises properly, and use meaningful variable names.",
      },
    };

    const lang = languageSpecifics[language] || languageSpecifics.python;

    return `You are an expert ${language} developer. Generate a complete, production-ready ${language} script based on the user's requirements.

Requirements:
1. The script must be functional and ready to run
2. Include appropriate ${
      lang.shebang ? "shebang line: " + lang.shebang : "header comments"
    }
3. Add comprehensive comments explaining the logic
4. Include error handling and input validation
5. Follow ${language} best practices: ${lang.bestPractices}
6. Make the script modular with functions where appropriate
7. Include usage examples or instructions in comments
8. Handle edge cases and provide meaningful error messages

Script Type: ${scriptType}
Language: ${language}

Generate ONLY the script code without any markdown formatting or explanations outside the code. The script should be immediately executable.`;
  }

  getWorkflowSystemPrompt() {
    return `You are an expert workflow automation designer. Generate a complete workflow JSON object based on the user's description. 

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
  }
}

module.exports = new OpenAIService();
