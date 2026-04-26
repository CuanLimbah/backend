import { z } from 'zod';

export interface AgentTool {
  name: string;
  description: string;
  parameters: z.ZodType<any, any>;
  execute: (args: any, context?: ToolContext) => Promise<any> | any;
}

export interface ToolContext {
  userId: string;
  isAuthenticated: boolean;
}

export class ToolRegistry {
  private tools: Map<string, AgentTool> = new Map();

  registerTool(tool: AgentTool) {
    this.tools.set(tool.name, tool);
  }

  getTool(name: string): AgentTool | undefined {
    return this.tools.get(name);
  }

  getAllTools(): Record<string, { description: string; parameters: z.ZodType }> {
    const result: Record<string, any> = {};
    for (const [name, tool] of this.tools.entries()) {
      result[name] = {
        description: tool.description,
        parameters: tool.parameters,
      };
    }
    return result;
  }
}

export const globalToolRegistry = new ToolRegistry();
