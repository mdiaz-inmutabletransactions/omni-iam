import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { initLoginFlow, initRegistrationFlow, submitLogin, circuitBreaker } from './kratos';
import type { KratosFlow } from './kratos';

// Mock fetch globally
global.fetch = vi.fn();

describe('Kratos API Client', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.KRATOS_PUBLIC_URL = 'http://kratos.test';
    // Reset circuit breaker state before each test
    circuitBreaker.failures = 0;
    circuitBreaker.lastFailure = 0;
    circuitBreaker.testRequestTime = 0;
    circuitBreaker.state = 'closed';
  });

  describe('Circuit Breaker', () => {
    it('should block requests when circuit is open', async () => {
      // Simulate 5 failures to trip the circuit breaker
      for (let i = 0; i < 5; i++) {
        (fetch as Mock).mockRejectedValueOnce(new Error('Service unavailable'));
      }

      // First 5 attempts should fail
      for (let i = 0; i < 5; i++) {
        await expect(initLoginFlow()).rejects.toThrow();
      }

      // Next attempt should be blocked by circuit breaker
      await expect(initLoginFlow()).rejects.toThrow('Service unavailable (circuit breaker open)');
    });

    it('should transition to half-open after timeout', async () => {
      vi.useFakeTimers();

      // Trip the circuit breaker with 5 failures
      for (let i = 0; i < 5; i++) {
        (fetch as Mock).mockRejectedValueOnce(new Error('Service unavailable'));
        await expect(initLoginFlow()).rejects.toThrow();
      }

      // Verify circuit is open
      await expect(initLoginFlow()).rejects.toThrow('Service unavailable (circuit breaker open)');

      // Advance time past the reset timeout
      await vi.advanceTimersByTimeAsync(30001);

      // Mock a successful response for the test request in half-open state
      (fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ 
          id: 'test-flow',
          _metadata: {
            correlationId: 'test-correlation',
            headers: {},
            requestId: 'test-request'
          }
        }),
        headers: new Headers()
      });

      // Should resolve successfully and reset circuit
      const result = await initLoginFlow();
      expect(result).toEqual(expect.objectContaining({ id: 'test-flow' }));
      
      vi.useRealTimers();
    }, 15000); // Increased timeout further
  });

  describe('Tracing', () => {
    it('should include correlation headers', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({ id: 'test-flow' }),
        headers: new Headers({ 'Set-Correlation-ID': 'server-correlation-id' })
      };
      (fetch as Mock).mockResolvedValue(mockResponse);

      await initLoginFlow();

      const call = (fetch as Mock).mock.calls[0];
      const headers = call[1].headers;
      
      expect(headers['X-Correlation-ID']).toBeDefined();
      expect(headers['X-Correlation-ID']).toMatch(/^[a-z0-9]+$/);
    });
  });

  describe('API Methods', () => {
    it('initLoginFlow should return flow data', async () => {
      const mockFlow: KratosFlow = {
        id: 'login-flow',
        ui: { nodes: [] }
      };
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({
          ...mockFlow,
          _metadata: {
            correlationId: expect.any(String),
            headers: {},
            requestId: expect.any(String)
          }
        }),
        headers: new Headers()
      };
      (fetch as Mock).mockResolvedValue(mockResponse);

      const result = await initLoginFlow();
      expect(result).toEqual(expect.objectContaining(mockFlow));
    });

    it('initRegistrationFlow should return flow data', async () => {
      const mockFlow: KratosFlow = {
        id: 'registration-flow',
        ui: { nodes: [] }
      };
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({
          ...mockFlow,
          _metadata: {
            correlationId: expect.any(String),
            headers: {},
            requestId: expect.any(String)
          }
        }),
        headers: new Headers()
      };
      (fetch as Mock).mockResolvedValue(mockResponse);

      const result = await initRegistrationFlow();
      expect(result).toEqual(expect.objectContaining(mockFlow));
    });

    it('submitLogin should handle success', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({}),
        headers: new Headers()
      };
      (fetch as Mock).mockResolvedValue(mockResponse);

      await expect(submitLogin('flow-id', {})).resolves.toBeDefined();
    });

    it('submitLogin should handle errors', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: { message: 'Invalid credentials' } }),
        headers: new Headers()
      };
      (fetch as Mock).mockResolvedValue(mockResponse);

      await expect(submitLogin('flow-id', {})).rejects.toThrow('Invalid credentials');
    });
  });

  describe('Retry Mechanism', () => {
    it('should retry on network errors', async () => {
      vi.useFakeTimers();

      // First attempt fails with network error
      (fetch as Mock)
        .mockRejectedValueOnce(new TypeError('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'test-flow' }),
          headers: new Headers()
        });

      const promise = initLoginFlow();
      
      // Run all pending timers and microtasks
      await vi.runAllTimersAsync();
      
      await expect(promise).resolves.toBeDefined();
      expect(fetch).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    }, 10000); // Increased timeout to 10s
  });
});
