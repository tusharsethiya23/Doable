// Runs once before all tests: starts a throwaway in-memory MongoDB and shares its URI with the test files.
import { MongoMemoryServer } from 'mongodb-memory-server';

export default async function setup(project) {
  const mongo = await MongoMemoryServer.create();
  project.provide('mongoUri', mongo.getUri());
  return async () => {
    await mongo.stop();
  };
}
