const openaiService = require("./openaiService");

class ScriptService {
  constructor() {
    this.supportedLanguages = ["python", "powershell", "shell", "javascript"];
    this.supportedTypes = [
      "automation",
      "utility",
      "data-processing",
      "web-scraping",
      "file-management",
      "system-admin",
      "custom",
    ];
  }

  validateScriptRequest(prompt, scriptType, language) {
    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return "Prompt is required and must be a non-empty string";
    }

    if (prompt.length > 1000) {
      return "Prompt is too long (maximum 1000 characters)";
    }

    if (language && !this.supportedLanguages.includes(language.toLowerCase())) {
      return `Unsupported language. Supported languages: ${this.supportedLanguages.join(
        ", "
      )}`;
    }

    if (scriptType && !this.supportedTypes.includes(scriptType.toLowerCase())) {
      return `Unsupported script type. Supported types: ${this.supportedTypes.join(
        ", "
      )}`;
    }

    return null;
  }

  async generateScript(prompt, scriptType = "automation", language = "python") {
    try {
      const result = await openaiService.generateScript(
        prompt,
        scriptType,
        language
      );

      if (result.success) {
        const filename = this.generateFilename(language);

        return {
          success: true,
          script: result.content,
          filename: filename,
          language: language.toLowerCase(),
        };
      }
    } catch (error) {
      console.error("Error generating script with AI:", error);
    }

    // Return fallback script if AI generation fails
    return this.generateFallbackScript(prompt, scriptType, language);
  }

  generateFallbackScript(
    prompt,
    scriptType = "automation",
    language = "python"
  ) {
    const templates = this.getFallbackTemplates();
    const template = templates[language.toLowerCase()] || templates.python;

    const script = template
      .replace(/\{\{PROMPT\}\}/g, prompt)
      .replace(/\{\{TIMESTAMP\}\}/g, new Date().toISOString())
      .replace(/\{\{SCRIPT_TYPE\}\}/g, scriptType);

    return {
      success: false,
      script: script,
      filename: this.generateFilename(language),
      language: language.toLowerCase(),
    };
  }

  validateScript(script, language) {
    const errors = [];
    const warnings = [];

    if (!script || script.trim().length === 0) {
      errors.push("Script content cannot be empty");
      return { valid: false, errors, warnings };
    }

    // Basic syntax validation based on language
    switch (language?.toLowerCase()) {
      case "python":
        this.validatePythonScript(script, errors, warnings);
        break;
      case "powershell":
        this.validatePowershellScript(script, errors, warnings);
        break;
      case "shell":
        this.validateShellScript(script, errors, warnings);
        break;
      case "javascript":
        this.validateJavascriptScript(script, errors, warnings);
        break;
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  validatePythonScript(script, errors, warnings) {
    // Basic Python validation
    const lines = script.split("\n");
    let indentLevel = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed && !trimmed.startsWith("#")) {
        // Check for common syntax issues
        if (line.includes("print ") && !line.includes("print(")) {
          warnings.push(
            `Line ${
              i + 1
            }: Consider using print() function instead of print statement`
          );
        }

        // Check indentation (basic)
        const currentIndent = line.length - line.trimStart().length;
        if (trimmed.endsWith(":")) {
          indentLevel = currentIndent + 4;
        }
      }
    }
  }

  validatePowershellScript(script, errors, warnings) {
    // Basic PowerShell validation
    if (
      !script.includes("Write-Host") &&
      !script.includes("Write-Output") &&
      !script.includes("return")
    ) {
      warnings.push("Script doesn't appear to have any output statements");
    }
  }

  validateShellScript(script, errors, warnings) {
    // Basic shell script validation
    if (!script.startsWith("#!/bin/bash") && !script.startsWith("#!/bin/sh")) {
      warnings.push("Script is missing shebang line");
    }

    if (!script.includes("echo") && !script.includes("printf")) {
      warnings.push("Script doesn't appear to have any output statements");
    }
  }

  validateJavascriptScript(script, errors, warnings) {
    // Basic JavaScript validation
    try {
      // Very basic syntax check - just try to parse it
      // Note: This won't catch runtime errors, just syntax errors
      new Function(script);
    } catch (error) {
      errors.push(`Syntax error: ${error.message}`);
    }
  }

  generateFilename(language) {
    const timestamp = Date.now();
    const extensions = {
      python: "py",
      powershell: "ps1",
      shell: "sh",
      javascript: "js",
    };

    const ext = extensions[language.toLowerCase()] || "txt";
    return `ai_${timestamp}.${ext}`;
  }

  getScriptTemplates(language) {
    const templates = {
      python: [
        {
          name: "Basic Script Template",
          description: "A simple Python script template",
          content: `#!/usr/bin/env python3
"""
Description: Basic Python script template
Author: AI Generated
Created: ${new Date().toISOString()}
"""

def main():
    """Main function"""
    print("Hello, World!")
    # Add your code here

if __name__ == "__main__":
    main()
`,
        },
        {
          name: "File Processing Template",
          description: "Template for file processing operations",
          content: `#!/usr/bin/env python3
"""
File Processing Script Template
"""
import os
import sys

def process_file(file_path):
    """Process a single file"""
    try:
        with open(file_path, 'r') as file:
            content = file.read()
            # Process content here
            return content
    except Exception as e:
        print(f"Error processing {file_path}: {e}")
        return None

def main():
    if len(sys.argv) < 2:
        print("Usage: python script.py <file_path>")
        sys.exit(1)
    
    file_path = sys.argv[1]
    if os.path.exists(file_path):
        result = process_file(file_path)
        if result:
            print("File processed successfully")
    else:
        print("File not found")

if __name__ == "__main__":
    main()
`,
        },
      ],
      powershell: [
        {
          name: "Basic PowerShell Template",
          description: "A simple PowerShell script template",
          content: `# Basic PowerShell Script Template
# Author: AI Generated
# Created: ${new Date().toISOString()}

param(
    [Parameter(Mandatory=$false)]
    [string]$InputPath = "."
)

function Main {
    Write-Host "PowerShell script started"
    Write-Host "Input path: $InputPath"
    
    # Add your code here
    
    Write-Host "Script completed successfully"
}

# Execute main function
try {
    Main
} catch {
    Write-Error "Script failed: $_"
    exit 1
}
`,
        },
      ],
      shell: [
        {
          name: "Basic Shell Script Template",
          description: "A simple shell script template",
          content: `#!/bin/bash
# Basic Shell Script Template
# Author: AI Generated  
# Created: ${new Date().toISOString()}

set -e  # Exit on error

# Function definitions
main() {
    echo "Shell script started"
    
    # Add your code here
    
    echo "Script completed successfully"
}

# Script execution
if [[ "\${BASH_SOURCE[0]}" == "\${0}" ]]; then
    main "$@"
fi
`,
        },
      ],
    };

    return templates[language.toLowerCase()] || [];
  }

  getFallbackTemplates() {
    return {
      python: `#!/usr/bin/env python3
"""
AI Generated Script
Description: {{PROMPT}}
Script Type: {{SCRIPT_TYPE}}
Generated: {{TIMESTAMP}}
"""

def main():
    """
    Main function for: {{PROMPT}}
    """
    print("Script generated for: {{PROMPT}}")
    print("Script type: {{SCRIPT_TYPE}}")
    
    # TODO: Implement the following functionality:
    # {{PROMPT}}
    
    # Add your implementation here
    pass

if __name__ == "__main__":
    main()
`,
      powershell: `# AI Generated PowerShell Script
# Description: {{PROMPT}}
# Script Type: {{SCRIPT_TYPE}}
# Generated: {{TIMESTAMP}}

param(
    [Parameter(Mandatory=$false)]
    [string]$InputData = ""
)

function Main {
    Write-Host "PowerShell script for: {{PROMPT}}"
    Write-Host "Script type: {{SCRIPT_TYPE}}"
    
    # TODO: Implement the following functionality:
    # {{PROMPT}}
    
    # Add your implementation here
}

try {
    Main
    Write-Host "Script completed successfully"
} catch {
    Write-Error "Script failed: $_"
    exit 1
}
`,
      shell: `#!/bin/bash
# AI Generated Shell Script
# Description: {{PROMPT}}
# Script Type: {{SCRIPT_TYPE}}
# Generated: {{TIMESTAMP}}

set -e

main() {
    echo "Shell script for: {{PROMPT}}"
    echo "Script type: {{SCRIPT_TYPE}}"
    
    # TODO: Implement the following functionality:
    # {{PROMPT}}
    
    # Add your implementation here
}

# Execute main function
main "$@"
echo "Script completed successfully"
`,
      javascript: `#!/usr/bin/env node
/**
 * AI Generated JavaScript Script
 * Description: {{PROMPT}}
 * Script Type: {{SCRIPT_TYPE}}
 * Generated: {{TIMESTAMP}}
 */

function main() {
    console.log("JavaScript script for: {{PROMPT}}");
    console.log("Script type: {{SCRIPT_TYPE}}");
    
    // TODO: Implement the following functionality:
    // {{PROMPT}}
    
    // Add your implementation here
}

// Execute main function
if (require.main === module) {
    main();
    console.log("Script completed successfully");
}

module.exports = { main };
`,
    };
  }
}

module.exports = new ScriptService();
