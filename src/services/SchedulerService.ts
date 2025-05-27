import { PrismaClient } from '@prisma/client';
import { Client as DiscordClient } from 'discord.js';
import * as schedule from 'node-schedule';

import { Logger } from './index.js';
import { SeasonService } from './SeasonService.js';
import { TurnOfferingService } from './TurnOfferingService.js';
import { SeasonTurnService } from './SeasonTurnService.js';
import { OnDemandTurnService } from './OnDemandTurnService.js';
import { TurnTimeoutService } from './interfaces/TurnTimeoutService.js';
// import Logs from '../../lang/logs.json'; // If you have specific logs for scheduler

// Job data types for different job types
interface SeasonActivationJobData {
    seasonId: string;
}

interface ClaimTimeoutJobData {
    turnId: string;
    playerId: string;
}

interface SubmissionTimeoutJobData {
    turnId: string;
    playerId: string;
}

// Union type for all possible job data
type JobData = SeasonActivationJobData | ClaimTimeoutJobData | SubmissionTimeoutJobData | Record<string, unknown>;

interface JobDetails {
    id: string;
    fireDate: Date;
    jobType: string;
    // Using JobData union type instead of any for better type safety
    data?: JobData;
}

export type JobCallback = (data?: JobData) => void | Promise<void>;

// Type for service dependencies needed for job handlers
export interface SchedulerServiceDependencies {
    discordClient?: DiscordClient;
    seasonTurnService?: SeasonTurnService;
    onDemandTurnService?: OnDemandTurnService;
    turnOfferingService?: TurnOfferingService;
    seasonService?: SeasonService;
}

export class SchedulerService {
    private scheduledJobs: Map<string, schedule.Job> = new Map();
    private prisma: PrismaClient;
    private dependencies: SchedulerServiceDependencies = {};

    constructor(prisma: PrismaClient) {
        this.prisma = prisma;
        Logger.info('SchedulerService initialized.');
    }

    /**
     * Set dependencies needed for job handlers.
     * This allows for dependency injection after construction.
     */
    setDependencies(dependencies: SchedulerServiceDependencies): void {
        this.dependencies = { ...this.dependencies, ...dependencies };
        Logger.info('SchedulerService dependencies updated.');
    }

    /**
     * Schedules a new job.
     * @param jobId A unique ID for the job.
     * @param fireDate The date and time when the job should run.
     * @param callback The function to execute when the job runs.
     * @param jobData Optional data to pass to the callback.
     * @param jobType Type of job for categorization and recovery.
     * @returns True if the job was scheduled successfully, false otherwise (e.g., if ID exists or date is in past).
     */
    public async scheduleJob(jobId: string, fireDate: Date, callback: JobCallback, jobData?: JobData, jobType: string = 'generic'): Promise<boolean> {
        // Check both in-memory and database for existing jobs
        if (this.scheduledJobs.has(jobId)) {
            Logger.warn(`Job with ID '${jobId}' already exists in memory. Skipping scheduling.`);
            return false;
        }

        // Check database for existing job
        try {
            const existingJob = await this.prisma.scheduledJob.findUnique({
                where: { jobId },
            });
            if (existingJob) {
                Logger.warn(`Job with ID '${jobId}' already exists in database. Skipping scheduling.`);
                return false;
            }
        } catch (error) {
            Logger.error(`Error checking for existing job '${jobId}':`, error);
            return false;
        }

        if (fireDate.getTime() <= Date.now()) {
            Logger.warn(`Job with ID '${jobId}' has a fire date in the past. Skipping scheduling.`);
            return false;
        }

        try {
            // First, persist the job to database
            await this.persistJob(jobId, fireDate, jobType, jobData);

            const job = schedule.scheduleJob(fireDate, async () => {
                Logger.info(`Executing job '${jobId}'...`);
                try {
                    await callback(jobData);
                    Logger.info(`Job '${jobId}' executed successfully.`);
                    // Mark job as executed in database
                    await this.markJobExecuted(jobId);
                } catch (error) {
                    Logger.error(`Error executing job '${jobId}':`, error);
                    // Mark job as failed in database
                    await this.markJobFailed(jobId, error instanceof Error ? error.message : String(error));
                }
                this.scheduledJobs.delete(jobId); // Remove from map after execution (if one-time job)
            });

            if (job) {
                this.scheduledJobs.set(jobId, job);
                Logger.info(`Job '${jobId}' scheduled for ${fireDate.toISOString()}`);
                return true;
            } else {
                Logger.warn(`Failed to schedule job '${jobId}'. The scheduler might have returned null.`);
                // Remove from database if scheduling failed
                await this.removePersistedJob(jobId);
                return false;
            }
        } catch (error) {
            Logger.error(`Error scheduling job '${jobId}':`, error);
            // Try to remove from database if it was persisted
            try {
                await this.removePersistedJob(jobId);
            } catch (dbError) {
                Logger.error(`Error cleaning up failed job '${jobId}' from database:`, dbError);
            }
            return false;
        }
    }

    /**
     * Cancels a previously scheduled job.
     * @param jobId The ID of the job to cancel.
     * @returns True if the job was cancelled successfully, false otherwise (e.g., if job not found).
     */
    public async cancelJob(jobId: string): Promise<boolean> {
        const job = this.scheduledJobs.get(jobId);
        if (job) {
            job.cancel();
            this.scheduledJobs.delete(jobId);
            
            // Mark job as cancelled in database
            try {
                await this.prisma.scheduledJob.update({
                    where: { jobId },
                    data: {
                        status: 'CANCELLED',
                        executedAt: new Date(),
                    },
                });
                Logger.info(`Job '${jobId}' cancelled and marked in database.`);
            } catch (error) {
                Logger.warn(`Job '${jobId}' cancelled but could not update database:`, error);
            }
            
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

    /**
     * Cancels all jobs related to a specific game.
     * @param gameId The ID of the game whose jobs should be cancelled.
     * @returns The number of jobs cancelled.
     */
    public async cancelJobsForGame(gameId: string): Promise<number> {
        let cancelledCount = 0;
        
        try {
            // Find all jobs in the database related to this game
            const gameJobs = await this.prisma.scheduledJob.findMany({
                where: {
                    status: 'SCHEDULED',
                    OR: [
                        { jobId: { contains: gameId } }, // Job ID contains the game ID
                        { jobData: { path: ['gameId'], equals: gameId } } // Job data contains gameId field
                    ]
                }
            });

            // Cancel each job
            for (const job of gameJobs) {
                const success = await this.cancelJob(job.jobId);
                if (success) {
                    cancelledCount++;
                }
            }

            Logger.info(`Cancelled ${cancelledCount} jobs for game ${gameId}`);
            return cancelledCount;
        } catch (error) {
            Logger.error(`Error cancelling jobs for game ${gameId}:`, error);
            return cancelledCount;
        }
    }

    /**
     * Persist a job to the database.
     * @param jobId The unique job ID.
     * @param fireDate When the job should execute.
     * @param jobType Type of job for categorization.
     * @param jobData Optional data to pass to the callback.
     */
    private async persistJob(jobId: string, fireDate: Date, jobType: string, jobData?: JobData): Promise<void> {
        try {
            await this.prisma.scheduledJob.create({
                data: {
                    jobId,
                    fireDate,
                    jobType,
                    jobData: jobData ? JSON.stringify(jobData) : null,
                    status: 'SCHEDULED',
                },
            });
            Logger.info(`Job '${jobId}' persisted to database.`);
        } catch (error) {
            Logger.error(`Error persisting job '${jobId}' to database:`, error);
            throw error;
        }
    }

    /**
     * Mark a job as executed in the database.
     * @param jobId The job ID to mark as executed.
     */
    private async markJobExecuted(jobId: string): Promise<void> {
        try {
            await this.prisma.scheduledJob.update({
                where: { jobId },
                data: {
                    status: 'EXECUTED',
                    executedAt: new Date(),
                },
            });
            Logger.info(`Job '${jobId}' marked as executed in database.`);
        } catch (error) {
            Logger.error(`Error marking job '${jobId}' as executed:`, error);
        }
    }

    /**
     * Mark a job as failed in the database.
     * @param jobId The job ID to mark as failed.
     * @param failureReason The reason for failure.
     */
    private async markJobFailed(jobId: string, failureReason: string): Promise<void> {
        try {
            await this.prisma.scheduledJob.update({
                where: { jobId },
                data: {
                    status: 'FAILED',
                    failureReason,
                    executedAt: new Date(),
                },
            });
            Logger.info(`Job '${jobId}' marked as failed in database.`);
        } catch (error) {
            Logger.error(`Error marking job '${jobId}' as failed:`, error);
        }
    }

    /**
     * Remove a persisted job from the database.
     * @param jobId The job ID to remove.
     */
    private async removePersistedJob(jobId: string): Promise<void> {
        try {
            await this.prisma.scheduledJob.delete({
                where: { jobId },
            });
            Logger.info(`Job '${jobId}' removed from database.`);
        } catch (error) {
            // Job might not exist in database, which is fine
            Logger.warn(`Could not remove job '${jobId}' from database (might not exist):`, error);
        }
    }

    /**
     * Load persisted jobs from the database and reschedule them.
     * Should be called on service startup.
     */
    public async loadPersistedJobs(): Promise<void> {
        try {
            Logger.info('Loading persisted jobs from database...');
            
            const scheduledJobs = await this.prisma.scheduledJob.findMany({
                where: {
                    status: 'SCHEDULED',
                },
                orderBy: {
                    fireDate: 'asc',
                },
            });

            const now = new Date();
            let restoredCount = 0;
            let missedCount = 0;

            for (const job of scheduledJobs) {
                if (job.fireDate <= now) {
                    // Job should have executed while bot was down
                    Logger.warn(`Job '${job.jobId}' missed execution time (${job.fireDate.toISOString()}). Marking as failed.`);
                    await this.markJobFailed(job.jobId, 'Missed execution due to bot downtime');
                    missedCount++;
                } else {
                    // Job is still in the future, reschedule it
                    try {
                        const jobData = job.jobData ? JSON.parse(job.jobData as string) : undefined;
                        
                        // Create a callback that will handle the job execution
                        // Note: This is a generic callback since we can't restore the original callback
                        const callback: JobCallback = async (data) => {
                            Logger.info(`Executing restored job '${job.jobId}' of type '${job.jobType}'`);
                            // Here you would dispatch to the appropriate handler based on jobType
                            await this.handleRestoredJob(job.jobType, job.jobId, data);
                        };

                        const nodeJob = schedule.scheduleJob(job.fireDate, async () => {
                            Logger.info(`Executing restored job '${job.jobId}'...`);
                            try {
                                await callback(jobData);
                                Logger.info(`Restored job '${job.jobId}' executed successfully.`);
                                await this.markJobExecuted(job.jobId);
                            } catch (error) {
                                Logger.error(`Error executing restored job '${job.jobId}':`, error);
                                await this.markJobFailed(job.jobId, error instanceof Error ? error.message : String(error));
                            }
                            this.scheduledJobs.delete(job.jobId);
                        });

                        if (nodeJob) {
                            this.scheduledJobs.set(job.jobId, nodeJob);
                            restoredCount++;
                            Logger.info(`Restored job '${job.jobId}' scheduled for ${job.fireDate.toISOString()}`);
                        } else {
                            Logger.warn(`Failed to restore job '${job.jobId}'. Marking as failed.`);
                            await this.markJobFailed(job.jobId, 'Failed to reschedule on startup');
                        }
                    } catch (error) {
                        Logger.error(`Error restoring job '${job.jobId}':`, error);
                        await this.markJobFailed(job.jobId, `Restoration error: ${error instanceof Error ? error.message : String(error)}`);
                    }
                }
            }

            Logger.info(`Job restoration complete. Restored: ${restoredCount}, Missed: ${missedCount}`);
        } catch (error) {
            Logger.error('Error loading persisted jobs:', error);
        }
    }

    /**
     * Determines which turn service to use for a given turn based on the game type.
     * @param turnId The ID of the turn
     * @returns The appropriate turn service or null if not found
     */
    private async getTurnServiceForTurn(turnId: string): Promise<TurnTimeoutService | null> {
        try {
            const turn = await this.prisma.turn.findUnique({
                where: { id: turnId },
                include: {
                    game: {
                        include: {
                            season: true
                        }
                    }
                }
            });

            if (!turn) {
                return null;
            }

            // If the game has a season, use SeasonTurnService
            if (turn.game.season) {
                return this.dependencies.seasonTurnService || null;
            } else {
                // Otherwise, use OnDemandTurnService
                return this.dependencies.onDemandTurnService || null;
            }
        } catch (error) {
            Logger.error(`Error determining turn service for turn ${turnId}:`, error);
            return null;
        }
    }

    /**
     * Handle execution of a restored job based on its type.
     * This method should be extended to handle different job types.
     * @param jobType The type of job to handle.
     * @param jobId The job ID.
     * @param jobData The job data.
     */
    private async handleRestoredJob(jobType: string, jobId: string, jobData?: JobData): Promise<void> {
        switch (jobType) {
            case 'season-activation':
                await this.handleSeasonActivationJob(jobId, jobData);
                break;
            case 'turn-claim-timeout':
                await this.handleClaimTimeoutJob(jobId, jobData);
                break;
            case 'turn-submission-timeout':
                await this.handleSubmissionTimeoutJob(jobId, jobData);
                break;
            default:
                Logger.warn(`No handler implemented for job type '${jobType}' (job ID: '${jobId}'). Job will be marked as failed.`);
                throw new Error(`No handler for job type: ${jobType}`);
        }
    }

    /**
     * Handle a season activation job.
     * @param jobId The job ID.
     * @param jobData The job data.
     */
    private async handleSeasonActivationJob(jobId: string, jobData?: JobData): Promise<void> {
        // Extract season ID from job ID (format: "season-activation-{seasonId}")
        const seasonId = jobId.replace('season-activation-', '');
        
        if (!seasonId) {
            throw new Error(`Invalid season activation job ID format: ${jobId}`);
        }

        Logger.info(`Handling season activation job for season ${seasonId}`);
        
        // Check if we have the required dependency for season service
        if (!this.dependencies.seasonService) {
            throw new Error(`Missing SeasonService dependency for season activation handler`);
        }

        // Call the season service to handle the open duration timeout
        await this.dependencies.seasonService.handleOpenDurationTimeout(seasonId);

        Logger.info(`Successfully handled season activation timeout for season ${seasonId}`);
    }

    /**
     * Handle a claim timeout job.
     * @param jobId The job ID (format: "turn-claim-timeout-{turnId}").
     * @param jobData The job data containing turnId and playerId.
     */
    private async handleClaimTimeoutJob(jobId: string, jobData?: JobData): Promise<void> {
        // Extract turn ID from job ID (format: "turn-claim-timeout-{turnId}")
        const turnId = jobId.replace('turn-claim-timeout-', '');
        
        if (!turnId) {
            throw new Error(`Invalid claim timeout job ID format: ${jobId}`);
        }

        // Validate job data and type guard
        if (!jobData || !('turnId' in jobData) || !('playerId' in jobData)) {
            throw new Error(`Invalid job data for claim timeout job ${jobId}: missing turnId or playerId`);
        }

        const claimTimeoutData = jobData as ClaimTimeoutJobData;
        const { turnId: dataTransId, playerId } = claimTimeoutData;
        
        // Ensure turnId from job ID matches turnId from job data
        if (turnId !== dataTransId) {
            throw new Error(`Turn ID mismatch in claim timeout job ${jobId}: ${turnId} vs ${dataTransId}`);
        }

        Logger.info(`Handling claim timeout job for turn ${turnId}, player ${playerId}`);

        // Check if we have the required dependencies
        if (!this.dependencies.discordClient || (!this.dependencies.seasonTurnService && !this.dependencies.onDemandTurnService) || !this.dependencies.turnOfferingService) {
            throw new Error(`Missing dependencies for claim timeout handler. Required: discordClient, (seasonTurnService OR onDemandTurnService), turnOfferingService`);
        }

        // Determine which turn service to use based on the game type
        const turnService = await this.getTurnServiceForTurn(turnId);
        if (!turnService) {
            throw new Error(`Could not determine appropriate turn service for turn ${turnId}`);
        }

        // Import and create the ClaimTimeoutHandler
        const { ClaimTimeoutHandler } = await import('../handlers/ClaimTimeoutHandler.js');
        const claimTimeoutHandler = new ClaimTimeoutHandler(
            this.prisma,
            this.dependencies.discordClient,
            turnService,
            this.dependencies.turnOfferingService
        );

        // Execute the claim timeout handling
        const result = await claimTimeoutHandler.handleClaimTimeout(turnId, playerId);

        if (!result.success) {
            throw new Error(`Claim timeout handling failed for turn ${turnId}: ${result.error}`);
        }

        Logger.info(`Successfully handled claim timeout for turn ${turnId}`);
    }

    /**
     * Handle a submission timeout job.
     * @param jobId The job ID (format: "turn-submission-timeout-{turnId}").
     * @param jobData The job data containing turnId and playerId.
     */
    private async handleSubmissionTimeoutJob(jobId: string, jobData?: JobData): Promise<void> {
        // Extract turn ID from job ID (format: "turn-submission-timeout-{turnId}")
        const turnId = jobId.replace('turn-submission-timeout-', '');
        
        if (!turnId) {
            throw new Error(`Invalid submission timeout job ID format: ${jobId}`);
        }

        // Validate job data and type guard
        if (!jobData || !('turnId' in jobData) || !('playerId' in jobData)) {
            throw new Error(`Invalid job data for submission timeout job ${jobId}: missing turnId or playerId`);
        }

        const submissionTimeoutData = jobData as SubmissionTimeoutJobData;
        const { turnId: dataTransId, playerId } = submissionTimeoutData;
        
        // Ensure turnId from job ID matches turnId from job data
        if (turnId !== dataTransId) {
            throw new Error(`Turn ID mismatch in submission timeout job ${jobId}: ${turnId} vs ${dataTransId}`);
        }

        Logger.info(`Handling submission timeout job for turn ${turnId}, player ${playerId}`);

        // Check if we have the required dependencies
        if (!this.dependencies.discordClient || (!this.dependencies.seasonTurnService && !this.dependencies.onDemandTurnService) || !this.dependencies.turnOfferingService) {
            throw new Error(`Missing dependencies for submission timeout handler. Required: discordClient, (seasonTurnService OR onDemandTurnService), turnOfferingService`);
        }

        // Determine which turn service to use based on the game type
        const turnService = await this.getTurnServiceForTurn(turnId);
        if (!turnService) {
            throw new Error(`Could not determine appropriate turn service for turn ${turnId}`);
        }

        // Import and create the SubmissionTimeoutHandler
        const { SubmissionTimeoutHandler } = await import('../handlers/SubmissionTimeoutHandler.js');
        const submissionTimeoutHandler = new SubmissionTimeoutHandler(
            this.prisma,
            this.dependencies.discordClient,
            turnService,
            this.dependencies.turnOfferingService
        );

        // Execute the submission timeout handling
        const result = await submissionTimeoutHandler.handleSubmissionTimeout(turnId, playerId);

        if (!result.success) {
            throw new Error(`Submission timeout handling failed for turn ${turnId}: ${result.error}`);
        }

        Logger.info(`Successfully handled submission timeout for turn ${turnId}`);
    }
} 