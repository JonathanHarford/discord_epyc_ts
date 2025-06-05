import express, { Express } from 'express';
import { createRequire } from 'node:module';
import util from 'node:util';

// Load environment variables from .env file
import 'dotenv/config';

import { Controller } from '../controllers/index.js';
import { checkAuth, handleError } from '../middleware/index.js';
import { Logger } from '../services/index.js';

const require = createRequire(import.meta.url);
let Logs = require('../../lang/logs.json');

export class Api {
    private app: Express;

    constructor(public controllers: Controller[]) {
        this.app = express();
        this.app.use(express.json());
        this.setupControllers();
        this.app.use(handleError());
    }

    public async start(): Promise<void> {
        let listen = util.promisify(this.app.listen.bind(this.app));
        // Use environment variable for API port, default to 3001 if not set
        const apiPort = process.env.API_PORT ? parseInt(process.env.API_PORT, 10) : 3001;
        await listen(apiPort);
        Logger.info(Logs.info.apiStarted.replaceAll('{PORT}', apiPort.toString()));
    }

    private setupControllers(): void {
        for (let controller of this.controllers) {
            if (controller.authToken) {
                controller.router.use(checkAuth(controller.authToken));
            }
            controller.register();
            this.app.use(controller.path, controller.router);
        }
    }
}
