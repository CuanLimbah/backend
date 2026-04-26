import { z } from 'zod';
import { AgentTool, globalToolRegistry } from './tool.registry';

const navigateWebsiteTool: AgentTool = {
  name: 'navigate_website',
  description: 'Navigate the user to a specific route on the website frontend.',
  parameters: z.object({
    route: z.string().describe('The URL path to navigate to (e.g., /dashboard, /settings, /profile)'),
    reason: z.string().describe('A friendly message explaining that you are taking them there.'),
  }),
  execute: (args: { route: string; reason: string }) => ({
    type: 'NAVIGATE',
    payload: args.route || '/',
    reason: args.reason || 'Navigating...',
  }),
};

globalToolRegistry.registerTool(navigateWebsiteTool);
