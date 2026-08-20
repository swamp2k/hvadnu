import { z } from 'zod';

export const MessageToneSchema = z.enum([
  'neutral',
  'firm',
  'hesitant',
  'optimistic',
  'legal',
  'sad',
  'confused',
  'tired',
]);

export type MessageTone = z.infer<typeof MessageToneSchema>;
