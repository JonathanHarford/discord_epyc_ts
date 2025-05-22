import schedule from 'node-schedule';
import { Logger } from './logger.js'; // Corrected casing for logger.js
// import Logs from '../../lang/logs.json'; // If you have specific logs for scheduler

interface JobDetails {
    id: string;
    fireDate: Date;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data?: any; // Optional data to pass to the job callback
}

export type JobCallback = (data?: any) => void | Promise<void>;

export class SchedulerService {
    private scheduledJobs: Map<string, schedule.Job> = new Map();

    constructor() {
        // Initialization logic, e.g., loading persisted jobs, can go here later
        Logger.info('SchedulerService initialized.');
    }

    /**
     * Schedules a new job.
     * @param jobId A unique ID for the job.
     * @param fireDate The date and time when the job should run.
     * @param callback The function to execute when the job runs.
     * @param jobData Optional data to pass to the callback.
     * @returns True if the job was scheduled successfully, false otherwise (e.g., if ID exists or date is in past).
     */
    public scheduleJob(jobId: string, fireDate: Date, callback: JobCallback, jobData?: any): boolean {
        if (this.scheduledJobs.has(jobId)) {
            Logger.warn(`Job with ID '${jobId}' already exists. Skipping scheduling.`);
            return false;
        }

        if (fireDate.getTime() <= Date.now()) {
            Logger.warn(`Job with ID '${jobId}' has a fire date in the past. Skipping scheduling.`);
            return false;
        }

        try {
            const job = schedule.scheduleJob(fireDate, async () => {
                Logger.info(`Executing job '${jobId}'...`);
                try {
                    await callback(jobData);
                    Logger.info(`Job '${jobId}' executed successfully.`);
                } catch (error) {
                    Logger.error(`Error executing job '${jobId}':`, error);
                }
                this.scheduledJobs.delete(jobId); // Remove from map after execution (if one-time job)
            });

            if (job) {
                this.scheduledJobs.set(jobId, job);
                Logger.info(`Job '${jobId}' scheduled for ${fireDate.toISOString()}`);
                return true;
            } else {
                Logger.warn(`Failed to schedule job '${jobId}'. The scheduler might have returned null.`);
                return false;
            }
        } catch (error) {
            Logger.error(`Error scheduling job '${jobId}':`, error);
            return false;
        }
    }

    /**
     * Cancels a previously scheduled job.
     * @param jobId The ID of the job to cancel.
     * @returns True if the job was cancelled successfully, false otherwise (e.g., if job not found).
     */
    public cancelJob(jobId: string): boolean {
        const job = this.scheduledJobs.get(jobId);
        if (job) {
            job.cancel();
            this.scheduledJobs.delete(jobId);
            Logger.info(`Job '${jobId}' cancelled.`);
            return true;
        } else {
            Logger.warn(`Job with ID '${jobId}' not found for cancellation.`);
            return false;
        }
    }

    /**
     * Cancels all scheduled jobs. 
     * Typically called during graceful shutdown, but node-schedule.gracefulShutdown() is preferred for that.
     * This method is more for explicit manual clearing if needed.
     */
    public cancelAllJobs(): void {
        Logger.info('Cancelling all locally tracked scheduled jobs...');
        this.scheduledJobs.forEach((job, id) => {
            job.cancel();
            Logger.info(`Cancelled job: ${id}`);
        });
        this.scheduledJobs.clear();
        Logger.info('All locally tracked scheduled jobs cancelled.');
    }

    // Persistence methods (loadJobs, saveJob) will be added in Subtask 15.3
    // Example:
    // private async loadPersistedJobs(): Promise<void> { ... }
    // public async persistJob(jobDetails: JobDetails): Promise<void> { ... }
    // public async removePersistedJob(jobId: string): Promise<void> { ... }
} 