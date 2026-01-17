import { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { WorkflowBuilder } from "../components/workflow/WorkflowBuilder";
import { apiRequest } from "../lib/api-client";
import Loader from "@/components/Loader";

const Workflow = () => {
  const { id } = useParams();
  const path = useLocation();

  const { getToken, isSignedIn } = useAuth();
  const [initialData, setInitialData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (isSignedIn) {
      const getClerkToken = async () => {
        try {
          const clerkToken = await getToken();
          setToken(clerkToken);
        } catch (error) {
          console.error("Failed to get token:", error);
        }
      };
      getClerkToken();
    }
  }, [isSignedIn, getToken]);

  useEffect(() => {
    if (isSignedIn && id && token) {
      const fetchWorkflow = async () => {
        setLoading(true);
        try {
          const response = await apiRequest(`/api/workflows/${id}/`, {}, token);
          // The API returns { success, message, data }, extract data
          setInitialData(response?.data || response);
        } catch (error) {
          console.error("Failed to fetch workflow:", error);
        } finally {
          setLoading(false);
        }
      };
      fetchWorkflow();
    } else if (isSignedIn && !id && path.pathname.includes("new")) {
      setInitialData([]);
    }
  }, [isSignedIn, id, token, path.pathname]);

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-black dark:to-gray-900">
        <Loader />
      </div>
    );
  if (id && !initialData) return <div>Workflow not found.</div>;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <WorkflowBuilder initialData={initialData} workflowId={id || null} />
    </div>
  );
};

export default Workflow;
