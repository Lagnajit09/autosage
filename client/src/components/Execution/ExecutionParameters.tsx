import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ExecutionParameters = () => {
  return (
    <div className="p-6 space-y-6">
      <div className="space-y-2">
        <Label
          htmlFor="env"
          className="text-xs font-semibold text-gray-500 uppercase tracking-wider"
        >
          Environment
        </Label>
        <Select defaultValue="production">
          <SelectTrigger
            id="env"
            className="w-full dark:text-gray-200 dark:bg-gray-900/50 dark:border-gray-700"
          >
            <SelectValue placeholder="Select environment" />
          </SelectTrigger>
          <SelectContent className="dark:bg-gray-900 dark:border-gray-800">
            <SelectItem
              value="development"
              className="dark:text-gray-200 dark:hover:bg-gray-800 dark:data-[state=checked]:bg-gray-800 dark:data-[state=checked]:text-gray-100"
            >
              Development
            </SelectItem>
            <SelectItem
              value="staging"
              className="dark:text-gray-200 dark:hover:bg-gray-800 dark:data-[state=checked]:bg-gray-800 dark:data-[state=checked]:text-gray-100"
            >
              Staging
            </SelectItem>
            <SelectItem
              value="production"
              className="dark:text-gray-200 dark:hover:bg-gray-800 dark:data-[state=checked]:bg-gray-800 dark:data-[state=checked]:text-gray-100"
            >
              Production
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="webhook-url"
          className="text-xs font-semibold text-gray-500 uppercase tracking-wider"
        >
          Webhook URL
        </Label>
        <Input
          id="webhook-url"
          placeholder="https://api.example.com/webhook"
          defaultValue="https://api.myservice.com/hooks/v1/process"
          className="dark:text-gray-200"
        />
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="retry-count"
          className="text-xs font-semibold text-gray-500 uppercase tracking-wider"
        >
          Max Retries
        </Label>
        <Input
          id="retry-count"
          type="number"
          defaultValue="3"
          min="0"
          max="10"
          className="dark:text-gray-200"
        />
      </div>

      <div className="flex items-center justify-between pt-2">
        <div className="space-y-0.5">
          <Label
            htmlFor="debug-mode"
            className="text-sm font-medium text-gray-900 dark:text-gray-100"
          >
            Debug Mode
          </Label>
          <p className="text-xs text-gray-500">Enable verbose logging</p>
        </div>
        <Switch id="debug-mode" className="dark:bg-gray-700" />
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label
            htmlFor="notifications"
            className="text-sm font-medium text-gray-900 dark:text-gray-100"
          >
            Email Notifications
          </Label>
          <p className="text-xs text-gray-500">Send report on completion</p>
        </div>
        <Switch id="notifications" className="dark:bg-gray-700" />
      </div>
    </div>
  );
};

export default ExecutionParameters;
