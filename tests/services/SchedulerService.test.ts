import { describe, it, expect, beforeEach, afterAll, vi, beforeAll, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { SchedulerService } from '../../src/services/SchedulerService.js';
import { truncateTables } from '../utils/testUtils.js';

// Mock logger to prevent console output during tests
vi.mock('../../src/services/logger.js', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('SchedulerService', () => {
  let prisma: PrismaClient;
  let schedulerService: SchedulerService;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    });
  });

  beforeEach(async () => {
    await truncateTables(prisma);
    schedulerService = new SchedulerService(prisma);
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up any scheduled jobs after each test
    schedulerService.cancelAllJobs();
  });

  afterAll(async () => {
    await truncateTables(prisma);
    await prisma.$disconnect();
  });

  describe('Basic Job Scheduling', () => {
    it('should schedule a job and persist it to database', async () => {
      const jobId = `test-job-1-${Date.now()}`;
      const fireDate = new Date(Date.now() + 1000); // 1 second from now
      const callback = vi.fn();
      const jobData = { seasonId: 'test-season' };
      const jobType = 'season-activation';

      const result = await schedulerService.scheduleJob(jobId, fireDate, callback, jobData, jobType);

      expect(result).toBe(true);

      // Verify job was persisted to database
      const persistedJob = await prisma.scheduledJob.findUnique({
        where: { jobId },
      });

      expect(persistedJob).toBeDefined();
      expect(persistedJob?.jobId).toBe(jobId);
      expect(persistedJob?.fireDate).toEqual(fireDate);
      expect(persistedJob?.jobType).toBe(jobType);
      expect(persistedJob?.status).toBe('SCHEDULED');
      expect(JSON.parse(persistedJob?.jobData as string)).toEqual(jobData);
    });

    it('should not schedule a job with a past fire date', async () => {
      const jobId = `test-job-past-${Date.now()}`;
      const fireDate = new Date(Date.now() - 60000); // 1 minute ago
      const callback = vi.fn();

      const result = await schedulerService.scheduleJob(jobId, fireDate, callback);

      expect(result).toBe(false);

      // Verify job was not persisted to database
      const persistedJob = await prisma.scheduledJob.findUnique({
        where: { jobId },
      });

      expect(persistedJob).toBeNull();
    });

    it('should not schedule a job with duplicate ID', async () => {
      const jobId = `test-job-duplicate-${Date.now()}`;
      const fireDate = new Date(Date.now() + 1000);
      const callback = vi.fn();

      // Schedule first job
      const result1 = await schedulerService.scheduleJob(jobId, fireDate, callback);
      expect(result1).toBe(true);

      // Try to schedule duplicate
      const result2 = await schedulerService.scheduleJob(jobId, fireDate, callback);
      expect(result2).toBe(false);

      // Verify only one job exists in database
      const persistedJobs = await prisma.scheduledJob.findMany({
        where: { jobId },
      });

      expect(persistedJobs).toHaveLength(1);
    });
  });

  describe('Job Cancellation', () => {
    it('should cancel a scheduled job and mark it as cancelled in database', async () => {
      const jobId = `test-job-cancel-${Date.now()}`;
      const fireDate = new Date(Date.now() + 5000); // 5 seconds from now
      const callback = vi.fn();

      // Schedule job first
      await schedulerService.scheduleJob(jobId, fireDate, callback);

      // Cancel job
      const result = await schedulerService.cancelJob(jobId);

      expect(result).toBe(true);

      // Verify job was marked as cancelled in database
      const persistedJob = await prisma.scheduledJob.findUnique({
        where: { jobId },
      });

      expect(persistedJob?.status).toBe('CANCELLED');
      expect(persistedJob?.executedAt).toBeDefined();
    });

    it('should return false when trying to cancel non-existent job', async () => {
      const result = await schedulerService.cancelJob(`non-existent-job-${Date.now()}`);

      expect(result).toBe(false);
    });
  });

  describe('Job Execution with Real Timers', () => {
    it('should execute job callback and mark as executed in database', async () => {
      const jobId = `test-job-execute-${Date.now()}`;
      const fireDate = new Date(Date.now() + 100); // 100ms from now
      const callback = vi.fn().mockResolvedValue(undefined);

      await schedulerService.scheduleJob(jobId, fireDate, callback);

      // Wait for job to execute
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(callback).toHaveBeenCalledTimes(1);

      // Verify job was marked as executed
      const persistedJob = await prisma.scheduledJob.findUnique({
        where: { jobId },
      });

      expect(persistedJob?.status).toBe('EXECUTED');
      expect(persistedJob?.executedAt).toBeDefined();
    });

    it('should mark job as failed when callback throws error', async () => {
      const jobId = `test-job-fail-${Date.now()}`;
      const fireDate = new Date(Date.now() + 100);
      const callback = vi.fn().mockRejectedValue(new Error('Test error'));

      await schedulerService.scheduleJob(jobId, fireDate, callback);

      // Wait for job to execute and fail
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(callback).toHaveBeenCalledTimes(1);

      // Verify job was marked as failed
      const persistedJob = await prisma.scheduledJob.findUnique({
        where: { jobId },
      });

      expect(persistedJob?.status).toBe('FAILED');
      expect(persistedJob?.failureReason).toBe('Test error');
      expect(persistedJob?.executedAt).toBeDefined();
    });
  });

  describe('Job Persistence and Recovery', () => {
    it('should restore scheduled jobs from database on startup', async () => {
      const jobId = `test-job-restore-${Date.now()}`;
      const fireDate = new Date(Date.now() + 5000); // 5 seconds from now
      const jobType = 'season-activation';
      const jobData = { seasonId: 'test-season' };

      // Create a job directly in database (simulating a job that was scheduled before restart)
      await prisma.scheduledJob.create({
        data: {
          jobId,
          fireDate,
          jobType,
          jobData: JSON.stringify(jobData),
          status: 'SCHEDULED',
        },
      });

      // Create new scheduler instance to simulate restart
      const newSchedulerService = new SchedulerService(prisma);
      
      // Load persisted jobs
      await newSchedulerService.loadPersistedJobs();

      // Verify the job is still in database with SCHEDULED status
      const restoredJob = await prisma.scheduledJob.findUnique({
        where: { jobId },
      });

      expect(restoredJob?.status).toBe('SCHEDULED');
      expect(restoredJob?.jobType).toBe(jobType);

      // Clean up
      newSchedulerService.cancelAllJobs();
    });

    it('should mark missed jobs as failed during recovery', async () => {
      const jobId = `test-job-missed-${Date.now()}`;
      const fireDate = new Date(Date.now() - 60000); // 1 minute ago (missed)
      const jobType = 'season-activation';

      // Create a missed job in database
      await prisma.scheduledJob.create({
        data: {
          jobId,
          fireDate,
          jobType,
          status: 'SCHEDULED',
        },
      });

      // Load persisted jobs
      await schedulerService.loadPersistedJobs();

      // Verify the missed job was marked as failed
      const updatedJob = await prisma.scheduledJob.findUnique({
        where: { jobId },
      });

      expect(updatedJob?.status).toBe('FAILED');
      expect(updatedJob?.failureReason).toBe('Missed execution due to bot downtime');
    });

    it('should handle multiple jobs during recovery', async () => {
      const jobs = [
        {
          jobId: `test-job-future-${Date.now()}-1`,
          fireDate: new Date(Date.now() + 5000),
          status: 'SCHEDULED'
        },
        {
          jobId: `test-job-future-${Date.now()}-2`,
          fireDate: new Date(Date.now() + 10000),
          status: 'SCHEDULED'
        },
        {
          jobId: `test-job-missed-${Date.now()}-1`,
          fireDate: new Date(Date.now() - 30000),
          status: 'SCHEDULED'
        }
      ];

      // Create jobs in database
      for (const job of jobs) {
        await prisma.scheduledJob.create({
          data: {
            jobId: job.jobId,
            fireDate: job.fireDate,
            jobType: 'test-type',
            status: job.status,
          },
        });
      }

      // Load persisted jobs
      await schedulerService.loadPersistedJobs();

      // Check that future jobs are still scheduled and missed job is failed
      const futureJob1 = await prisma.scheduledJob.findUnique({
        where: { jobId: jobs[0].jobId },
      });
      const futureJob2 = await prisma.scheduledJob.findUnique({
        where: { jobId: jobs[1].jobId },
      });
      const missedJob = await prisma.scheduledJob.findUnique({
        where: { jobId: jobs[2].jobId },
      });

      expect(futureJob1?.status).toBe('SCHEDULED');
      expect(futureJob2?.status).toBe('SCHEDULED');
      expect(missedJob?.status).toBe('FAILED');
    });
  });

  describe('Stress Testing and Concurrency', () => {
    it('should handle concurrent job scheduling without conflicts', async () => {
      const jobCount = 50;
      const promises: Promise<boolean>[] = [];
      const timestamp = Date.now(); // Capture timestamp once

      // Schedule multiple jobs concurrently
      for (let i = 0; i < jobCount; i++) {
        const jobId = `stress-test-job-${timestamp}-${i}`;
        const fireDate = new Date(timestamp + 1000 + (i * 100)); // Stagger execution times
        const callback = vi.fn();
        
        promises.push(schedulerService.scheduleJob(jobId, fireDate, callback));
      }

      const results = await Promise.all(promises);

      // All jobs should be scheduled successfully
      expect(results.every(result => result === true)).toBe(true);

      // Verify all jobs are in database
      const persistedJobs = await prisma.scheduledJob.findMany({
        where: {
          jobId: {
            startsWith: `stress-test-job-${timestamp}` // Use the same timestamp
          }
        }
      });

      expect(persistedJobs.length).toBe(jobCount);
    });

    it('should handle concurrent job cancellation', async () => {
      const jobCount = 20;
      const jobIds: string[] = [];

      // Schedule jobs first
      for (let i = 0; i < jobCount; i++) {
        const jobId = `cancel-stress-test-${Date.now()}-${i}`;
        const fireDate = new Date(Date.now() + 10000); // 10 seconds from now
        const callback = vi.fn();
        
        await schedulerService.scheduleJob(jobId, fireDate, callback);
        jobIds.push(jobId);
      }

      // Cancel all jobs concurrently
      const cancelPromises = jobIds.map(jobId => schedulerService.cancelJob(jobId));
      const cancelResults = await Promise.all(cancelPromises);

      // All cancellations should succeed
      expect(cancelResults.every(result => result === true)).toBe(true);

      // Verify all jobs are marked as cancelled
      const cancelledJobs = await prisma.scheduledJob.findMany({
        where: {
          jobId: { in: jobIds },
          status: 'CANCELLED'
        }
      });

      expect(cancelledJobs.length).toBe(jobCount);
    });
  });

  describe('Database Transaction and Error Handling', () => {
    it('should handle invalid callback during job execution', async () => {
      const jobId = `test-invalid-callback-${Date.now()}`;
      const fireDate = new Date(Date.now() + 100);
      
      // Provide an invalid callback that will fail during execution
      const invalidCallback = null as any;

      const result = await schedulerService.scheduleJob(jobId, fireDate, invalidCallback);

      // Job scheduling should succeed (validation happens at execution time)
      expect(result).toBe(true);

      // Wait for job to execute and fail
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify job was marked as failed in database
      const persistedJob = await prisma.scheduledJob.findUnique({
        where: { jobId },
      });

      expect(persistedJob?.status).toBe('FAILED');
      expect(persistedJob?.failureReason).toContain('callback is not a function');
    });

    it('should handle database errors gracefully during job scheduling', async () => {
      const jobId = `test-db-error-${Date.now()}`;
      const fireDate = new Date(Date.now() + 1000);
      const callback = vi.fn();

      // Create a scheduler with an invalid database URL to simulate DB error
      const faultyPrisma = new PrismaClient({
        datasources: {
          db: {
            url: 'postgresql://invalid:invalid@localhost:9999/invalid'
          }
        }
      });
      
      const faultyScheduler = new SchedulerService(faultyPrisma);

      const result = await faultyScheduler.scheduleJob(jobId, fireDate, callback);

      expect(result).toBe(false);

      // Verify job was not persisted (using our working prisma instance)
      const persistedJob = await prisma.scheduledJob.findUnique({
        where: { jobId },
      });

      expect(persistedJob).toBeNull();
      
      // Clean up
      await faultyPrisma.$disconnect();
    });

    it('should rollback job creation if database persistence fails', async () => {
      const jobId = `test-rollback-${Date.now()}`;
      const fireDate = new Date(Date.now() + 1000);
      const callback = vi.fn();

      // Create a job with an invalid jobType that might cause database constraint issues
      // First, let's create a job that will succeed
      const result1 = await schedulerService.scheduleJob(jobId, fireDate, callback);
      expect(result1).toBe(true);

      // Try to create the same job again (should fail due to unique constraint)
      const result2 = await schedulerService.scheduleJob(jobId, fireDate, callback);
      expect(result2).toBe(false);

      // Verify only one job exists in database
      const persistedJobs = await prisma.scheduledJob.findMany({
        where: { jobId },
      });

      expect(persistedJobs).toHaveLength(1);
    });
  });

  describe('Timezone and Edge Cases', () => {
    it('should handle jobs scheduled across timezone boundaries', async () => {
      const jobId = `timezone-test-${Date.now()}`;
      
      // Create a date in a different timezone (UTC)
      const utcDate = new Date();
      utcDate.setUTCHours(utcDate.getUTCHours() + 1); // 1 hour from now in UTC
      
      const callback = vi.fn();

      const result = await schedulerService.scheduleJob(jobId, utcDate, callback);

      expect(result).toBe(true);

      const persistedJob = await prisma.scheduledJob.findUnique({
        where: { jobId },
      });

      expect(persistedJob?.fireDate).toEqual(utcDate);
    });

    it('should handle edge case of scheduling at exact current time', async () => {
      const jobId = `edge-case-now-${Date.now()}`;
      const fireDate = new Date(); // Current time
      const callback = vi.fn();

      // This should fail because the time might be in the past by the time it's processed
      const result = await schedulerService.scheduleJob(jobId, fireDate, callback);

      expect(result).toBe(false);
    });

    it('should handle very far future dates', async () => {
      const jobId = `far-future-${Date.now()}`;
      const fireDate = new Date('2030-01-01T00:00:00Z'); // Far in the future
      const callback = vi.fn();

      const result = await schedulerService.scheduleJob(jobId, fireDate, callback);

      expect(result).toBe(true);

      const persistedJob = await prisma.scheduledJob.findUnique({
        where: { jobId },
      });

      expect(persistedJob?.fireDate).toEqual(fireDate);
    });
  });

  describe('Memory Management and Cleanup', () => {
    it('should clean up completed jobs from memory', async () => {
      const jobId = `cleanup-test-${Date.now()}`;
      const fireDate = new Date(Date.now() + 100);
      const callback = vi.fn();

      await schedulerService.scheduleJob(jobId, fireDate, callback);

      // Wait for job to execute
      await new Promise(resolve => setTimeout(resolve, 200));

      // Job should be executed and cleaned up from memory
      // (We can't directly test internal state, but we can verify the job executed)
      expect(callback).toHaveBeenCalledTimes(1);

      const persistedJob = await prisma.scheduledJob.findUnique({
        where: { jobId },
      });

      expect(persistedJob?.status).toBe('EXECUTED');
    });

    it('should handle cancelAllJobs without errors', async () => {
      // Schedule multiple jobs
      const jobIds: string[] = [];
      for (let i = 0; i < 5; i++) {
        const jobId = `cleanup-all-${Date.now()}-${i}`;
        const fireDate = new Date(Date.now() + 5000);
        const callback = vi.fn();
        
        await schedulerService.scheduleJob(jobId, fireDate, callback);
        jobIds.push(jobId);
      }

      // Cancel all jobs
      expect(() => schedulerService.cancelAllJobs()).not.toThrow();

      // Note: cancelAllJobs only cancels in-memory jobs, not database records
      // This is by design for the current implementation
    });
  });

  describe('Job Data Serialization', () => {
    it('should properly serialize and deserialize complex job data', async () => {
      const jobId = `serialization-test-${Date.now()}`;
      const fireDate = new Date(Date.now() + 1000);
      const callback = vi.fn();
      const complexJobData = {
        seasonId: 'test-season',
        players: ['player1', 'player2'],
        config: {
          timeout: 30000,
          retries: 3
        },
        metadata: {
          createdBy: 'test-user',
          timestamp: new Date().toISOString()
        }
      };

      const result = await schedulerService.scheduleJob(jobId, fireDate, callback, complexJobData, 'complex-test');

      expect(result).toBe(true);

      const persistedJob = await prisma.scheduledJob.findUnique({
        where: { jobId },
      });

      expect(persistedJob).toBeDefined();
      expect(JSON.parse(persistedJob?.jobData as string)).toEqual(complexJobData);
    });

    it('should handle null or undefined job data', async () => {
      const jobId = `null-data-test-${Date.now()}`;
      const fireDate = new Date(Date.now() + 1000);
      const callback = vi.fn();

      const result = await schedulerService.scheduleJob(jobId, fireDate, callback, undefined);

      expect(result).toBe(true);

      const persistedJob = await prisma.scheduledJob.findUnique({
        where: { jobId },
      });

      expect(persistedJob?.jobData).toBeNull();
    });
  });
}); 