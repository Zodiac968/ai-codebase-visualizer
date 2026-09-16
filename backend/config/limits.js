import dotenv from 'dotenv';
dotenv.config();

export const LIMITS = {
  // Convert MB to Bytes
  MAX_REPOSITORY_SIZE: (parseInt(process.env.MAX_REPOSITORY_SIZE_MB, 10) || 200) * 1024 * 1024,
  MAX_FILE_SIZE: (parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 2) * 1024 * 1024,
  MAX_FILE_COUNT: parseInt(process.env.MAX_FILE_COUNT, 10) || 5000,
};