import type { Request, Response } from "express";
import { HttpError } from "../lib/http.js";
import * as mediaService from "../services/media.service.js";

export const mediaController = {
  async uploadMemberPhotos(req: Request, res: Response) {
    const files = req.files as
      | Record<string, Express.Multer.File[]>
      | undefined;
    const full = files?.full?.[0];
    const thumb = files?.thumb?.[0];

    if (!full || !thumb) {
      throw new HttpError(400, "Send both the full photo and its thumbnail.");
    }

    res.status(201).json(
      await mediaService.saveMemberPhotos(full.buffer, thumb.buffer),
    );
  },

  async deleteMemberPhotos(req: Request, res: Response) {
    const urls = Array.isArray(req.body?.urls) ? req.body.urls : [];
    await mediaService.deleteMemberPhotos(urls);
    res.status(204).end();
  },
};
