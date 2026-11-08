import express, { Request, Response } from 'express';
import { apiRouter } from '../src/server/api.ts';

const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Support both /api and prefix-less paths inside serverless router
app.use('/api', apiRouter);
app.use(apiRouter);

export default app;
