import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { createTestDb } from "./pglite-db";

describe("PGlite test harness — smoke test", () => {
  it("applies all 21 real migrations and allows a real insert/query round-trip", async () => {
    const { db, client } = await createTestDb();
    try {
      const [inserted] = await db
        .insert(users)
        .values({ name: "Test Owner", email: "owner@example.com", passwordHash: "x", role: "owner" })
        .returning();
      expect(inserted.id).toBeTruthy();

      const [fetched] = await db.select().from(users).where(eq(users.id, inserted.id)).limit(1);
      expect(fetched?.email).toBe("owner@example.com");
      expect(fetched?.role).toBe("owner");
    } finally {
      await client.close();
    }
  });

  it("really enforces the users.email unique constraint (not just app-level validation)", async () => {
    const { db, client } = await createTestDb();
    try {
      await db.insert(users).values({ name: "A", email: "dup@example.com", passwordHash: "x", role: "customer" });
      await expect(
        db.insert(users).values({ name: "B", email: "dup@example.com", passwordHash: "y", role: "customer" }),
      ).rejects.toThrow();
    } finally {
      await client.close();
    }
  });
});
