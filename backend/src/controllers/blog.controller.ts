import type { Request, Response } from "express";
import { z } from "zod";
import { parseBody } from "../lib/http.js";
import * as blogService from "../services/blog.service.js";

const DraftSchema = z.object({
  content: z.unknown(),
});

const VersionSchema = z.object({
  content: z.unknown(),
  kind: z.enum(["edit", "publish"]).default("edit"),
});

export const blogController = {
  async listPublishedPosts(_req: Request, res: Response) {
    res.json(await blogService.listPublishedPosts());
  },

  async getPublishedPost(req: Request, res: Response) {
    res.json(await blogService.getPublishedPost(String(req.params.slug)));
  },

  async getDraft(req: Request, res: Response) {
    res.json(await blogService.getDraft(String(req.params.postId)));
  },

  async saveDraft(req: Request, res: Response) {
    const body = parseBody(DraftSchema, req.body);
    res.json(await blogService.saveDraft(req.user!, String(req.params.postId), body.content));
  },

  async deleteDraft(req: Request, res: Response) {
    await blogService.deleteDraft(String(req.params.postId));
    res.status(204).end();
  },

  async listVersions(req: Request, res: Response) {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 300);
    res.json(await blogService.listVersions(String(req.params.postId), limit));
  },

  async createVersion(req: Request, res: Response) {
    const body = parseBody(VersionSchema, req.body);
    res.status(201).json(
      await blogService.createVersion(
        req.user!,
        String(req.params.postId),
        body.content,
        body.kind,
      ),
    );
  },

  async listAuthors(_req: Request, res: Response) {
    res.json(await blogService.listAuthors());
  },
};
