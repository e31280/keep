import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";

export const runtime = "edge";

export async function POST(req: Request) {
  const { messages, workflowDefinition, installedProviders } = await req.json();

  const systemPrompt = `You are a helpful assistant for Keep AIOps platform workflow builder.
You help users create and debug workflows.

Current workflow definition:
${JSON.stringify(workflowDefinition, null, 2)}

Available providers:
${installedProviders?.map((p: any) => `- ${p.type}: ${p.id}`).join("\n")}

Provide concise, actionable responses. When suggesting workflow changes, format them as YAML code blocks.`;

  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: systemPrompt,
    messages,
  });

  return result.toDataStreamResponse();
}
