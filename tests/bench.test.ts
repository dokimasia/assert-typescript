/**
 * Performance ceilings.
 *
 * The timings here are deliberately far apart: a ceiling of zero
 * against work that sleeps, and a ceiling of a second against work
 * that returns. A test that depends on a machine being fast is a test
 * that fails in CI for no reason.
 */

import { expect, it } from "vitest";
import { Contract } from "../src/bench.js";
import { Recorder } from "../src/seat.js";

/** Work that takes measurable time. */
const slow = () => new Promise((resolve) => setTimeout(resolve, 5));

it("a run inside every ceiling reports nothing", async () => {
  const seat = new Recorder();
  const contract = new Contract(seat, "get stays quick").maxLatency(1000).maxMean(1000);

  await contract.loop(10, () => undefined);
  contract.check();

  expect(seat.failed, seat.message).toBe(false);
});

it("a run over the latency ceiling is reported", async () => {
  const seat = new Recorder();
  const contract = new Contract(seat, "get stays quick").maxLatency(0);

  await contract.loop(2, slow);
  contract.check();

  expect(seat.failed).toBe(true);
  expect(seat.failures[0]?.assertion).toBe("bench-max-latency");
});

it("a run over the mean ceiling is reported", async () => {
  const seat = new Recorder();
  const contract = new Contract(seat, "get stays quick").maxMean(0);

  await contract.loop(2, slow);
  contract.check();

  expect(seat.failed).toBe(true);
  expect(seat.failures[0]?.assertion).toBe("bench-max-mean");
});

it("checking without measuring is itself the failure", () => {
  const seat = new Recorder();
  new Contract(seat, "get stays quick").maxLatency(1).check();

  expect(seat.failed).toBe(true);
  expect(seat.message).toContain("nothing was measured");
});

it("a contract with no ceilings reports nothing", async () => {
  const seat = new Recorder();
  const contract = new Contract(seat, "get is measured");

  await contract.loop(5, () => undefined);
  contract.check();

  expect(seat.failed, seat.message).toBe(false);
});

it("ceilings chain", async () => {
  const seat = new Recorder();
  const contract = new Contract(seat, "get stays quick");

  expect(contract.maxLatency(1000)).toBe(contract);
  expect(contract.maxMean(1000)).toBe(contract);
  expect(await contract.loop(2, () => undefined)).toBe(contract);
});

it("the body runs exactly as many times as asked", async () => {
  let ran = 0;
  const contract = new Contract(new Recorder(), "get stays quick");

  await contract.loop(7, () => {
    ran += 1;
  });

  expect(ran).toBe(7);
});

it("under a hundred samples the p99 is the slowest one", async () => {
  // Reporting a p99 from ten samples would dress one reading up as a
  // distribution, so the message has to come from the slowest.
  const seat = new Recorder();
  const contract = new Contract(seat, "get stays quick").maxLatency(0);

  await contract.loop(3, slow);
  contract.check();

  expect(seat.failed).toBe(true);
});

it("awaits a body that answers a promise", async () => {
  const seat = new Recorder();
  const contract = new Contract(seat, "get stays quick").maxLatency(0);

  await contract.loop(1, slow);
  contract.check();

  // Were the body not awaited, the measurement would be near zero and
  // a ceiling of zero would pass.
  expect(seat.failed).toBe(true);
});
