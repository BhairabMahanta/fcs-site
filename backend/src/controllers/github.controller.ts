import type { Request, Response } from "express";
import * as githubService from "../services/github.service.js";

export const githubController = {
  async uploadBlogImage(req: Request, res: Response) {
    res.status(201).json(await githubService.uploadBlogImage(req.file));
  },

  async refreshSite(_req: Request, res: Response) {
    res.json(await githubService.refreshSite());
  },
};
