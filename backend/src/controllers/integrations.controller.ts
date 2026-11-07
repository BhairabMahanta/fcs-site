import type { Request, Response } from "express";
import { runMediumAction } from "../integrations/medium/adapter.js";

export const integrationsController = {
  async runAction(req: Request, res: Response) {
    const result = await runMediumAction(req.body || {});

    if (req.body?.action === "import") {
      res.setHeader("cache-control", "no-store");
    }
    res.status(result.status).json(result.body);
  },
};
