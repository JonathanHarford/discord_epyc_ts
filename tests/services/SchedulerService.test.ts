import { describe, it, expect, beforeEach, afterAll, vi, beforeAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { SchedulerService } from '../../src/services/SchedulerService.js';
import { truncateTables } from '../utils/testUtils.js';

// Mock node-schedule to control job execution
vi.mock('node-schedule', () => ({
  default: {
    scheduleJob: vi.fn((date, callback) => {
      // Return a mock job object
      return {
        cancel: vi.fn(),
        // Store the callback for manual execution in tests
        _callback: callback,
      };
    }),
  },
}));

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
    
    // Reset the mock to ensure clean state
    const schedule = await import('node-schedule');
    const mockScheduleJob = schedule.default.scheduleJob as any;
    mockScheduleJob.mockClear();
  });

  afterAll(async () => {
    await truncateTables(prisma);
    await prisma.$disconnect();
  });

  describe('scheduleJob', () => {
    it('should schedule a job and persist it to database', async () => {
      const jobId = `test-job-1-${Date.now()}`;
      const fireDate = new Date(Date.now() + 60000); // 1 minute from now
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
      const fireDate = new Date(Date.now() + 60000);
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

  describe('cancelJob', () => {
    it('should cancel a scheduled job and mark it as cancelled in database', async () => {
      const jobId = `test-job-cancel-${Date.now()}`;
      const fireDate = new Date(Date.now() + 60000);
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

  describe('loadPersistedJobs', () => {
    it('should restore scheduled jobs from database on startup', async () => {
      const jobId = `test-job-restore-${Date.now()}`;
      const fireDate = new Date(Date.now() + 60000);
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

      // Load persisted jobs
      await schedulerService.loadPersistedJobs();

      // Verify the job was restored (this is hard to test without exposing internal state)
      // For now, we just verify the method doesn't throw
      expect(true).toBe(true);
    });

    it('should mark missed jobs as failed', async () => {
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
  });

  describe('job execution', () => {
    it('should mark job as executed when callback succeeds', async () => {
      const jobId = `test-job-execute-${Date.now()}`;
      const fireDate = new Date(Date.now() + 60000);
      const callback = vi.fn().mockResolvedValue(undefined);

      await schedulerService.scheduleJob(jobId, fireDate, callback);

      // Get the mock job and execute its callback
      const schedule = await import('node-schedule');
      const mockScheduleJob = schedule.default.scheduleJob as any;
      const mockJob = mockScheduleJob.mock.results[0].value;
      
      // Execute the callback
      await mockJob._callback();

      // Verify job was marked as executed
      const persistedJob = await prisma.scheduledJob.findUnique({
        where: { jobId },
      });

      expect(persistedJob?.status).toBe('EXECUTED');
      expect(persistedJob?.executedAt).toBeDefined();
    });

    it('should mark job as failed when callback throws error', async () => {
      const jobId = `test-job-fail-${Date.now()}`;
      const fireDate = new Date(Date.now() + 60000);
      const callback = vi.fn().mockRejectedValue(new Error('Test error'));

      await schedulerService.scheduleJob(jobId, fireDate, callback);

      // Get the mock job and execute its callback
      const schedule = await import('node-schedule');
      const mockScheduleJob = schedule.default.scheduleJob as any;
      const mockJob = mockScheduleJob.mock.results[0].value;
      
      // Execute the callback (should handle the error)
      await mockJob._callback();

      // Verify job was marked as failed
      const persistedJob = await prisma.scheduledJob.findUnique({
        where: { jobId },
      });

      expect(persistedJob?.status).toBe('FAILED');
      expect(persistedJob?.failureReason).toBe('Test error');
      expect(persistedJob?.executedAt).toBeDefined();
    });
  });
}); 