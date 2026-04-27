import { z } from 'zod';

export interface AgentTool {
  name: string;
  description: string;
  parameters: z.ZodType;
  execute: (args: unknown) => Promise<unknown> | unknown;
}

export class ToolRegistry {
  private readonly tools = new Map<string, AgentTool>();

  registerTool(tool: AgentTool) {
    this.tools.set(tool.name, tool);
  }

  getTool(name: string): AgentTool | undefined {
    return this.tools.get(name);
  }

  getAllTools(): Record<string, { description: string; inputSchema: z.ZodType }> {
    const aiTools: Record<
      string,
      { description: string; inputSchema: z.ZodType }
    > = {};

    for (const [name, tool] of this.tools.entries()) {
      aiTools[name] = {
        description: tool.description,
        inputSchema: tool.parameters,
      };
    }

    return aiTools;
  }
}

export const globalToolRegistry = new ToolRegistry();
