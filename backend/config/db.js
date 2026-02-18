import mongoose from 'mongoose';

export async function connectDB(uri) {
  await mongoose.connect(uri, {
    retryWrites: true,
    w: 'majority',
  });
}

export function disconnectDB() {
  return mongoose.disconnect();
}
