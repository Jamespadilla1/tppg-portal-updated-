const supabase = require('../config/db');
const path = require('path');

const BUCKET = 'portal-uploads';

/**
 * Uploads a file buffer (from multer memoryStorage) to Supabase Storage
 * and returns a permanent public URL.
 */
async function uploadToStorage(file, folder = 'misc') {
  if (!file) return null;

  const uniqueName = `${folder}/${Date.now()}-${Math.round(Math.random() * 1e5)}${path.extname(file.originalname)}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(uniqueName, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });

  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(uniqueName);
  return data.publicUrl;
}

module.exports = uploadToStorage;
