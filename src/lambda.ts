import serverlessExpress from '@codegenie/serverless-express';
import type { Handler, Context, Callback } from 'aws-lambda';
import { app } from './app';
import { connectDatabase } from './config/database';

let serverlessExpressInstance: any;

async function setup(event: any, context: Context, callback: Callback) {
  // Prevent Lambda from hanging due to open MongoDB connection pools
  context.callbackWaitsForEmptyEventLoop = false;

  try {
    await connectDatabase();
  } catch (err) {
    console.error('[AWS Lambda] MongoDB connection error:', err);
  }

  serverlessExpressInstance = serverlessExpress({ app });
  return serverlessExpressInstance(event, context, callback);
}

export const handler: Handler = async (event: any, context: Context, callback: Callback) => {
  context.callbackWaitsForEmptyEventLoop = false;

  if (serverlessExpressInstance) {
    try {
      await connectDatabase();
    } catch (err) {
      console.error('[AWS Lambda] MongoDB warm check error:', err);
    }
    return serverlessExpressInstance(event, context, callback);
  }

  return setup(event, context, callback);
};
