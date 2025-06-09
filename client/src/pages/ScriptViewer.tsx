import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";

const RawScript = () => {
  const { id } = useParams();
  const [scriptContent, setScriptContent] = useState("");

  useEffect(() => {
    // Set content type for plain text
    document.title = `Raw Script - ${id}`;

    const loadScript = async () => {
      try {
        const savedFiles = localStorage.getItem("scriptFiles");
        if (savedFiles) {
          const files = JSON.parse(savedFiles);
          const script = files.find((file) => file.id === id);
          if (script) {
            setScriptContent(script.content);
          }
        }
      } catch (error) {
        console.error("Error loading script:", error);
        setScriptContent("Error loading script content");
      }
    };

    loadScript();
  }, [id]);

  // Minimal styling to mimic raw text view
  return (
    <div
      style={{
        backgroundColor: "#000000",
        color: "#ffffff",
        fontFamily: 'Consolas, "Liberation Mono", Menlo, Courier, monospace',
        fontSize: "12px",
        lineHeight: "1.45",
        margin: 0,
        padding: "16px",
        minHeight: "100vh",
      }}
    >
      <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{scriptContent}</pre>
    </div>
  );
};

export default RawScript;
