/**
 * Minimal health-check test to validate the Spector mock server lifecycle.
 *
 * This test verifies that:
 * 1. The globalSetup successfully starts the Spector mock server on port 3002
 * 2. The server responds with HTTP 204 on the health-check endpoint
 * 3. The server serves the expected routes
 */
import http from "node:http";
import { describe, expect, it } from "vitest";

const SERVER_PORT = 3002;

function httpGet(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => resolve(res.statusCode ?? 0)).on("error", reject);
  });
}

describe("Spector server health check", () => {
  it("should respond with 204 on the routes health-check endpoint", async () => {
    const status = await httpGet(
      `http://localhost:${SERVER_PORT}/routes/in-interface/fixed`,
    );
    expect(status).toBe(204);
  });
});
