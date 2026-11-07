import type { Request, Response } from "express";
import * as contentService from "../services/content.service.js";

export const contentController = {
  async listEvents(_req: Request, res: Response) {
    res.json(await contentService.listEvents());
  },

  async listClassSessions(_req: Request, res: Response) {
    res.json(await contentService.listClassSessions());
  },

  async listResources(_req: Request, res: Response) {
    res.json(await contentService.listResources());
  },

  async listStudyGroups(_req: Request, res: Response) {
    res.json(await contentService.listStudyGroups());
  },

  async listSocialLinks(_req: Request, res: Response) {
    res.json(await contentService.listSocialLinks());
  },

  async listCoreMembers(_req: Request, res: Response) {
    res.json(await contentService.listCoreMembers());
  },

  async listRepoKinds(_req: Request, res: Response) {
    res.json(await contentService.listRepoKinds());
  },

  async listPublicMembers(_req: Request, res: Response) {
    res.json(await contentService.listPublicMembers());
  },

  async listActivity(req: Request, res: Response) {
    const limit = Math.min(Math.max(Number(req.query.limit) || 300, 1), 500);
    res.json(await contentService.listActivity(limit));
  },

  async listRowActivity(req: Request, res: Response) {
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 200);
    res.json(
      await contentService.listRowActivity(
        String(req.params.table),
        String(req.params.rowId),
        limit,
      ),
    );
  },

  async restore(req: Request, res: Response) {
    const table = String(req.body?.table || "");
    const rowId = String(req.body?.rowId || "");
    res.status(201).json(await contentService.restoreRow(req.user!, table, rowId));
  },

  async setMemberCard(req: Request, res: Response) {
    res.json(
      await contentService.setMemberCard(req.user!, req.body?.memberId),
    );
  },

  async upsertRepoKind(req: Request, res: Response) {
    res.json(
      await contentService.upsertRepoKind(
        req.user!,
        String(req.params.repoName),
        req.body || {},
      ),
    );
  },

  async deleteRepoKind(req: Request, res: Response) {
    await contentService.deleteRepoKind(req.user!, String(req.params.repoName));
    res.status(204).end();
  },

  async listResourceRows(req: Request, res: Response) {
    res.json(await contentService.listResourceRows(String(req.params.resource)));
  },

  async createResourceRow(req: Request, res: Response) {
    res.status(201).json(
      await contentService.createResourceRow(
        req.user!,
        String(req.params.resource),
        req.body || {},
      ),
    );
  },

  async updateResourceRow(req: Request, res: Response) {
    res.json(
      await contentService.updateResourceRow(
        req.user!,
        String(req.params.resource),
        String(req.params.id),
        req.body || {},
      ),
    );
  },

  async deleteResourceRow(req: Request, res: Response) {
    await contentService.deleteResourceRow(
      req.user!,
      String(req.params.resource),
      String(req.params.id),
    );
    res.status(204).end();
  },
};
