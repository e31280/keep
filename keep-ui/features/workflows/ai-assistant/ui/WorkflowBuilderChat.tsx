import { useCallback, useMemo, useState } from "react";
import { Provider } from "@/shared/api/providers";
import {
  DefinitionV2,
} from "@/entities/workflows/model/types";
import { useWorkflowStore } from "@/entities/workflows";
import { Button } from "@/components/ui/button-shadcn";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea-shadcn";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { capture } from "@/shared/lib/capture";
import { useConfig } from "@/utils/hooks/useConfig";
import { useChat } from "@ai-sdk/react";
import ReactMarkdown from "react-markdown";
import { getWorkflowSummaryForCopilot } from "@/features/workflows/ai-assistant/lib/utils";

export interface WorkflowBuilderChatProps {
  definition: DefinitionV2;
  installedProviders: Provider[];
}

export function WorkflowBuilderChat({
  definition,
  installedProviders,
}: WorkflowBuilderChatProps) {
  const { data: config } = useConfig();
  const {
    nodes,
    edges,
    selectedEdge,
    selectedNode,
    validationErrors,
    v2Properties: properties,
  } = useWorkflowStore();

  const workflowSummary = useMemo(() => {
    return getWorkflowSummaryForCopilot(nodes, edges);
  }, [nodes, edges]);

  const { messages, input, handleInputChange, handleSubmit, isLoading, setMessages } = useChat({
    api: "/api/ai/chat",
    body: {
      workflowDefinition: {
        ...definition,
        summary: workflowSummary,
        properties,
        validationErrors,
        selectedNode,
        selectedEdge,
      },
      installedProviders,
    },
    onFinish: () => {
      capture("workflow_chat_message_submitted");
    },
  });

  const [debugInfoVisible, setDebugInfoVisible] = useState(false);

  const handleFormSubmit = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim()) return;
    handleSubmit(e);
  }, [input, handleSubmit]);

  return (
    <div className="flex flex-col h-full max-h-screen grow-0 overflow-hidden">
      <Card className="flex-1 flex flex-col border-0 rounded-none">
        <CardHeader className="border-b">
          <CardTitle className="text-lg flex items-center justify-between">
            <span>Workflow Builder Assistant</span>
            {config?.KEEP_WORKFLOW_DEBUG && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMessages([])}
                >
                  Reset
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDebugInfoVisible(!debugInfoVisible)}
                >
                  {debugInfoVisible ? "Hide" : "Show"} Debug
                </Button>
              </div>
            )}
          </CardTitle>
          {debugInfoVisible && config?.KEEP_WORKFLOW_DEBUG && (
            <div className="mt-4 text-xs">
              <ScrollArea className="h-[200px]">
                <pre className="text-xs">{JSON.stringify(definition, null, 2)}</pre>
                <pre className="text-xs">selectedNode={JSON.stringify(selectedNode, null, 2)}</pre>
                <pre className="text-xs">selectedEdge={JSON.stringify(selectedEdge, null, 2)}</pre>
              </ScrollArea>
            </div>
          )}
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden p-0">
          <ScrollArea className="h-full p-4">
            <div className="flex flex-col gap-4">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center p-8 text-muted-foreground">
                  <h3 className="text-lg font-semibold mb-2">What can I help you automate?</h3>
                  <p className="text-sm">
                    For example: For each alert about CPU &gt; 80%, send a slack message to the channel #alerts
                  </p>
                </div>
              )}
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-2 ${
                      message.role === "user"
                        ? "bg-orange-500 text-white"
                        : "bg-gray-100 text-gray-900"
                    }`}
                  >
                    {message.role === "assistant" ? (
                      <div className="prose prose-sm max-w-none">
                        <ReactMarkdown>{message.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    )}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="max-w-[80%] rounded-lg px-4 py-2 bg-gray-100">
                    <Skeleton className="h-4 w-[250px]" />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
        <div className="border-t p-4">
          {validationErrors && Object.keys(validationErrors).length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {Object.entries(validationErrors).map(([key, error]) => {
                // error is a tuple: [message, severity]
                const errorMessage = Array.isArray(error) ? error[0] : String(error);
                return (
                  <Badge key={key} variant="destructive">
                    {errorMessage}
                  </Badge>
                );
              })}
            </div>
          )}
          <form onSubmit={handleFormSubmit} className="flex gap-2">
            <Textarea
              value={input}
              onChange={handleInputChange}
              placeholder="Type your message here..."
              className="flex-1 min-h-[60px] max-h-[200px] resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  const formEvent = new Event('submit', { bubbles: true, cancelable: true });
                  Object.defineProperty(formEvent, 'target', { value: e.currentTarget.form, writable: false });
                  handleFormSubmit(formEvent as unknown as React.FormEvent<HTMLFormElement>);
                }
              }}
            />
            <Button
              type="submit"
              variant="primary"
              disabled={isLoading || !input.trim()}
              className="self-end"
            >
              Send
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
