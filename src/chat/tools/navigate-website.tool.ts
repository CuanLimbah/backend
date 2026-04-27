import { z } from 'zod';
<<<<<<< HEAD
import { AgentTool, globalToolRegistry } from '../tools.registry';

const allowedRoutes = new Set(['/', '/login', '/register', '/dashboard', '/admin']);

function normalizeRoute(route?: string) {
  const cleanRoute = route?.trim() || '/';

  if (allowedRoutes.has(cleanRoute)) {
    return cleanRoute;
  }

  return '/';
}

export const navigateWebsiteTool: AgentTool = {
  name: 'navigate_website',
  description:
    'Navigate the CuanLimbah frontend to one of these routes: /, /login, /register, /dashboard, /admin.',
  parameters: z.object({
    route: z
      .string()
      .describe('Frontend route to open, for example /dashboard or /admin.'),
    reason: z
      .string()
      .describe('Short Indonesian message explaining the navigation.'),
  }),
  execute: (args: unknown) => {
    const parsed = z
      .object({
        route: z.string().optional(),
        reason: z.string().optional(),
      })
      .safeParse(args);

    const route = parsed.success ? normalizeRoute(parsed.data.route) : '/';
    const reason =
      parsed.success && parsed.data.reason
        ? parsed.data.reason
        : 'Saya arahkan ke halaman yang sesuai.';

    return {
      type: 'NAVIGATE',
      payload: route,
      reason,
    };
  },
=======
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
>>>>>>> cc69ae98d34a300ba14efc95ea8bc82cd8f12463
};

globalToolRegistry.registerTool(navigateWebsiteTool);
