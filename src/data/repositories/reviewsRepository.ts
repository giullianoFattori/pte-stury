import type { ReviewItem } from '../../domain/pte/types';
import { db } from '../db/database';

export const reviewsRepository = {
  async create(review: ReviewItem) {
    await db.reviews.add(review);
    return review;
  },

  async getById(id: string) {
    return db.reviews.get(id);
  },

  async getDue(now = new Date().toISOString()) {
    return db.reviews.where('dueAt').belowOrEqual(now).toArray();
  },

  async getAll() {
    return db.reviews.toArray();
  },
};
