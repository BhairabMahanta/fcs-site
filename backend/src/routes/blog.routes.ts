import { Router } from "express";
import { asyncHandler } from "../lib/http.js";
import { requireEditor } from "../middleware/auth.js";
import { blogController } from "../controllers/blog.controller.js";

export const blogPublicRouter = Router();

blogPublicRouter.get(
  "/blog-posts",
  asyncHandler(blogController.listPublishedPosts),
);
blogPublicRouter.get(
  "/blog-posts/:slug",
  asyncHandler(blogController.getPublishedPost),
);

export const blogAdminRouter = Router();

blogAdminRouter.use(requireEditor);

blogAdminRouter.get(
  "/blog-drafts/:postId",
  asyncHandler(blogController.getDraft),
);
blogAdminRouter.put(
  "/blog-drafts/:postId",
  asyncHandler(blogController.saveDraft),
);
blogAdminRouter.delete(
  "/blog-drafts/:postId",
  asyncHandler(blogController.deleteDraft),
);
blogAdminRouter.get(
  "/blog-posts/:postId/versions",
  asyncHandler(blogController.listVersions),
);
blogAdminRouter.post(
  "/blog-posts/:postId/versions",
  asyncHandler(blogController.createVersion),
);
blogAdminRouter.get(
  "/blog-authors",
  asyncHandler(blogController.listAuthors),
);
