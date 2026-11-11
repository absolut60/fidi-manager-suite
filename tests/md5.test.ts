import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { md5 } from "../src/lib/md5";

describe("md5 delle righe importate", () => {
  test("uguale a md5 standard (come PostgreSQL), anche con accenti e testi lunghi", () => {
    for (const s of ["", "abc", "Saviedil è €", "x".repeat(55), "x".repeat(56), "y".repeat(5000)])
      expect(md5(s)).toBe(createHash("md5").update(s, "utf8").digest("hex"));
  });
});
